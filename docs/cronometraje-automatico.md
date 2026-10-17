# Cronometraje automático

Desde la migración `20261013180000_cronometraje_automatico.sql` Camberas saca
las clasificaciones sola a partir de las lecturas (chips RFID, puestos manuales
de `/timing` y lo que se apunte a mano), con vueltas y con tiempo chip. Antes
solo se calculaban al pulsar «Procesar Tiempos y Resultados».

## El recorrido de un dato

```
Lecturas Crono (fichero RFID) ┐
/timing (puesto por token)    ├─► timing_readings ─► motor ─► race_results  (clasificación)
Parciales a mano              ┘          │                └─► split_times   (pasos y vueltas)
Retiradas de /timing ─► race_results_abandons ─┘
```

Cada cambio en lecturas, retiradas, salida oficial, puntos de control,
dorsales o correcciones deja una marca (`cronometraje_marcas`). Cada 15
segundos `pg_cron` recalcula los recorridos marcados
(`cronometrar_pendientes`). En Resultados se ve el último cálculo, los avisos y
un interruptor para encenderlo o apagarlo por recorrido.

## Preparar un recorrido

1. **Horas de Salida**: la salida OFICIAL (`race_waves.start_time`). Es la
   pistola: el tiempo oficial se cuenta desde ella. Si se da tarde, hay que
   apuntarla (o darla desde `/start`).
2. **Puntos de Cronometraje**: las alfombras o puestos físicos.
3. **Puntos de Control** (grupo Eventos): la secuencia que recorre cada
   corredor, en orden. Cada punto lleva su alfombra y su tipo:
   - `START`: la alfombra de salida. Da la **salida chip** de cada corredor: su
     última lectura entre una hora antes de la pistola y el «tiempo máximo» del
     punto (5 minutos si está vacío). Nunca antes de la pistola.
   - `CONTROL`: pasos intermedios.
   - `FINISH`: la meta. Quien tiene paso por meta está FINALIZADO.

### Vueltas

Una vuelta es **un punto de control por paso** sobre la misma alfombra:
Salida, V1, V2, Meta, todos sobre `META` si es un circuito. El motor asigna los
pasos **en orden**: cada punto toma el primer paso por su alfombra posterior al
punto anterior. Dos lecturas de la misma alfombra separadas menos del **tiempo
mínimo de vuelta** son el mismo paso (1 minuto si está vacío; conviene ponerlo
un poco por debajo de la vuelta más rápida posible).

Si la meta está en la misma alfombra que las vueltas, conviene poner **tiempo
máximo** en las vueltas (y tiempo mínimo en la meta): así una vuelta sin leer
no descoloca las siguientes. Ejemplo, tres vueltas de 20 minutos: V1 con máximo
0:35, Meta con mínimo 0:50. Sin eso, a quien se le pierda la V1 se le asignaría
la V2 como V1 y la meta como V2, y saldría «en carrera».

El número de vuelta de cada parcial (`split_times.lap_number`) es el número de
paso por esa alfombra, igual que el «LAP» de Puntos de Control.

## Durante la carrera

- **Automático**: en marcha por defecto en las carreras de hoy en adelante.
  Las carreras que ya habían pasado al aplicar la migración quedan apagadas para
  no tocar lo publicado.
- **Seguro de salida**: si la salida oficial no cuadra con las lecturas (la
  mitad de los corredores pisó la alfombra de salida a más de 15 minutos de la
  pistola, o la mayoría de lecturas de control y meta son de antes de la
  salida), el motor no escribe nada y lo dice en Resultados. Pasa, por ejemplo,
  si la salida se dio tarde y no se apuntó, o si la hora está en otro día.
- **Avisos**: llegados con algún control sin paso (lectura perdida o atajo),
  dorsales repetidos, dorsales leídos que no están inscritos, retirados o no
  salidos con paso por meta.

## Correcciones

En Resultados, el lápiz de cada corredor:

- **Tiempo oficial corregido** (`tiempo_manual`): manda sobre las lecturas.
- **Penalización** (`penalizacion`): se suma al tiempo oficial y al chip.
- **Estado** (`estado_manual`): DNF, DNS, DSQ, fuera de control o finalizado.
  «Automático» deja el que salga de las lecturas y retiradas.

El motor **nunca** toca esas tres columnas: un recálculo las respeta. Vaciar el
campo vuelve a lo calculado. La importación CSV también escribe correcciones.

Las retiradas que apunta el cronometrador en `/timing` pasan solas a la
clasificación: ABANDONO → DNF, NO_SALE → DNS, DESCALIFICADO → DSQ. La última
manda; EN_CARRERA anula la anterior.

## Tiempo oficial y tiempo chip

- `finish_time`: tiempo OFICIAL publicado = (corregido o calculado) +
  penalización.
- `tiempo_calculado`: lo que sale de las lecturas, meta − pistola.
- `tiempo_chip`: meta − salida chip (+ penalización). Vacío si hay corrección.
- `race_distances.clasificar_por` (`oficial` | `chip`, en Resultados): con
  cuál se ordena la clasificación. Por defecto, el oficial.

## Para desarrolladores

| Pieza | Qué hace |
|---|---|
| `motor_pasos(recorrido, salida)` | SQL puro: los pasos asignados de cada corredor |
| `motor_salida_desfasada(recorrido, salida)` | el seguro de salida |
| `motor_cronometraje(recorrido)` | el cálculo completo; idempotente, solo escribe lo que cambia |
| `cronometrar_pendientes()` | lo que llama `pg_cron` (job `cronometraje-automatico`, cada 15 s) |
| `cronometrar_recorrido`, `cronometraje_automatico`, `cronometraje_estado` | RPC del panel (admin u organizador de la carrera) |
| `cronometraje_recorridos` | estado por recorrido; está en realtime y el panel lo escucha |
| `cronometraje_marcas` | cola de cambios (solo INSERT y DELETE) |

`generate_split_times` y `process_event_results` siguen existiendo y ahora usan
el motor nuevo. Las funciones internas están cerradas a `anon`,
`authenticated` y `PUBLIC`.

Para pararlo todo: `SELECT cron.unschedule('cronometraje-automatico');`

## Pendiente

- **GPS como paso virtual**: `process-gps-geofence` lee `gps_tracking`, que ya
  no escribe nadie; la app escribe en `gps_positions`. Hasta reescribirla, el
  cronometraje por GPS no genera lecturas.
- **Clasificación pública**: `/:slug/live` lee `registrations` directamente y
  los visitantes sin sesión no pueden (RLS desde julio): la ven vacía.
- **Importación RFID**: guarda al segundo (pierde las milésimas), no evita
  duplicados al reimportar y no entiende el formato nativo del lector Ultra.
- **Lecturas Crono**: editar una lectura pone los segundos a cero.
- **Salidas de carreras pasadas**: la Garita (+1 h) y la Virgen de la
  Esperanza (+1 día y 2 h) tienen la salida oficial descuadrada con sus
  lecturas; el seguro de salida impide recalcularlas hasta corregirla.
