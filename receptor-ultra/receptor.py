#!/usr/bin/env python3
"""
Receptor de lecturas del RFID Ultra para Camberas (sustituye a Outreach).

El Ultra, en Settings › Remote › LAN, apunta a este servidor (URL = IP del
servidor, Port = el de config.json). Por cada conexión lee los bloques del
Ultra (lecturas de 31 bytes y un mensaje de estado cada segundo; protocolo
visto el 14-oct pasando el tráfico de Outreach), guarda cada lectura en disco
y la reparte:

  · a Camberas, siempre (RPC ultra_registrar_lecturas, en lotes; si no hay
    internet, reintenta sin perder nada);
  · al destino que CONTESTA (como mucho uno; p. ej. el servidor original de
    RFID Timing con Outreach): recibe el tráfico del Ultra en directo y es
    quien le confirma las lecturas, así RaceTec sigue igual. Si no hay o no
    responde, contesta el receptor: «OK» + número de la última lectura
    (después de guardarla en disco) y 03 00 06 03 0d 0a al estado;
  · a las COPIAS (el resto de destinos): se les manda cada lectura desde el
    disco, tal cual la mandó el Ultra, y se apunta lo que confirma cada una
    («OK» + número). Si una está caída, al volver recibe lo pendiente (de hoy
    y de ayer).

Los destinos se eligen en la pantalla «Receptor Ultra» del panel de Camberas
(solo admin) si config.json trae "clave_receptor": cada 15 s el receptor deja
allí su estado y se lleva los destinos y los lectores (identificador y timer
name de RaceTec de cada Ultra), y guarda la última lista en destinos.json por
si arranca sin internet. Sin clave, salen de config.json ("destinos", o el
antiguo "outreach").

Puerto para el PC ("puerto_pc", 23024): el programa pc/RaceTec.ps1 se conecta
con la clave del receptor y recibe las lecturas en líneas de texto, desde
donde se quedó (cursor), para escribir los ficheros de RaceTec y llamar a
spInsertTime en su SQL Server. Protocolo en pc/README.md.

Solo usa la biblioteca estándar de Python 3.

Uso:
  python3 receptor.py [config.json]             recibe, guarda y reparte
  python3 receptor.py --reenviar AAAA-MM-DD     vuelve a subir a Camberas un
                                                día entero (p. ej. cuando se
                                                asignan chips que llegaron sin
                                                dorsal)
"""
import datetime
import hmac
import json
import os
import re
import select
import socket
import struct
import sys
import threading
import time
import urllib.error
import urllib.request

try:
    from zoneinfo import ZoneInfo
    MADRID = ZoneInfo("Europe/Madrid")
except Exception:                          # Python viejo o sin zonas: vale el día del servidor
    MADRID = None

EPOCA = datetime.datetime(1980, 1, 1)      # el Ultra cuenta segundos desde 1980, en hora local
RESPUESTA_ESTADO = b"\x03\x00\x06\x03\r\n"  # lo que contesta Outreach a cada mensaje de estado
OK_RE = re.compile(rb"OK(\d{1,10})\r\n")   # y a las lecturas: «OK» + número de la última
# IP o nombre de servidor: etiquetas de 1–63 (letras, cifras, guiones), sin «..» (como el CHECK de la BD)
HOST_RE = re.compile(r"[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*")
LOTE = 500                                 # lecturas por llamada a Camberas
TROZO = 100                                # lecturas por envío a una copia
ESPERA_OK = 15                             # s que se espera el «OK» de una copia
SINCRONIZAR = 15                           # s entre sincronizaciones con la pantalla
REINTENTO_CONTESTA = 30                    # s entre intentos con el que contesta, si está caído
SIN_RESPUESTA = 10                         # s sin contestar nada al Ultra = el que contesta está colgado
LOTE_PC = 200                              # lecturas por envío al PC
ESTADO_PC = 5                              # s entre estados al PC (le sirve de latido)
IDENT_RE = re.compile(r"[A-Za-z0-9_-]{1,20}")  # identificador de un Ultra (nombre del fichero), como el CHECK
ARRANQUE = None


def ahora():
    return datetime.datetime.now().isoformat(sep=" ", timespec="milliseconds")


def instante():
    """Un instante real (para la pantalla): ISO con zona."""
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds")


def hoy_local():
    """El día en Madrid, que es el de las horas del Ultra."""
    return datetime.datetime.now(MADRID).date() if MADRID else datetime.date.today()


def log(*partes):
    print(ahora(), *partes, flush=True)


def endurecer(s):
    """Que un servidor colgado o una red caída sin aviso no nos bloqueen: envío con
    tope de 5 s y conexión por muerta a los ~20 s sin respuesta (o ~60 s en
    silencio, por keepalive). Un fallo aquí lanza OSError, que ya se trata."""
    s.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_SNDTIMEO, struct.pack("ll", 5, 0))
    for nombre, valor in (("TCP_USER_TIMEOUT", 20000), ("TCP_KEEPIDLE", 30), ("TCP_KEEPINTVL", 10), ("TCP_KEEPCNT", 3)):
        if hasattr(socket, nombre):
            try:
                s.setsockopt(socket.IPPROTO_TCP, getattr(socket, nombre), valor)
            except OSError:
                pass


def anadir(ruta, texto):
    """Añade al final del fichero (con fsync). Si la última línea quedó a medias
    (corte de luz), la cierra antes para que no se funda con la nueva."""
    with open(ruta, "ab") as f:
        if f.tell() > 0:
            with open(ruta, "rb") as g:
                g.seek(-1, os.SEEK_END)
                if g.read(1) != b"\n":
                    f.write(b"\n")
        f.write(texto.encode("utf-8"))
        f.flush()
        os.fsync(f.fileno())


# ── Configuración y destinos ─────────────────────────────────────────────────
def destino_normal(d):
    """{"id", "nombre", "host", "puerto", "contesta"} con sus tipos; None si no vale."""
    try:
        host, puerto = str(d["host"]).strip(), int(d["puerto"])
    except (KeyError, TypeError, ValueError):
        return None
    if len(host) > 253 or not HOST_RE.fullmatch(host) or not 0 < puerto < 65536:
        log(f"Destino con servidor o puerto no válidos, se ignora: {host!r}:{puerto}")
        return None
    return {"id": d.get("id"), "nombre": str(d.get("nombre") or f"{host}:{puerto}"),
            "host": host, "puerto": puerto, "contesta": bool(d.get("contesta"))}


def limpiar_destinos(lista):
    """Destinos válidos, sin repetir servidor y con un solo «contesta» (el primero)."""
    vistos, salida, contesta = set(), [], False
    for d in filter(None, map(destino_normal, lista or [])):
        if (d["host"], d["puerto"]) in vistos:
            continue
        vistos.add((d["host"], d["puerto"]))
        if d["contesta"]:
            d["contesta"], contesta = not contesta, True
        salida.append(d)
    return salida


def clave_destino(d):
    """Identidad de un destino para el disco y el estado: su servidor."""
    return re.sub(r"[^A-Za-z0-9._-]", "_", f"{d['host']}_{d['puerto']}")


def describir(lista):
    if not lista:
        return "ninguno (contesta el receptor)"
    return "; ".join(f"{d['nombre']} {d['host']}:{d['puerto']}" + (" [contesta]" if d["contesta"] else " [copia]")
                     for d in lista)


def lector_normal(l):
    """{"lector", "identificador", "timer_name"} con sus tipos; None si no vale."""
    try:
        lector, ident = int(l["lector"]), str(l.get("identificador") or "").strip()
        timer = " ".join(str(l.get("timer_name") or "").split())[:50]   # sin tabuladores ni saltos: va en una línea
    except (KeyError, TypeError, ValueError, AttributeError):
        return None
    if not 0 <= lector <= 255 or not IDENT_RE.fullmatch(ident):
        return None
    return {"lector": lector, "identificador": ident, "timer_name": timer}


def limpiar_lectores(lista):
    salida, vistos = [], set()
    for l in filter(None, map(lector_normal, lista or [])):
        if l["lector"] not in vistos:
            vistos.add(l["lector"])
            salida.append(l)
    return sorted(salida, key=lambda l: l["lector"])


def cargar_config(ruta):
    with open(ruta, encoding="utf-8") as f:
        cfg = json.load(f)
    cfg.setdefault("puerto", 11111)
    cfg.setdefault("puerto_pc", 23024)
    cfg.setdefault("carpeta", "/root/ultra")
    cfg["tokens"] = {int(k): v for k, v in cfg.get("tokens", {}).items()}
    if cfg.get("destinos") is not None:
        iniciales = cfg["destinos"]
    elif cfg.get("outreach"):                # config.json de antes: Outreach contesta
        iniciales = [{"nombre": "Outreach", "host": cfg["outreach"][0], "puerto": cfg["outreach"][1],
                      "contesta": True}]
    else:
        iniciales = []
    cfg["destinos"] = limpiar_destinos(iniciales)
    cfg["clave_receptor"] = cfg.get("clave_receptor") or None
    for clave in ("camberas_url", "clave_publica"):
        if not cfg.get(clave):
            sys.exit(f"Falta «{clave}» en {ruta}")
    return cfg


class Destinos:
    """Lo que manda la pantalla: la lista viva de destinos (o la de config.json),
    los lectores (identificador y timer name de cada Ultra) y el nombre del receptor."""

    def __init__(self, cfg):
        self.cerrojo = threading.Lock()
        self.cache = os.path.join(cfg["carpeta"], "destinos.json")
        self.lista = cfg["destinos"]
        self.lectores = limpiar_lectores(cfg.get("lectores"))
        self.nombre = "receptor"
        self.cruda = None                    # lo último tal cual llegó de la pantalla
        self.al_dejar_de_contestar = None    # (clave) → al quitarle a uno el «contesta»
        self.listo = threading.Event()       # ya se sabe de los lectores (caché o primera sincronización)
        if cfg["clave_receptor"]:            # lo último que dio la pantalla, por si no hay internet
            try:
                with open(self.cache, encoding="utf-8") as f:
                    guardado = json.load(f)
                if isinstance(guardado, list):           # formato de antes: solo destinos
                    guardado = {"destinos": guardado}
                self.lista = limpiar_destinos(guardado.get("destinos"))
                if "lectores" in guardado:
                    self.lectores = limpiar_lectores(guardado.get("lectores"))
                    self.listo.set()
                self.nombre = " ".join(str(guardado.get("nombre") or self.nombre).split())
            except (OSError, ValueError, AttributeError):
                pass
        else:
            self.listo.set()

    def todos(self):
        with self.cerrojo:
            return [dict(d) for d in self.lista]

    def lectores_lista(self):
        with self.cerrojo:
            return [dict(l) for l in self.lectores]

    def poner_lectores(self, crudos, nombre=None):
        nuevos = limpiar_lectores(crudos)
        nombre = " ".join(str(nombre or "").split())
        with self.cerrojo:
            cambio = nuevos != self.lectores or (nombre and nombre != self.nombre)
            self.lectores = nuevos
            if nombre:
                self.nombre = nombre
        if cambio:
            log("Lectores:", "; ".join(f"{l['lector']} = {l['identificador']} ({l['timer_name'] or 'sin timer name'})"
                                       for l in nuevos) or "ninguno")
            self.guardar_cache()

    def guardar_cache(self):
        with self.cerrojo:
            datos = {"destinos": self.lista, "lectores": self.lectores, "nombre": self.nombre}
        try:
            tmp = self.cache + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(datos, f, ensure_ascii=False)
            os.replace(tmp, self.cache)
        except OSError as e:
            log(f"No se ha podido guardar {self.cache}: {e}")

    def principal(self):
        return next((d for d in self.todos() if d["contesta"]), None)

    def copias(self):
        return [d for d in self.todos() if not d["contesta"]]

    def poner(self, crudos):
        if crudos == self.cruda:
            return
        self.cruda = crudos
        nuevos = limpiar_destinos(crudos)       # avisa de los que no valen, una vez por cambio
        with self.cerrojo:
            if nuevos == self.lista:
                return
            antes = next((d for d in self.lista if d["contesta"]), None)
        despues = next((d for d in nuevos if d["contesta"]), None)
        if antes and self.al_dejar_de_contestar and (
                not despues or clave_destino(antes) != clave_destino(despues)):
            # ANTES de cambiar la lista: lo guardado hasta aquí ya se lo pasó en directo
            self.al_dejar_de_contestar(clave_destino(antes))
        with self.cerrojo:
            self.lista = nuevos
        log("Destinos:", describir(nuevos))
        self.guardar_cache()


# ── Protocolo del Ultra ──────────────────────────────────────────────────────
def leer_bloques(buf):
    """Saca del búfer los bloques completos. Devuelve (lecturas, estados, resto).

    Lectura: 02 1c 01 · nº(4) · chip(4) · segundos desde 1980(4) · ms(2) · …lector… · 03
             (todo en little-endian; 31 bytes). Se guarda también el bloque
             tal cual ("raw") para reenviárselo a las copias.
    Estado:  03 LL … 03 0d 0a (LL bytes en total); se devuelven los bloques.
    """
    lecturas, estados, i = [], [], 0
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
                                 "hora": hora.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3], "raw": b.hex()})
                i += total
                continue
        elif tipo == 0x03 and i + 2 <= len(buf):
            total = buf[i + 1]
            if i + total > len(buf):
                break
            if total >= 6 and buf[i + total - 3:i + total] == b"\x03\r\n":
                estados.append(bytes(buf[i:i + total]))
                i += total
                continue
        elif tipo in (0x02, 0x03):
            break                       # falta la cabecera: esperar más datos
        i += 1                          # byte suelto: resincronizar
    return lecturas, estados, buf[i:]


def lector_de_estado(bloque):
    """Número de lector dentro del estado de 101 bytes (byte 33; visto el 14-oct: 0x89 = 137)."""
    return bloque[33] if len(bloque) == 101 else None


# ── Almacén en disco ─────────────────────────────────────────────────────────
class Almacen:
    """lecturas/AAAA-MM-DD.txt (todo, también para las copias), cola.jsonl +
    cola.pos (para subir a Camberas) y copias/<servidor>.json (hasta dónde ha
    confirmado cada copia)."""

    def __init__(self, carpeta):
        self.carpeta = carpeta
        os.makedirs(os.path.join(carpeta, "lecturas"), exist_ok=True)
        os.makedirs(os.path.join(carpeta, "copias"), exist_ok=True)
        self.cola = os.path.join(carpeta, "cola.jsonl")
        self.pos = os.path.join(carpeta, "cola.pos")
        self.cerrojo = threading.Lock()
        self.vistas = set()
        hoy = hoy_local()
        for d in (hoy - datetime.timedelta(days=1), hoy):
            for l in self.leer_dia(d.isoformat()):
                self.vistas.add((l["lector"], l["num"], l["hora"]))

    def fichero_dia(self, dia):
        return os.path.join(self.carpeta, "lecturas", f"{dia}.txt")

    def dias(self):
        return sorted(n[:10] for n in os.listdir(os.path.join(self.carpeta, "lecturas"))
                      if re.fullmatch(r"\d{4}-\d{2}-\d{2}\.txt", n))

    def leer_dia(self, dia):
        """Líneas: chip · hora · nº · lector · bloque del Ultra en hex (las de antes no lo traen)."""
        try:
            with open(self.fichero_dia(dia), encoding="utf-8") as f:
                for linea in f:
                    p = linea.rstrip("\n").split("\t")
                    try:
                        yield {"chip": int(p[0]), "hora": p[1], "num": int(p[2]), "lector": int(p[3]),
                               "raw": p[4] if len(p) >= 5 and p[4] else None}
                    except (IndexError, ValueError):
                        continue                    # línea rota (corte de luz): se salta
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
                anadir(self.fichero_dia(dia),
                       "".join(f"{l['chip']}\t{l['hora']}\t{l['num']}\t{l['lector']}\t{l['raw']}\n" for l in ls))
            anadir(self.cola, "".join(json.dumps({k: v for k, v in l.items() if k != "raw"}) + "\n" for l in nuevas))
            for l in nuevas:
                self.vistas.add((l["lector"], l["num"], l["hora"]))
            return len(nuevas)

    # Cola de Camberas
    def pendientes(self, maximo):
        """(lecturas, posición final) de la cola sin subir."""
        with self.cerrojo:
            desde = self.leer_pos()
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

    def leer_pos(self):
        try:
            with open(self.pos) as f:
                return int(f.read().strip() or 0)
        except (FileNotFoundError, ValueError):
            return 0

    def cuantas_en_cola(self):
        with self.cerrojo:
            return contar_lineas(self.cola, self.leer_pos())

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

    # Copias: leen de los ficheros del día, cada una con su posición
    def dias_copia(self, pos):
        """(primer día, días) que mira una copia: desde que se dio de alta, y como mucho desde ayer."""
        minimo = max(pos["desde"], (hoy_local() - datetime.timedelta(days=1)).isoformat())
        return minimo, [d for d in self.dias() if d >= minimo]

    def trozo_copia(self, pos, maximo):
        """Siguientes lecturas para una copia: (lector, [(nº, bloque)], posición nueva).
        Solo lecturas seguidas del mismo lector: cada lector va por su conexión.
        Si no hay nada, devuelve la misma `pos`."""
        minimo, dias = self.dias_copia(pos)
        for dia in dias:
            desde = self.posicion_valida(dia, pos["dias"].get(dia, 0))
            ruta = self.fichero_dia(dia)
            lector, trozo, fin = None, [], desde
            try:
                if os.path.getsize(ruta) <= desde:
                    continue
                with open(ruta, "rb") as f:
                    f.seek(desde)
                    for linea in f:
                        if not linea.endswith(b"\n"):
                            break                       # a medio escribir
                        try:
                            p = linea.rstrip(b"\n").split(b"\t")
                            este, num, bloque = int(p[3]), int(p[2]), bytes.fromhex(p[4].decode())
                            if not (len(bloque) == 31 and bloque[:3] == b"\x02\x1c\x01" and bloque[-1] == 3
                                    and struct.unpack_from("<I", bloque, 3)[0] == num):
                                raise ValueError("bloque")
                        except (IndexError, ValueError):
                            este = None                 # de antes (sin bloque) o rota: no se puede reenviar
                        if este is not None and lector is not None and este != lector:
                            break
                        fin += len(linea)
                        if este is not None:
                            lector = este
                            trozo.append((num, bloque))
                            if len(trozo) >= maximo:
                                break
            except OSError:
                continue
            if fin != desde:
                nuevos = {d: o for d, o in pos["dias"].items() if d >= minimo}
                nuevos[dia] = fin
                return lector, trozo, {"desde": pos["desde"], "dias": nuevos}
        return None, [], pos

    def posicion_valida(self, dia, desde):
        """Una posición más allá del fichero no es de este fichero (se recreó la
        carpeta, otro VPS…): se empieza desde el principio, repetir es mejor que perder."""
        try:
            if desde > os.path.getsize(self.fichero_dia(dia)):
                log(f"Posición {desde} más allá del fichero del {dia}: se reenvía desde el principio")
                return 0
        except OSError:
            pass
        return desde

    def pendientes_copia(self, pos):
        _, dias = self.dias_copia(pos)
        return sum(contar_lineas(self.fichero_dia(d), self.posicion_valida(d, pos["dias"].get(d, 0))) for d in dias)

    def lecturas_desde(self, pos, maximo):
        """Siguientes lecturas para un PC, con el cursor que deja cada una:
        ([{lector, num, chip, hora, antena, dia, offset}], posición nueva).
        Si no hay nada, devuelve la misma `pos`."""
        minimo, dias = self.dias_copia(pos)
        for dia in dias:
            desde = self.posicion_valida(dia, pos["dias"].get(dia, 0))
            ruta = self.fichero_dia(dia)
            salida, fin = [], desde
            try:
                if os.path.getsize(ruta) <= desde:
                    continue
                with open(ruta, "rb") as f:
                    f.seek(desde)
                    for linea in f:
                        if not linea.endswith(b"\n"):
                            break                       # a medio escribir
                        fin += len(linea)
                        try:
                            p = linea.rstrip(b"\n").decode("utf-8").split("\t")
                            raw = p[4] if len(p) > 4 else ""
                            salida.append({"lector": int(p[3]), "num": int(p[2]), "chip": int(p[0]), "hora": p[1],
                                           "antena": int(raw[58:60], 16) if len(raw) == 62 else 0,  # byte 29 del bloque
                                           "dia": dia, "offset": fin})
                        except (IndexError, ValueError, UnicodeDecodeError):
                            continue                    # línea rota: se salta
                        if len(salida) >= maximo:
                            break
            except OSError:
                continue
            if fin != desde:
                nuevos = {d: o for d, o in pos["dias"].items() if d >= minimo}
                nuevos[dia] = fin
                return salida, {"desde": pos["desde"], "dias": nuevos}
        return [], pos

    def ruta_pos_copia(self, clave):
        return os.path.join(self.carpeta, "copias", clave + ".json")

    def cargar_pos_copia(self, clave):
        try:
            with open(self.ruta_pos_copia(clave), encoding="utf-8") as f:
                pos = json.load(f)
            return {"desde": str(pos["desde"]), "dias": {str(k): int(v) for k, v in pos["dias"].items()}}
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            # Copia nueva: recibe lo de hoy desde el principio
            return {"desde": hoy_local().isoformat(), "dias": {}}

    def guardar_pos_copia(self, clave, pos):
        ruta = self.ruta_pos_copia(clave)
        with open(ruta + ".tmp", "w", encoding="utf-8") as f:
            json.dump(pos, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(ruta + ".tmp", ruta)

    def pos_al_final(self):
        """Posición de quien ya lo tiene todo (el que contestaba, que lo recibió en directo)."""
        hoy = hoy_local().isoformat()
        with self.cerrojo:
            return {"desde": hoy, "dias": {d: os.path.getsize(self.fichero_dia(d)) for d in self.dias() if d >= hoy}}


def contar_lineas(ruta, desde):
    try:
        with open(ruta, "rb") as f:
            f.seek(desde)
            return sum(trozo.count(b"\n") for trozo in iter(lambda: f.read(1 << 16), b""))
    except OSError:
        return 0


# ── Lo que pasa ahora (para las copias y para la pantalla) ───────────────────
class Vivo:
    def __init__(self):
        self.cerrojo = threading.Condition()
        self.ultras = {}        # "ip:puerto" de cada conexión del Ultra → su estado
        self.estados = {}       # lector → (último bloque de estado, nº de orden, monotonic)
        self.n_estado = 0
        self.camberas = {"pendientes": 0, "ultimo_ok": None, "error": None}
        self.destinos = {}      # clave del destino → {"conectado" (como copia), "pendientes", "ultimo_ok", "error"}
        self.abiertas = {}      # clave del que contesta → conexiones abiertas (una por Ultra)
        self.huecos = set()     # claves del que contesta con un hueco apuntado (estuvo caído)
        self.pcs = {}           # "ip:puerto" de cada PC conectado → {"ip", "desde"}

    def avisar(self):
        with self.cerrojo:
            self.cerrojo.notify_all()

    def esperar(self, segundos):
        with self.cerrojo:
            self.cerrojo.wait(segundos)

    def nuevo_estado(self, lector, bloque):
        with self.cerrojo:
            self.n_estado += 1
            self.estados[lector] = (bloque, self.n_estado, time.monotonic())
            self.cerrojo.notify_all()

    def estados_frescos(self, segundos):
        limite = time.monotonic() - segundos
        with self.cerrojo:
            return {l: e for l, e in self.estados.items() if e[2] >= limite}

    def ultra(self, quien, **cambios):
        with self.cerrojo:
            self.ultras.setdefault(quien, {}).update(cambios)

    def destino(self, clave, **cambios):
        with self.cerrojo:
            self.destinos.setdefault(clave, {}).update(cambios)

    def abrir_cerrar(self, clave, delta):
        """El que contesta tiene una conexión por Ultra: está conectado si queda alguna."""
        with self.cerrojo:
            self.abiertas[clave] = max(0, self.abiertas.get(clave, 0) + delta)

    def foto(self, destinos):
        """El estado que se manda a la pantalla."""
        with self.cerrojo:
            # Los Ultras que se fueron: como mucho los 10 últimos, y de hace menos de una hora
            limite = time.monotonic() - 3600
            idos = sorted((k for k, u in self.ultras.items() if not u.get("conectado")),
                          key=lambda k: self.ultras[k].get("_fin", 0))
            for k in idos[:-10] + [k for k in idos[-10:] if self.ultras[k].get("_fin", 0) < limite]:
                del self.ultras[k]
            ultras = [{k: v for k, v in u.items() if not k.startswith("_")} for u in self.ultras.values()]
            camberas = dict(self.camberas)
            vivos = {k: dict(v) for k, v in self.destinos.items()}
            abiertas = dict(self.abiertas)
            pcs = [dict(v) for v in self.pcs.values()]
        lista = []
        for d in destinos.todos():
            clave = clave_destino(d)
            e = vivos.get(clave, {})
            lista.append({"id": d["id"], "nombre": d["nombre"], "host": d["host"], "puerto": d["puerto"],
                          "contesta": d["contesta"],
                          "conectado": abiertas.get(clave, 0) > 0 if d["contesta"] else bool(e.get("conectado")),
                          "pendientes": None if d["contesta"] else e.get("pendientes"),
                          "ultimo_ok": e.get("ultimo_ok"), "error": e.get("error")})
        return {"version": 2, "enviado": instante(), "arranque": ARRANQUE,
                "ultras": ultras, "camberas": camberas, "destinos": lista, "pcs": pcs}


# ── Camberas ─────────────────────────────────────────────────────────────────
def llamar_rpc(cfg, funcion, cuerpo):
    peticion = urllib.request.Request(
        cfg["camberas_url"].rstrip("/") + "/rest/v1/rpc/" + funcion,
        data=json.dumps(cuerpo).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "apikey": cfg["clave_publica"],
                 "Authorization": "Bearer " + cfg["clave_publica"]})
    try:
        with urllib.request.urlopen(peticion, timeout=20) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Camberas respondió {e.code}: {e.read()[:300].decode('utf-8', 'replace')}")


def subir(cfg, lector, lecturas):
    """Una llamada a la RPC. Devuelve el resumen de Camberas o lanza excepción."""
    token = cfg["tokens"].get(lector) or cfg["tokens"].get(0)
    if not token:
        raise RuntimeError(f"no hay token para el lector {lector} en config.json")
    return llamar_rpc(cfg, "ultra_registrar_lecturas", {
        "p_token": token, "p_lector": lector,
        "p_lecturas": [{"num": l["num"], "chip": l["chip"], "hora": l["hora"]} for l in lecturas]})


def resumen(lector, res):
    texto = (f"lector {lector}: {res.get('insertadas', 0)} nuevas, {res.get('repetidas', 0)} ya estaban, "
             f"{res.get('fuera_de_ventana', 0)} fuera de la ventana de carrera")
    if res.get("sin_dorsal"):
        texto += f", {res['sin_dorsal']} sin dorsal (chips {', '.join(map(str, res.get('chips_sin_dorsal', [])[:10]))})"
    return texto


def hilo_subida(cfg, almacen, vivo):
    espera, contado = 2, 0.0
    while True:
        if time.monotonic() - contado > 5:
            vivo.camberas["pendientes"] = almacen.cuantas_en_cola()
            contado = time.monotonic()
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
            vivo.camberas.update(ultimo_ok=instante(), error=None)
            contado, espera = 0.0, 2
        except Exception as e:                     # sin internet, Camberas caído, token mal…
            vivo.camberas["error"] = str(e)[:300]
            log(f"No se ha podido subir ({len(lecturas)} lecturas esperan): {e}. Reintento en {espera} s")
            time.sleep(espera)
            espera = min(espera * 2, 60)


def hilo_sincronizar(cfg, destinos, vivo):
    """Cada 15 s: deja el estado en la pantalla y se trae los destinos."""
    fallo = None
    while True:
        try:
            res = llamar_rpc(cfg, "ultra_receptor_sincronizar",
                             {"p_clave": cfg["clave_receptor"], "p_estado": vivo.foto(destinos)})
            destinos.poner(res.get("destinos") or [])
            destinos.poner_lectores(res.get("lectores") or [], res.get("nombre"))
            if fallo:
                log("Pantalla: sincronizado otra vez")
            fallo = None
        except Exception as e:                     # se sigue con la última lista
            if str(e) != fallo:
                log(f"Pantalla: no se ha podido sincronizar ({e}); sigo con los destinos que tenía")
            fallo = str(e)
        destinos.listo.set()                       # con o sin éxito: el PC no espera más
        time.sleep(SINCRONIZAR)


# ── Copias ───────────────────────────────────────────────────────────────────
class Copia(threading.Thread):
    """Manda a un destino las lecturas guardadas, tal cual las mandó el Ultra,
    y apunta hasta dónde ha confirmado («OK» + número). Mientras un Ultra está
    conectado, le pasa también sus mensajes de estado, como haría el Ultra."""

    def __init__(self, destino, almacen, vivo):
        super().__init__(daemon=True)
        self.d, self.clave = destino, clave_destino(destino)
        self.almacen, self.vivo = almacen, vivo
        self.parar = threading.Event()
        self.conexiones = {}    # lector → {"s", "buf", "oks", "estado_n", "usada"}

    def nombre(self):
        return f"{self.d['nombre']} ({self.d['host']}:{self.d['puerto']})"

    def conexion(self, lector):
        c = self.conexiones.get(lector)
        if c:
            return c
        s = socket.create_connection((self.d["host"], self.d["puerto"]), timeout=10)
        endurecer(s)
        c = self.conexiones[lector] = {"s": s, "buf": b"", "oks": set(), "estado_n": 0, "usada": time.monotonic()}
        self.vivo.destino(self.clave, conectado=True, error=None)
        log(f"Copia {self.nombre()}: conectada (lector {lector})")
        self.mandar_estado(lector, c)              # como el Ultra al conectar
        return c

    def leer(self, c, espera):
        """Lee lo que haya llegado (esperando hasta `espera` s) y apunta los «OK»."""
        listos, _, _ = select.select([c["s"]], [], [], espera)
        if not listos:
            return
        datos = c["s"].recv(4096)
        if not datos:
            raise ConnectionError("ha cerrado la conexión")
        buf = c["buf"] + datos
        for m in OK_RE.finditer(buf):
            c["oks"].add(int(m.group(1)))
        corte = buf.rfind(b"\r\n")
        c["buf"] = (buf[corte + 2:] if corte >= 0 else buf)[-256:]

    def mandar_estado(self, lector, c):
        e = self.vivo.estados_frescos(5).get(lector)
        if e and e[1] != c["estado_n"]:
            c["s"].sendall(e[0])
            c["estado_n"], c["usada"] = e[1], time.monotonic()

    def mantener(self):
        """Sin nada pendiente: estado de los Ultras conectados, leer respuestas y
        cerrar las conexiones que ya no hacen falta."""
        for lector in self.vivo.estados_frescos(5):
            self.mandar_estado(lector, self.conexion(lector))
        for lector, c in list(self.conexiones.items()):
            self.leer(c, 0)
            if time.monotonic() - c["usada"] > 30:
                self.cerrar(lector)

    def cerrar(self, lector):
        c = self.conexiones.pop(lector, None)
        if c:
            try:
                c["s"].close()
            except OSError:
                pass
        if not self.conexiones:
            self.vivo.destino(self.clave, conectado=False)

    def run(self):
        pos, espera, contado = self.almacen.cargar_pos_copia(self.clave), 2, 0.0
        if not os.path.exists(self.almacen.ruta_pos_copia(self.clave)):
            try:
                self.almacen.guardar_pos_copia(self.clave, pos)    # que el día del alta sobreviva a un reinicio
            except OSError as e:
                log(f"Copia {self.nombre()}: no se ha podido guardar la posición ({e})")
        log(f"Copia {self.nombre()}: en marcha")
        while not self.parar.is_set():
            try:
                if time.monotonic() - contado > 5:
                    self.vivo.destino(self.clave, pendientes=self.almacen.pendientes_copia(pos))
                    contado = time.monotonic()
                lector, trozo, nueva = self.almacen.trozo_copia(pos, TROZO)
                if trozo:
                    c = self.conexion(lector)
                    c["oks"].clear()
                    c["s"].sendall(b"".join(b for _, b in trozo))
                    c["usada"] = time.monotonic()
                    ultimo, limite = trozo[-1][0], time.monotonic() + ESPERA_OK
                    while ultimo not in c["oks"]:
                        if time.monotonic() > limite:
                            raise TimeoutError(f"no confirma la lectura nº {ultimo}")
                        if self.parar.is_set():
                            break
                        self.leer(c, 0.5)
                    else:
                        self.vivo.destino(self.clave, ultimo_ok=instante(), error=None)
                if nueva is not pos and not self.parar.is_set():
                    pos = nueva
                    self.almacen.guardar_pos_copia(self.clave, pos)
                    contado, espera = 0.0, 2
                    continue
                self.mantener()
                espera = 2
                self.vivo.esperar(0.5)
            except (OSError, ValueError) as e:     # caído, no contesta, cierra…
                for lector in list(self.conexiones):
                    self.cerrar(lector)
                self.vivo.destino(self.clave, conectado=False, error=str(e)[:300])
                log(f"Copia {self.nombre()}: {e}. Reintento en {espera} s")
                self.parar.wait(espera)
                espera = min(espera * 2, 60)
        for lector in list(self.conexiones):
            self.cerrar(lector)
        log(f"Copia {self.nombre()}: parada")


def hilo_copias(destinos, almacen, vivo):
    """Arranca y para las copias según la lista de destinos."""
    activas = {}
    while True:
        deseadas = {clave_destino(d): d for d in destinos.copias()}
        p = destinos.principal()
        for clave, copia in list(activas.items()):
            if clave not in deseadas:
                copia.parar.set()
                del activas[clave]
                if p and clave_destino(p) == clave:
                    # Pasa a contestar. Si estaba al día, olvida su posición de copia: así,
                    # cuando deje de contestar, no se le repite lo que recibió en directo
                    copia.join(20)
                    try:
                        if not copia.is_alive() and almacen.pendientes_copia(almacen.cargar_pos_copia(clave)) == 0:
                            os.remove(almacen.ruta_pos_copia(clave))
                    except OSError:
                        pass
        for clave, d in deseadas.items():
            if clave in activas:
                activas[clave].d = d               # el nombre puede cambiar; el servidor no
            else:
                activas[clave] = Copia(d, almacen, vivo)
                activas[clave].start()
        time.sleep(0.5)


# ── Conexión con el Ultra ────────────────────────────────────────────────────
def atender(destinos, almacen, vivo, ultra, direccion):
    quien = f"{direccion[0]}:{direccion[1]}"
    escribir = threading.Lock()                   # al Ultra le escriben dos hilos
    # El que contesta y su conexión; "espera": desde cuándo le hemos pasado algo sin respuesta
    p = {"d": None, "s": None, "intento": -1e9, "espera": None}

    def al_ultra(datos):
        with escribir:
            ultra.sendall(datos)

    def de_principal(s, d):
        clave = clave_destino(d)
        try:
            while True:
                datos = s.recv(4096)
                if not datos:
                    break
                p["espera"] = None
                al_ultra(datos)
                vivo.destino(clave, ultimo_ok=instante(), error=None)
        except OSError:
            pass
        if p["s"] is s:
            p["s"] = None
            vivo.destino(clave, error="se ha cortado")
            vivo.ultra(quien, contesta="receptor")
            log(f"{quien}: se ha cortado {d['nombre']}, contesta el receptor")
        vivo.abrir_cerrar(clave, -1)
        try:
            s.close()
        except OSError:
            pass

    def cerrar_principal():
        s, p["s"], p["espera"] = p["s"], None, None
        if s:
            try:
                s.shutdown(socket.SHUT_RDWR)       # su hilo lo ve y descuenta la conexión
            except OSError:
                pass

    def abrir_hueco(d):
        """El que contesta está caído: lo que llega ahora no le llega. Se apunta
        desde dónde, para que lo reciba como copia cuando el admin lo pase a copia.
        Si ya tenía posición de copia, se respeta (es anterior)."""
        clave = clave_destino(d)
        with vivo.cerrojo:
            if clave in vivo.huecos:
                return
            vivo.huecos.add(clave)
        if not os.path.exists(almacen.ruta_pos_copia(clave)):
            try:
                almacen.guardar_pos_copia(clave, almacen.pos_al_final())
            except OSError as e:
                log(f"No se ha podido apuntar el hueco de {d['nombre']}: {e}")

    def revisar_principal(pendiente):
        """Cambios en la pantalla y reintentos. `pendiente`: lo que el Ultra ya
        mandó y aún no es un bloque entero (para empezar en el principio de uno)."""
        d = destinos.principal()
        if (d and clave_destino(d)) != (p["d"] and clave_destino(p["d"])):
            if p["d"]:
                log(f"{quien}: {p['d']['nombre']} deja de contestar")
            cerrar_principal()
            p["d"], p["intento"] = d, -1e9
            if not d:
                vivo.ultra(quien, contesta="receptor")
                log(f"{quien}: contesta el receptor")
        elif d:
            p["d"]["nombre"] = d["nombre"]
        d = p["d"]
        if d and not p["s"] and time.monotonic() - p["intento"] >= REINTENTO_CONTESTA:
            p["intento"] = time.monotonic()
            clave = clave_destino(d)
            try:
                s = socket.create_connection((d["host"], d["puerto"]), timeout=5)
                s.settimeout(None)
                endurecer(s)
                if pendiente:
                    s.sendall(pendiente)
            except (OSError, ValueError) as e:        # ValueError: nombre de servidor imposible
                vivo.destino(clave, error=str(e)[:300])
                vivo.ultra(quien, contesta="receptor")
                log(f"{quien}: {d['nombre']} no responde ({e}): contesta el receptor")
                return
            p["s"] = s
            vivo.abrir_cerrar(clave, +1)
            vivo.destino(clave, error=None)
            vivo.ultra(quien, contesta=d["nombre"])
            log(f"{quien}: contesta {d['nombre']} ({d['host']}:{d['puerto']})")
            threading.Thread(target=de_principal, args=(s, d), daemon=True).start()

    log("Conecta el Ultra", quien)
    vivo.ultra(quien, ip=direccion[0], conectado=True, desde=instante(), lecturas=0, contesta="receptor")
    buf, lector, ultimo_num = b"", None, None
    try:
        revisar_principal(b"")
        while True:
            datos = ultra.recv(4096)
            if not datos:
                break
            revisar_principal(buf)
            s = p["s"]
            if s:
                try:
                    s.sendall(datos)
                    if p["espera"] is None:
                        p["espera"] = time.monotonic()
                    elif time.monotonic() - p["espera"] > SIN_RESPUESTA:
                        raise TimeoutError(f"lleva {SIN_RESPUESTA} s sin contestar")   # colgado
                except OSError as e:
                    if p["s"] is s:
                        cerrar_principal()
                        p["intento"] = time.monotonic()                # no volver a probar enseguida
                        vivo.destino(clave_destino(p["d"]), error=str(e)[:300] or "se ha cortado")
                        vivo.ultra(quien, contesta="receptor")
                        log(f"{quien}: {p['d']['nombre']} {e or 'se ha cortado'}: contesta el receptor")
                        if ultimo_num is not None:                     # lo que él dejó sin confirmar
                            al_ultra(b"OK%07d\r\n" % ultimo_num)
            lecturas, estados, buf = leer_bloques(buf + datos)
            if len(buf) > 65536:                   # basura que no es del Ultra
                buf = b""
            contesta_receptor = p["s"] is None
            if lecturas:
                if p["d"] and contesta_receptor:
                    abrir_hueco(p["d"])                # el que contesta no las va a recibir
                nuevas = almacen.guardar(lecturas)     # primero a disco…
                if contesta_receptor:                  # …y luego el «recibido»
                    al_ultra(b"OK%07d\r\n" % lecturas[-1]["num"])
                lector, ultimo_num = lecturas[-1]["lector"], lecturas[-1]["num"]
                with vivo.cerrojo:
                    u = vivo.ultras.setdefault(quien, {})
                    u.update(lector=lector, ultima_num=lecturas[-1]["num"], ultima_hora=lecturas[-1]["hora"],
                             lecturas=u.get("lecturas", 0) + len(lecturas))
                if nuevas:
                    vivo.avisar()
                log(f"{quien}: {len(lecturas)} lecturas ({nuevas} nuevas), última nº {lecturas[-1]['num']}")
            for bloque in estados:
                if contesta_receptor:
                    al_ultra(RESPUESTA_ESTADO)
                este = lector if lector is not None else lector_de_estado(bloque)
                if este is not None:
                    vivo.nuevo_estado(este, bloque)
                    if lector is None:
                        vivo.ultra(quien, lector=este)
    except Exception as e:                         # cortada, o un fallo que no debe dejar colgado al Ultra
        log(f"{quien}: conexión cortada ({e!r})")
    finally:
        log("Se va el Ultra", quien)
        vivo.ultra(quien, conectado=False, hasta=instante(), _fin=time.monotonic())
        cerrar_principal()
        try:
            ultra.close()
        except OSError:
            pass


# ── El PC (RaceTec) ──────────────────────────────────────────────────────────
def normalizar_pos(c):
    """El cursor que manda el PC ({"desde": "AAAA-MM-DD", "dias": {"AAAA-MM-DD": bytes}}),
    saneado. Vacío o roto: desde hoy."""
    hoy = hoy_local().isoformat()
    try:
        desde = str(c.get("desde") or hoy)
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", desde) or desde > hoy:   # una fecha futura lo dejaría mudo
            desde = hoy
        dias = {str(k): int(v) for k, v in (c.get("dias") or {}).items()
                if re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(k)) and 0 <= int(v) < 1 << 40}
        return {"desde": desde, "dias": dias}
    except (AttributeError, TypeError, ValueError, OverflowError):
        return {"desde": hoy, "dias": {}}


def leer_linea(conn, limite=4096):
    datos = b""
    while not datos.endswith(b"\n") and len(datos) < limite:
        trozo = conn.recv(1)
        if not trozo:
            break
        datos += trozo
    return datos.decode("utf-8", "replace").strip()


def atender_pc(cfg, almacen, vivo, destinos, conn, direccion):
    """Un PC: «HOLA clave cursor» y, desde ahí, las lecturas según llegan (y las
    de antes que le falten), los lectores y un estado cada 5 s de latido."""
    quien = f"PC {direccion[0]}:{direccion[1]}"
    fin = threading.Event()
    try:
        conn.settimeout(10)
        partes = leer_linea(conn).split(" ", 2)
        if len(partes) < 2 or partes[0] != "HOLA" or not hmac.compare_digest(
                partes[1].encode("utf-8"), str(cfg["clave_receptor"]).encode("utf-8")):
            conn.sendall(b"ADIOS\tclave no valida\n")
            log(f"{quien}: clave no válida")
            return
        try:
            pos = normalizar_pos(json.loads(partes[2]) if len(partes) > 2 else {})
        except ValueError:
            pos = normalizar_pos({})
        conn.settimeout(None)
        log(f"Conecta el {quien} (desde {pos['desde']}, {almacen.pendientes_copia(pos)} lecturas pendientes)")
        with vivo.cerrojo:
            vivo.pcs[quien] = {"ip": direccion[0], "desde": instante()}

        def vigilar():                               # el PC no manda nada más: solo vemos si se va
            try:
                while conn.recv(4096):
                    pass
            except OSError:
                pass
            fin.set()
            vivo.avisar()
        threading.Thread(target=vigilar, daemon=True).start()

        destinos.listo.wait(20)                      # que el primer LECTOR sea el bueno, no el de config.json
        conn.sendall(f"HOLA\t{destinos.nombre}\t{json.dumps(pos)}\n".encode("utf-8"))
        lectores_enviados, ultimo_estado = None, 0.0
        while not fin.is_set():
            lectores = destinos.lectores_lista()
            if lectores != lectores_enviados:
                conn.sendall("".join(f"LECTOR\t{l['lector']}\t{l['identificador']}\t{l['timer_name']}\n"
                                     for l in lectores).encode("utf-8") or b"LECTOR\n")
                lectores_enviados = lectores
            lecturas, nueva = almacen.lecturas_desde(pos, LOTE_PC)
            if lecturas:
                conn.sendall("".join(f"LECTURA\t{l['lector']}\t{l['num']}\t{l['chip']}\t{l['hora']}\t{l['antena']}"
                                     f"\t{l['dia']}\t{l['offset']}\n" for l in lecturas).encode("utf-8"))
            if nueva is not pos:
                pos = nueva
                continue
            if time.monotonic() - ultimo_estado > ESTADO_PC:
                conn.sendall(b"ESTADO\t" + json.dumps(vivo.foto(destinos)).encode("utf-8") + b"\n")
                ultimo_estado = time.monotonic()
            vivo.esperar(1)
    except (OSError, ValueError) as e:
        log(f"{quien}: conexión cortada ({e})")
    except Exception as e:                         # un HOLA raro no debe dejar tracebacks ni colgar al PC
        log(f"{quien}: fallo atendiendo ({e!r})")
    finally:
        with vivo.cerrojo:
            vivo.pcs.pop(quien, None)
        try:
            conn.close()
        except OSError:
            pass
        log(f"Se va el {quien}")


def servir_pc(cfg, almacen, vivo, destinos):
    servidor = socket.socket()
    servidor.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    servidor.bind(("0.0.0.0", cfg["puerto_pc"]))
    servidor.listen()
    log(f"Puerto para el PC (RaceTec): {cfg['puerto_pc']}")
    while True:
        conexion, direccion = servidor.accept()
        endurecer(conexion)
        threading.Thread(target=atender_pc, args=(cfg, almacen, vivo, destinos, conexion, direccion), daemon=True).start()


def servir(cfg):
    global ARRANQUE
    ARRANQUE = instante()
    almacen, vivo, destinos = Almacen(cfg["carpeta"]), Vivo(), Destinos(cfg)

    def al_dejar_de_contestar(clave):
        """Pasa a copia (o se va). Si lo recibió todo en directo, su copia empieza en
        el final de hoy. Si hubo un hueco (estuvo caído) o ya tenía posición de
        copia, se respeta: se le reenvía desde ahí, y repetir no hace daño."""
        with vivo.cerrojo:
            vivo.huecos.discard(clave)
        if not os.path.exists(almacen.ruta_pos_copia(clave)):
            try:
                almacen.guardar_pos_copia(clave, almacen.pos_al_final())
            except OSError as e:
                log(f"No se ha podido guardar la posición de {clave}: {e}")
    destinos.al_dejar_de_contestar = al_dejar_de_contestar

    threading.Thread(target=hilo_subida, args=(cfg, almacen, vivo), daemon=True).start()
    threading.Thread(target=hilo_copias, args=(destinos, almacen, vivo), daemon=True).start()
    if cfg["clave_receptor"]:
        threading.Thread(target=hilo_sincronizar, args=(cfg, destinos, vivo), daemon=True).start()
        if cfg["puerto_pc"]:
            threading.Thread(target=servir_pc, args=(cfg, almacen, vivo, destinos), daemon=True).start()
    servidor = socket.socket()
    servidor.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    servidor.bind(("0.0.0.0", cfg["puerto"]))
    servidor.listen()
    log(f"Receptor Ultra escuchando en el puerto {cfg['puerto']}; lecturas en {cfg['carpeta']}")
    log("Destinos:", describir(destinos.todos()),
        "(los manda la pantalla «Receptor Ultra»)" if cfg["clave_receptor"] else "(de config.json)")
    while True:
        conexion, direccion = servidor.accept()
        endurecer(conexion)
        threading.Thread(target=atender, args=(destinos, almacen, vivo, conexion, direccion), daemon=True).start()


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
