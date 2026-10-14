# Receptor del Ultra

El RFID Ultra manda sus lecturas a nuestro servidor y este las sube a Camberas
en directo. Python 3, sin nada más que instalar.

```
                              ┌─► Outreach ─► RaceTec   (si "outreach" está puesto: contesta él)
Ultra ──TCP──► receptor.py ───┤
                (VPS)         └─► Camberas (ultra_registrar_lecturas)
                    │
                    └─ /root/ultra/lecturas/AAAA-MM-DD.txt  (todo, pase lo que pase)
```

Dos maneras de trabajar (`outreach` en `config.json`):

- `["82.113.145.105", 11111]` — **como siempre**: el Ultra sigue hablando con
  Outreach a través del receptor (Outreach contesta y RaceTec funciona igual) y
  el receptor, además, lee las lecturas y las sube a Camberas. Para trabajar
  por duplicado. Si Outreach no contesta, contesta el receptor.
- `null` — **sin Outreach**: contesta el receptor.

## Cómo funciona

- Cuando contesta el receptor, lo hace igual que Outreach (`OK` + número de la
  última lectura), y solo después de guardar la lectura en disco. Así el Ultra
  no repite lo que ya llegó y no se pierde nada si se corta la conexión.
- Sube a Camberas cada 2 segundos, en lotes de 500. Sin internet, espera y
  reintenta; las lecturas aguardan en `cola.jsonl`.
- Camberas pasa cada chip a su dorsal (Chips RFID) y no duplica: punto +
  lector + número de lectura + hora. Las lecturas de chips sin dorsal o de
  fuera de la ventana de la carrera no entran, y se dice en el registro.

## Protocolo del Ultra (visto el 14-oct pasando el tráfico de Outreach)

- Lectura, 31 bytes: `02 1c 01` · número (4) · chip (4) · segundos desde
  1980 en hora local (4) · milésimas (2) · … · lector (byte 20) · `03`.
  Todo en little-endian.
- Estado, cada segundo: `03 LL … 03 0d 0a` (LL bytes). Lleva la IP del Ultra.
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
   - `outreach`: `["82.113.145.105", 11111]` para seguir como siempre con
     Outreach y RaceTec, o `null` para prescindir de Outreach.
3. Servicio que arranca solo:
   ```
   cp receptor-ultra.service /etc/systemd/system/
   systemctl daemon-reload && systemctl enable --now receptor-ultra
   journalctl -u receptor-ultra -f
   ```
4. Puerto abierto en el cortafuegos de IONOS (TCP 23023).
5. En el Ultra, Settings › Remote: LAN, URL = IP del VPS, Port = 23023,
   «Send data to remote server» marcado.

## Reenviar un día

Si llegaron chips sin dorsal y luego se asignan en Chips RFID:

```
python3 /root/ultra/receptor.py --reenviar 2026-10-14
```

No duplica lo que ya estaba.
