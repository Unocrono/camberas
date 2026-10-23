# Receptor del Ultra

El RFID Ultra manda sus lecturas a nuestro servidor y este las guarda, las sube
a Camberas en directo y las replica a los servidores que se elijan en la
pantalla **Receptor Ultra** del panel (solo admin). Python 3, sin nada más que
instalar.

```
                                   ┌─► el que CONTESTA (p. ej. Outreach ─► RaceTec), en directo
Ultra ──TCP──► receptor.py (VPS) ──┼─► COPIAS (otros servidores), desde el disco
                    │              ├─► Camberas (ultra_registrar_lecturas)
                    │              └─► el PC de cronometraje (pc/RaceTec.ps1: U137.txt y SQL Server de RaceTec)
                    └─ /root/ultra/lecturas/AAAA-MM-DD.txt  (todo, pase lo que pase)
```

## Destinos

- **El que contesta** (como mucho uno): recibe el tráfico del Ultra tal cual y
  es quien le confirma las lecturas, como hacía Outreach. Así RaceTec sigue
  igual. Si no responde, se cae o se queda colgado (10 s sin contestar nada),
  contesta el receptor y lo vuelve a intentar cada 30 s. Lo que llegue
  mientras tanto no le llega a él (sí a Camberas y a las copias), pero queda
  apuntado desde dónde: si después se le pasa a copia, lo recibe todo.
- **Copias**: el receptor les manda cada lectura desde el disco, tal cual la
  mandó el Ultra, y apunta lo que confirma cada una (`OK` + número) en
  `copias/<servidor>.json`. Si una está caída, al volver recibe lo pendiente
  (de hoy y de ayer). Una copia nueva recibe lo de hoy desde el principio.
  Mientras el Ultra está conectado, les pasa también sus mensajes de estado.
  Al cambiar un servidor de papel puede recibir alguna lectura repetida
  (mismo número, chip y hora): no hace daño.
- **Ninguno**: contesta el receptor (`OK` + número de la última lectura) y
  solo después de guardarla en disco.

La lista sale de la pantalla si `config.json` trae `clave_receptor`: cada 15 s
el receptor deja allí su estado (Ultras conectados, pendientes de cada
destino…) y se lleva los destinos activos. Los cambios llegan en menos de
30 s, también con el Ultra conectado. La última lista se guarda en
`destinos.json` por si arranca sin internet.

Sin `clave_receptor`, los destinos salen de `config.json`: `destinos`
(`[{"nombre", "host", "puerto", "contesta"}]`) o, como antes, `outreach`
(`["82.113.145.105", 11111]` = Outreach contesta; `null` = contesta el
receptor).

## El PC de cronometraje (RaceTec)

El receptor abre un segundo puerto (`puerto_pc`, 23024) para el programa
`pc/RaceTec.ps1`, que hace en el PC lo que hacía Outreach: el fichero
`<identificador>.txt` y la llamada a `spInsertTime` en SQL Server. El
identificador y el timer name de cada Ultra se ponen en la pantalla Receptor
Ultra. Todo en `pc/README.md`.

## Camberas

- Sube cada 2 segundos, en lotes de 500. Sin internet, espera y reintenta;
  las lecturas aguardan en `cola.jsonl`.
- Camberas pasa cada chip a su dorsal (Chips RFID) y no duplica: punto +
  lector + número de lectura + hora. Las lecturas de chips sin dorsal o de
  fuera de la ventana de la carrera no entran, y se dice en el registro.

## Protocolo del Ultra (visto el 14-oct pasando el tráfico de Outreach)

- Lectura, 31 bytes: `02 1c 01` · número (4) · chip (4) · segundos desde
  1980 en hora local (4) · milésimas (2) · … · lector (byte 20) · `03`.
  Todo en little-endian.
- Estado, cada segundo: `03 LL … 03 0d 0a` (LL bytes). Lleva la IP del Ultra
  y, en el byte 33, el número de lector.
- Outreach contesta `OK0003021\r\n` (número de la última lectura) y, al
  estado, `03 00 06 03 0d 0a`.

## Instalar en el VPS

1. Copia `receptor.py` a `/root/ultra/receptor.py` y `config.ejemplo.json` a
   `/root/ultra/config.json`.
2. En `config.json`:
   - `clave_publica`: la clave pública de Supabase (la misma de la web).
   - `tokens`: para cada lector del Ultra (el número de la pantalla «Reader»,
     p. ej. 137), el token de su punto de cronometraje (lo que va detrás de
     `/timing?t=` en el QR). Usa un punto solo para el Ultra: el token se
     queda vinculado al receptor y un móvil ya no podrá usarlo.
   - `clave_receptor`: la de la pantalla Receptor Ultra › «Configuración del
     VPS» (necesita la migración `20261014233000_receptor_ultra_destinos.sql`).
     Sin ella, los destinos salen de `outreach`/`destinos`.
3. Servicio que arranca solo:
   ```
   cp receptor-ultra.service /etc/systemd/system/
   systemctl daemon-reload && systemctl enable --now receptor-ultra
   journalctl -u receptor-ultra -f
   ```
4. Puertos abiertos en el cortafuegos de IONOS: TCP 11111 (el Ultra) y
   TCP 23024 (el PC de RaceTec). Antes, `ss -ltnp | grep 11111` en el VPS
   para ver que nadie más lo usa.
5. En el Ultra, Settings › Remote: LAN, URL = IP del VPS, Port = 11111,
   «Send data to remote server» marcado. Es el mismo puerto que Outreach:
   para volver a Outreach si el receptor falla, basta con poner su IP
   (82.113.145.105) y dejar el puerto.

## Reenviar un día a Camberas

Si llegaron chips sin dorsal y luego se asignan en Chips RFID:

```
python3 /root/ultra/receptor.py --reenviar 2026-10-14
```

No duplica lo que ya estaba.
