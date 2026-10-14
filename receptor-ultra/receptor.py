#!/usr/bin/env python3
"""
Receptor de lecturas del RFID Ultra para Camberas (sustituye a Outreach).

El Ultra, en Settings › Remote › LAN, apunta a este servidor (URL = IP del
servidor, Port = el de config.json). Por cada conexión lee los bloques del
Ultra (lecturas de 31 bytes y un mensaje de estado cada segundo; protocolo
visto el 14-oct pasando el tráfico de Outreach) y guarda cada lectura en disco.
Dos maneras de trabajar, según config.json:

  · "outreach": ["82.113.145.105", 11111] → como siempre: el Ultra habla con
    Outreach a través de nosotros (Outreach contesta y RaceTec sigue igual) y
    nosotros solo leemos y subimos a Camberas. Si Outreach no está, contesta
    el receptor para no perder lecturas.
  · "outreach": null → contesta el receptor, igual que Outreach: «OK» + número
    de la última lectura (después de guardarla en disco) y 03 00 06 03 0d 0a
    al estado.

Un hilo aparte sube las lecturas a Camberas (RPC ultra_registrar_lecturas) en
lotes; si no hay internet, reintenta sin perder nada.

Solo usa la biblioteca estándar de Python 3.

Uso:
  python3 receptor.py [config.json]             recibe y sube
  python3 receptor.py --reenviar AAAA-MM-DD     vuelve a subir un día entero
                                                (p. ej. cuando se asignan chips
                                                que llegaron sin dorsal)
"""
import datetime
import json
import os
import socket
import struct
import sys
import threading
import time
import urllib.error
import urllib.request

EPOCA = datetime.datetime(1980, 1, 1)      # el Ultra cuenta segundos desde 1980, en hora local
RESPUESTA_ESTADO = b"\x03\x00\x06\x03\r\n"  # lo que contesta Outreach a cada mensaje de estado
LOTE = 500                                 # lecturas por llamada a Camberas


def ahora():
    return datetime.datetime.now().isoformat(sep=" ", timespec="milliseconds")


def log(*partes):
    print(ahora(), *partes, flush=True)


# ── Configuración ────────────────────────────────────────────────────────────
def cargar_config(ruta):
    with open(ruta, encoding="utf-8") as f:
        cfg = json.load(f)
    cfg.setdefault("puerto", 23023)
    cfg.setdefault("carpeta", "/root/ultra")
    cfg["tokens"] = {int(k): v for k, v in cfg.get("tokens", {}).items()}
    cfg["outreach"] = tuple(cfg["outreach"]) if cfg.get("outreach") else None
    for clave in ("camberas_url", "clave_publica"):
        if not cfg.get(clave):
            sys.exit(f"Falta «{clave}» en {ruta}")
    return cfg


# ── Protocolo del Ultra ──────────────────────────────────────────────────────
def leer_bloques(buf):
    """Saca del búfer los bloques completos. Devuelve (lecturas, estados, resto).

    Lectura: 02 1c 01 · nº(4) · chip(4) · segundos desde 1980(4) · ms(2) · …lector… · 03
             (todo en little-endian; 31 bytes)
    Estado:  03 LL … 03 0d 0a (LL bytes en total)
    """
    lecturas, estados, i = [], 0, 0
    while i < len(buf):
        tipo = buf[i]
        if tipo == 0x02 and i + 2 <= len(buf):
            total = buf[i + 1] + 3
            if i + total > len(buf):
                break
            b = buf[i:i + total]
            if total == 31 and b[2] == 0x01 and b[-1] == 0x03:
                num, chip, segs, ms = struct.unpack_from("<IIIH", b, 3)
                hora = EPOCA + datetime.timedelta(seconds=segs, milliseconds=ms)
                lecturas.append({"num": num, "chip": chip, "lector": b[20],
                                 "hora": hora.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]})
                i += total
                continue
        elif tipo == 0x03 and i + 2 <= len(buf):
            total = buf[i + 1]
            if i + total > len(buf):
                break
            if total >= 6 and buf[i + total - 3:i + total] == b"\x03\r\n":
                estados += 1
                i += total
                continue
        elif tipo in (0x02, 0x03):
            break                       # falta la cabecera: esperar más datos
        i += 1                          # byte suelto: resincronizar
    return lecturas, estados, buf[i:]


# ── Almacén en disco ─────────────────────────────────────────────────────────
class Almacen:
    """lecturas/AAAA-MM-DD.txt (para leer) y cola.jsonl + cola.pos (para subir)."""

    def __init__(self, carpeta):
        self.carpeta = carpeta
        os.makedirs(os.path.join(carpeta, "lecturas"), exist_ok=True)
        self.cola = os.path.join(carpeta, "cola.jsonl")
        self.pos = os.path.join(carpeta, "cola.pos")
        self.cerrojo = threading.Lock()
        self.vistas = set()
        hoy = datetime.date.today()
        for d in (hoy - datetime.timedelta(days=1), hoy):
            for l in self.leer_dia(d.isoformat()):
                self.vistas.add((l["lector"], l["num"], l["hora"]))

    def fichero_dia(self, dia):
        return os.path.join(self.carpeta, "lecturas", f"{dia}.txt")

    def leer_dia(self, dia):
        try:
            with open(self.fichero_dia(dia), encoding="utf-8") as f:
                for linea in f:
                    p = linea.rstrip("\n").split("\t")
                    if len(p) >= 4:
                        yield {"chip": int(p[0]), "hora": p[1], "num": int(p[2]), "lector": int(p[3])}
        except FileNotFoundError:
            return

    def guardar(self, lecturas):
        """Apunta las nuevas en disco (con fsync) y devuelve cuántas eran nuevas."""
        with self.cerrojo:
            nuevas = [l for l in lecturas if (l["lector"], l["num"], l["hora"]) not in self.vistas]
            if not nuevas:
                return 0
            por_dia = {}
            for l in nuevas:
                por_dia.setdefault(l["hora"][:10], []).append(l)
            for dia, ls in por_dia.items():
                with open(self.fichero_dia(dia), "a", encoding="utf-8") as f:
                    f.writelines(f"{l['chip']}\t{l['hora']}\t{l['num']}\t{l['lector']}\n" for l in ls)
                    f.flush()
                    os.fsync(f.fileno())
            with open(self.cola, "a", encoding="utf-8") as f:
                f.writelines(json.dumps(l) + "\n" for l in nuevas)
                f.flush()
                os.fsync(f.fileno())
            for l in nuevas:
                self.vistas.add((l["lector"], l["num"], l["hora"]))
            return len(nuevas)

    def pendientes(self, maximo):
        """(lecturas, posición final) de la cola sin subir."""
        with self.cerrojo:
            try:
                with open(self.pos) as f:
                    desde = int(f.read().strip() or 0)
            except (FileNotFoundError, ValueError):
                desde = 0
            try:
                with open(self.cola, "rb") as f:
                    f.seek(desde)
                    lecturas, fin = [], desde
                    for linea in f:
                        if not linea.endswith(b"\n"):
                            break
                        lecturas.append(json.loads(linea))
                        fin += len(linea)
                        if len(lecturas) >= maximo:
                            break
            except FileNotFoundError:
                return [], 0
            return lecturas, fin

    def subidas_hasta(self, fin):
        with self.cerrojo:
            # Cola entera subida y grande: se vacía para que no crezca sin fin
            if os.path.exists(self.cola) and os.path.getsize(self.cola) == fin and fin > 10_000_000:
                open(self.cola, "w").close()
                fin = 0
            tmp = self.pos + ".tmp"
            with open(tmp, "w") as f:
                f.write(str(fin))
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.pos)


# ── Subida a Camberas ────────────────────────────────────────────────────────
def subir(cfg, lector, lecturas):
    """Una llamada a la RPC. Devuelve el resumen de Camberas o lanza excepción."""
    token = cfg["tokens"].get(lector) or cfg["tokens"].get(0)
    if not token:
        raise RuntimeError(f"no hay token para el lector {lector} en config.json")
    cuerpo = json.dumps({"p_token": token, "p_lector": lector,
                         "p_lecturas": [{"num": l["num"], "chip": l["chip"], "hora": l["hora"]} for l in lecturas]})
    peticion = urllib.request.Request(
        cfg["camberas_url"].rstrip("/") + "/rest/v1/rpc/ultra_registrar_lecturas",
        data=cuerpo.encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "apikey": cfg["clave_publica"],
                 "Authorization": "Bearer " + cfg["clave_publica"]})
    try:
        with urllib.request.urlopen(peticion, timeout=20) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Camberas respondió {e.code}: {e.read()[:300].decode('utf-8', 'replace')}")


def resumen(lector, res):
    texto = (f"lector {lector}: {res.get('insertadas', 0)} nuevas, {res.get('repetidas', 0)} ya estaban, "
             f"{res.get('fuera_de_ventana', 0)} fuera de la ventana de carrera")
    if res.get("sin_dorsal"):
        texto += f", {res['sin_dorsal']} sin dorsal (chips {', '.join(map(str, res.get('chips_sin_dorsal', [])[:10]))})"
    return texto


def hilo_subida(cfg, almacen):
    espera = 2
    while True:
        lecturas, fin = almacen.pendientes(LOTE)
        if not lecturas:
            time.sleep(2)
            continue
        try:
            por_lector = {}
            for l in lecturas:
                por_lector.setdefault(l["lector"], []).append(l)
            for lector, ls in por_lector.items():
                log("Camberas ·", resumen(lector, subir(cfg, lector, ls)))
            almacen.subidas_hasta(fin)
            espera = 2
        except Exception as e:                     # sin internet, Camberas caído, token mal…
            log(f"No se ha podido subir ({len(lecturas)} lecturas esperan): {e}. Reintento en {espera} s")
            time.sleep(espera)
            espera = min(espera * 2, 60)


# ── Conexión con el Ultra ────────────────────────────────────────────────────
def conectar_outreach(cfg):
    """Conexión con Outreach para el modo de siempre; None si no hay o no contesta."""
    if not cfg["outreach"]:
        return None
    try:
        s = socket.create_connection(cfg["outreach"], timeout=10)
        s.settimeout(None)
        return s
    except OSError as e:
        log(f"Outreach no contesta ({e}): contesta el receptor")
        return None


def atender(cfg, almacen, ultra, direccion):
    quien = f"{direccion[0]}:{direccion[1]}"
    estado = {"outreach": conectar_outreach(cfg)}    # mientras viva, contesta Outreach
    log("Conecta el Ultra", quien, "(contesta Outreach)" if estado["outreach"] else "(contesta el receptor)")

    def de_outreach_al_ultra(o):
        try:
            while True:
                datos = o.recv(4096)
                if not datos:
                    break
                ultra.sendall(datos)
        except OSError:
            pass
        if estado["outreach"] is o:
            estado["outreach"] = None
            log(f"{quien}: se ha cortado Outreach, contesta el receptor")

    if estado["outreach"]:
        threading.Thread(target=de_outreach_al_ultra, args=(estado["outreach"],), daemon=True).start()

    buf = b""
    try:
        while True:
            datos = ultra.recv(4096)
            if not datos:
                break
            o = estado["outreach"]
            if o:
                try:
                    o.sendall(datos)
                except OSError:
                    estado["outreach"] = None
                    log(f"{quien}: se ha cortado Outreach, contesta el receptor")
            lecturas, estados, buf = leer_bloques(buf + datos)
            if len(buf) > 65536:                   # basura que no es del Ultra
                buf = b""
            contesta_receptor = estado["outreach"] is None
            if lecturas:
                nuevas = almacen.guardar(lecturas)     # primero a disco…
                if contesta_receptor:                  # …y luego el «recibido»
                    ultra.sendall(b"OK%07d\r\n" % lecturas[-1]["num"])
                log(f"{quien}: {len(lecturas)} lecturas ({nuevas} nuevas), última nº {lecturas[-1]['num']}")
            if contesta_receptor:
                for _ in range(estados):
                    ultra.sendall(RESPUESTA_ESTADO)
    except OSError as e:
        log(f"{quien}: conexión cortada ({e})")
    finally:
        log("Se va el Ultra", quien)
        for s in (ultra, estado["outreach"]):
            if s:
                try:
                    s.close()
                except OSError:
                    pass


def servir(cfg):
    almacen = Almacen(cfg["carpeta"])
    threading.Thread(target=hilo_subida, args=(cfg, almacen), daemon=True).start()
    servidor = socket.socket()
    servidor.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    servidor.bind(("0.0.0.0", cfg["puerto"]))
    servidor.listen()
    log(f"Receptor Ultra escuchando en el puerto {cfg['puerto']}; lecturas en {cfg['carpeta']}"
        + (f"; contesta Outreach {cfg['outreach']}" if cfg["outreach"] else "; contesta el receptor"))
    while True:
        conexion, direccion = servidor.accept()
        conexion.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        threading.Thread(target=atender, args=(cfg, almacen, conexion, direccion), daemon=True).start()


def reenviar(cfg, dia):
    almacen = Almacen(cfg["carpeta"])
    lecturas = list(almacen.leer_dia(dia))
    if not lecturas:
        sys.exit(f"No hay lecturas del {dia} en {almacen.fichero_dia(dia)}")
    por_lector = {}
    for l in lecturas:
        por_lector.setdefault(l["lector"], []).append(l)
    for lector, ls in por_lector.items():
        for i in range(0, len(ls), LOTE):
            print(resumen(lector, subir(cfg, lector, ls[i:i + LOTE])), flush=True)


if __name__ == "__main__":
    argumentos = sys.argv[1:]
    if argumentos[:1] == ["--reenviar"]:
        if len(argumentos) < 2:
            sys.exit("Uso: receptor.py --reenviar AAAA-MM-DD [config.json]")
        reenviar(cargar_config(argumentos[2] if len(argumentos) > 2 else "/root/ultra/config.json"), argumentos[1])
    else:
        servir(cargar_config(argumentos[0] if argumentos else "/root/ultra/config.json"))
