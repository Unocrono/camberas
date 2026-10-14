# Camberas → RaceTec (programa del PC)

Hace en el PC de cronometraje lo que hacía Outreach: recibe las lecturas del
Ultra desde el receptor del VPS y las deja donde RaceTec las lee.

```
Ultra ──► receptor (VPS) ──puerto 23024──► RaceTec.ps1 (PC) ──┬─► U137.txt      (carpeta de lecturas)
                                                            └─► SQL Server     (dbo.spInsertTime → dbo.ChipTime)
```

Es un fichero de PowerShell: no hay que instalar nada en Windows.

## Instalar

1. Crea una carpeta, p. ej. `C:\Camberas\RaceTec`, y copia dentro `RaceTec.ps1`,
   `RaceTec.cmd` y `RaceTec.ejemplo.json` (renombrado a `RaceTec.json`).
2. Rellena `RaceTec.json`:
   - `clave`: la de la pantalla **Receptor Ultra › Configuración del VPS**
     (la misma que lleva el VPS en su `config.json` como `clave_receptor`).
   - `carpeta_ficheros`: donde Outreach dejaba `U137.txt` (en el JSON, las
     barras van dobles: `C:\\Users\\...`).
   - `formato_hora` y `lector_y_antena`: como lo tuvieras en Outreach (abajo).
   - `sql`: el SQL Server de RaceTec. Con `usuario` vacío entra con tu
     usuario de Windows, como la opción «Windows authentication» de Outreach.
     Pon `"sql": null` para escribir solo los ficheros.
3. Doble clic en `RaceTec.cmd`. Se para con Ctrl+C o cerrando la ventana.
4. En la pantalla **Receptor Ultra** de Camberas, a cada Ultra ponle su
   **identificador** (nombre del fichero: `U137` → `U137.txt`) y su **timer
   name** de RaceTec (`CP1`, `CP2`, `Finish`), que es la Location de
   `spInsertTime`. Cámbialo antes de cada carrera. Sin timer name se usa el
   identificador.
5. En el cortafuegos de IONOS tiene que estar abierto el puerto TCP 23024.

## Cómo funciona

- Guarda por dónde va en `cursor.json`, lectura a lectura, después de escribir
  el fichero y de que SQL Server la acepte. Si se cierra o se corta la
  conexión, al volver sigue donde se quedó: ni repite ni pierde.
- Sin conexión con el VPS reintenta sola (2 s, 4 s… hasta 30 s). Si SQL Server
  no responde, la lectura espera y se reintenta hasta que entra; mientras,
  nada avanza.
- La primera vez recibe las lecturas de hoy desde el principio. Después,
  si estuvo apagado, recupera lo de hoy y lo de ayer.
- Cada lectura va a `<identificador>.txt` del Ultra que la hizo.
- En SQL Server llama a `dbo.spInsertTime(@Location, @ChipCode, @ChipTime,
  @ReaderTime)`, que inserta en `dbo.ChipTime (TimingPoint, ChipCode,
  ChipTime)`. `@ReaderTime` lleva la misma hora.

## El fichero, como Outreach

Cada línea: `antena,chip,chip,"hora"` y, con `lector_y_antena` a `true`,
`,lector,antena` al final (el número de lector sale 1 hasta que sepamos
dónde lo manda el Ultra). Formatos de hora de Outreach y su equivalente:

| En Outreach | `formato_hora` |
|---|---|
| HH:MM:SS.SSS | `HH:mm:ss.fff` |
| DD/MM/YYYY HH:MM:SS.SSS | `dd/MM/yyyy HH:mm:ss.fff` |
| MM/DD/YYYY HH:MM:SS.SSS | `MM/dd/yyyy HH:mm:ss.fff` |
| YYYY/MM/DD HH:MM:SS.SSS | `yyyy/MM/dd HH:mm:ss.fff` |
| DD-MM-YYYY HH:MM:SS.SSS | `dd-MM-yyyy HH:mm:ss.fff` |
| MM-DD-YYYY HH:MM:SS.SSS | `MM-dd-yyyy HH:mm:ss.fff` |
| YYYY-MM-DD HH:MM:SS.SSS | `yyyy-MM-dd HH:mm:ss.fff` |
| sin milésimas (el U137.txt de hoy) | `dd/MM/yyyy HH:mm:ss` |

Sin milésimas, la hora se corta (no se redondea).

## Protocolo con el receptor (por si hace falta otro programa)

Texto, una orden por línea, campos separados por tabulador.

- PC → receptor, al conectar: `HOLA <clave> <cursor>`; el cursor es
  `{"desde":"AAAA-MM-DD","dias":{"AAAA-MM-DD":<bytes>}}` o `{}` la primera vez.
- Receptor → PC:
  - `HOLA	<nombre del receptor>	<cursor saneado>`
  - `LECTOR	<lector>	<identificador>	<timer name>` (uno por Ultra; se repite si cambia)
  - `LECTURA	<lector>	<nº>	<chip>	<AAAA-MM-DD HH:MM:SS.mmm>	<antena>	<día>	<posición>`
    (`día` y `posición` son el cursor que deja esa lectura)
  - `ESTADO	<json>` cada 5 s (el mismo que ve la pantalla; sirve de latido)
  - `ADIOS	<motivo>` si la clave no vale
