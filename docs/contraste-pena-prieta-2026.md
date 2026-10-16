# Contraste del motor del PR #11 con Peña Prieta 2026

Estado: 16-oct-2026. Motor: rama `claude/cronometraje-automatico`, migración
`20261013180000_cronometraje_automatico.sql` (sin aplicar). Todo se hizo en local: nada de producción.
Vocabulario y marcas, las de `docs/libro-cronometraje.md`.

**En corto.**

- El motor calcula lo que dice: 0 diferencias con un cálculo independiente y 111 de 111 metas iguales a la
  primera lectura de RaceTec.
- Lo que falla está en lo que da por bueno. La salida oficial del 8K va 1:38 por delante de la alfombra, y el motor
  no avisa. Una etiqueta junto a la pistola (Sky 70) sale «en carrera» y 1.ª en CP2. Si el U479 entra como un solo
  punto, la Marcha la gana una retirada en 0:28:29.
- Hay seis arreglos que conviene meter en el PR #11 antes de aplicarlo (§3, marca [PR #11]). El resto son reglas
  nuevas para el libro.

---

## 1. Qué carrera, qué datos y cómo se cargó

**Carrera.** Peña Prieta 2026 (Maratón Logroño SkyRace), 3-oct-2026. Tres pruebas, todas de un recorrido:

| Prueba (RaceTec) | En Camberas | Salida oficial | Dorsales | Puntos de control |
|---|---|---|---|---|
| SKY RACE 36K | Sky | 09:02:23 | 1–70 | Salida, CP1, CP2, CP3, CP4, Meta |
| SKY RACE 8K | Trail | 09:28:23 | 301–350 | Salida, CP4, Meta |
| MARCHA 8K | Marcha | 09:28:23 | 501–570 | Salida, CP4, Meta |

**Lectores.**

| Control | Lector | Fichero | Pasan |
|---|---|---|---|
| Salida | U479 | `U479_Salida.txt` (convertido del export `Salida.txt` de RaceTec) | las tres |
| CP1 | J81 (Ultra) | `J81.txt` | Sky |
| CP2 | pistola | `Pistola.txt` | Sky |
| CP3 | J82 (Ultra) | `J82.txt` | Sky |
| CP4 | J83 y J200 (Ultra, dos lectores) | `J83.txt`, `J200.txt` | Sky; el 8K solo por J83 |
| Meta | U479 | `U479_Meta.txt` (convertido de `Meta.txt`) | las tres |

Los exports de RaceTec solo se usaron para los nombres y para saber la prueba de cada dorsal. Las horas son de pared
y no se convirtió ninguna. De la pistola vale la columna de texto.

**Cómo se cargó.** `cargar.py` genera el SQL para la copia local del motor (base `crono_automatico`, Postgres 16):

- Una carrera, 3 recorridos con su ola y 6 puntos de cronometraje: SALIDA, CP1, CP2, CP3, CP4 y META.
- **J83 y J200 van al mismo punto CP4.** En producción no se puede: un punto de control lee de un solo punto de
  cronometraje (libro §3.2). Ver H6.
- **El U479 se partió en SALIDA y META por fichero**, como hizo RaceTec. El receptor no puede hacer eso: da un token
  por lector. Ver H3.
- Pistola: hora de texto con `.000`, así que pierde las milésimas.
- 190 inscripciones: todas las filas de `chips_*.txt` (70 + 50 + 70). Solo 117 tienen nombre. Las tablas son rangos
  enteros, no la lista de inscritos. Ver H14.
- Los km de CP1–CP4 son inventados (7/18/27/33 en la Sky, 4 en el 8K). Los de meta (36 y 8) son los reales.
- Sin sexo ni categoría.
- 5.996 lecturas. Se cargan las 5.514 con dorsal. **Las 482 de chips sin dorsal no se cargan**, igual que hace
  `ultra_registrar_lecturas` en producción:

| Salida | J81 | Pistola | J82 | J83 | J200 | Meta | Total |
|---|---|---|---|---|---|---|---|
| 66 | 105 | 69 | 80 | 77 | 44 | 41 | 482 |

**Cómo se ejecutó.** `motor_cronometraje` sobre cada recorrido (`ejecutar.sql`), con volcado de `race_results` y
`split_times` a CSV (`volcar.sql`). Los ficheros y los scripts se quedan fuera del repo porque llevan nombres de
corredores.

**Qué dio el motor** (`ejecucion.txt`):

| Prueba | Corredores | Llegados (FIN) | En carrera (STD) | Parciales | Avisos | Clasifica por | Tiempo |
|---|---|---|---|---|---|---|---|
| Sky | 38 | 33 | 5 | 213 | 1: `meta_sin_paso` «23: CP3, 26: CP3, 48: CP2» | oficial | 31 ms |
| Trail | 30 | 30 | 0 | 90 | 0 | oficial | 24 ms |
| Marcha | 50 | 48 | 2 | 146 | 0 | oficial | 36 ms |

Ganadores: Sky 50 (3:47:06,1), Trail 339 (0:42:36,0), Marcha 526 (1:18:47,6). Ningún recorrido quedó bloqueado por el
seguro de salida.

---

## 2. Resultado del contraste

Se contrastó con dos cosas:

- **Cálculo independiente**: Python sobre los ficheros crudos, sin pasar por la base. Usa las mismas reglas (ventana
  de salida de −1 h a +5 min, hueco de 1 min y primera lectura posterior al paso anterior). Comprueba que el motor
  está bien escrito, no que sus reglas sean buenas.
- **Meta de RaceTec**: la primera lectura de cada dorsal en `Meta.txt`. No es la clasificación publicada, que no
  tenemos.

| Prueba | Inscritos (carga) | Con lecturas | Llegados | En carrera | Sin datos | Igual que el independiente | Meta = RaceTec |
|---|---|---|---|---|---|---|---|
| Sky | 70 | 38 | 33 | 5 | 32 | 70 de 70 | 33 de 33 |
| Trail | 50 | 30 | 30 | 0 | 20 | 50 de 50 | 30 de 30 |
| Marcha | 70 | 50 | 48 | 2 | 20 | 70 de 70 | 48 de 48 |
| **Total** | **190** | **118** | **111** | **7** | **72** | **0 diferencias** | **111 de 111** |

- Se comparó estado, puesto, tiempo oficial, tiempo chip y la hora de cada paso, al milisegundo. Los 449 parciales del
  motor son los 449 pasos del independiente. No hay empates.
- Una tercera implementación desde los crudos reproduce también estado, tiempo oficial y tiempo chip de los 190.
- Lo que no se contrastó: el tiempo de los 7 «en carrera». El motor les escribe su último parcial (Sky) o 00:00:00
  (Marcha 542 y 555), y el independiente lo deja en blanco. Ver H5.
- Los «sin datos» son 62 dorsales sin ninguna lectura más 10 que solo salen en la recogida de dorsales de la pistola.

**Conclusión:** en el cálculo no hay nada que corregir. Los hallazgos salen de mirar los crudos, no de la
comparación.

---

## 3. Hallazgos confirmados

Del más grave al más leve. Cada uno se comprobó dos veces por separado, contra los ficheros y contra la base local.
Las correcciones de esas comprobaciones ya están dentro del texto.

- **[PR #11]**: conviene arreglarlo en el PR antes de aplicarlo.
- **[PENDIENTE]**: regla nueva para el libro.

| # | Hallazgo | Gravedad | Marca |
|---|---|---|---|
| H1 | La salida oficial del 8K va 1:38 por delante de la alfombra | alta | [PR #11] + dueño |
| H2 | Sky 70, una etiqueta junto a la pistola, sale «en carrera» y 1.ª en CP2 | alta | [PR #11] |
| H3 | Con el U479 como un solo punto, la Marcha 555 gana en 0:28:29 | alta (si se monta así) | [PR #11] |
| H4 | 13 chips sin dorsal hacen recorrido de corredor y se pierden sin aviso | media | [PENDIENTE] |
| H5 | Los «en carrera» se quedan así para siempre y publican un tiempo | media | [PR #11] + [PENDIENTE] |
| H6 | CP4 con dos lectores: el reloj de J200 va 70 s atrasado | media | [PENDIENTE] |
| H7 | La pistola: epoch con milisegundos, otros días y la recogida de dorsales | media | [PENDIENTE] |
| H8 | El seguro de salida (b) cuenta líneas y en vivo podría bloquear | media | [PR #11] |
| H9 | Lecturas perdidas: el aviso acierta pero se queda corto; el 21 sin tiempo chip | baja | [PENDIENTE] |
| H10 | Ritmo, puesto en Salida, sexo y categoría sin datos que los sostengan | baja | [PR #11] |
| H11 | Etiquetas de prueba y lectores mudos | baja | [PENDIENTE] |
| H12 | Paradas largas y vueltas a la meta | baja | (el motor lo hace bien) |
| H13 | Líneas repetidas y fuera de orden en los ficheros | baja | [PENDIENTE] |
| H14 | Dorsales sin lectura: la tabla de chips es la tanda entera | baja | [PENDIENTE] |
| H15 | Chips de la Marcha fuera de la fórmula; la meta subió con retraso | baja | datos |

### H1. La salida oficial del 8K (09:28:23) va 1:38 por delante de la alfombra · alta · [PR #11] + dueño

**Qué pasa.** Trail y Marcha dejan la alfombra hacia las 09:30:01. La pistola parece haberse dado entonces, no a las
09:28:23.

**Evidencia** (última lectura de cada dorsal en la alfombra de salida):

| Prueba | Dejan la alfombra | Respecto a la oficial |
|---|---|---|
| Sky | 35 de 36 entre 09:02:23,3 y 09:02:28,9 (p10: 09:02:23,6) | +0,3 a +5,9 s. Cuadra: sirve de testigo |
| Trail | los 30 entre 09:30:01,1 y 09:30:04,8 | +98 a +102 s |
| Marcha | 49 de 50 entre 09:30:06,2 y 09:30:27,7, detrás del Trail | +103 a +125 s |
| 8K entero (80) | p5 09:30:01,2; p10 09:30:01,8 | +1:38,8 |

- El ganador del Trail (339) está sobre la alfombra desde las 09:28:07,6, con 93 lecturas sin huecos, y la deja a las
  09:30:01,1. Estaba parado cuando supuestamente sonó la pistola. Entre 09:28:23 y 09:29:23 hay 575 lecturas de 23
  dorsales del Trail quietos.
- Las dos excepciones no cuentan: el 51 (Sky) se va un minuto antes y la 542 (Marcha) no salió (09:29:37,8).
- El reloj del U479 no salta: en `Salida.txt`, la diferencia entre Create Date y Chip Time es de 0,6 a 15,6 s en todos
  los bloques entre las 08:4x y las 09:5x.
- 09:28:23 es exactamente 09:02:23 + 26:00. ¿Es la prevista?

**Efecto.** Oficial − chip: Sky de 0 a 5,9 s; Trail de 1:38,1 a 1:41,8; Marcha de 1:43,2 a 2:04,7. Los 78 llegados
del 8K llevan unos 1:38 de más. El 339 tiene 0:42:35,97 de oficial y 0:40:57,86 de chip. El orden del Trail no
cambia. En la Marcha, 11 pares cambian de orden si se clasifica por chip.

**Qué hace el motor.** Oficial = meta − 09:28:23. El seguro de salida (a) mira la mediana de la última pisada, que
está a +99,7 s (Trail) y +116,7 s (Marcha). Solo salta a partir de 15 min, así que no dice nada. Además hay un hueco:
con 5–15 min de retraso, la ventana del tiempo chip (+5 min) se cierra antes de la salida real. El chip saldría mal y
nadie avisaría.

**Qué debería hacer.**

- Un **aviso que no bloquee** cuando el p10 de la última pisada se aleje más de 30–60 s de la oficial. Texto, por
  ejemplo: «La cabeza dejó la alfombra 1:38 después de la salida oficial del 8K: ¿se dio hacia las 09:30:00?», con
  enlace a Horas de Salida.
- El p10 se calcula con **la ola entera**: todos los recorridos con la misma salida oficial y la misma alfombra. Por
  recorrido, la Marcha diría «09:30:07» porque va detrás del Trail.
- Un percentil bajo, nunca el mínimo: el 51 y la 542 darían salidas falsas.
- Que no salte cuando se clasifica por chip.
- No corregir la hora solo.
- Hasta que el dueño confirme la hora, no publicar el 8K por tiempo oficial.

### H2. Sky 70: una etiqueta junto a la pistola sale «en carrera» y 1.ª en CP2 · alta · [PR #11]

**Qué pasa.** El chip 25162670 (dorsal 70) se comporta como una etiqueta dejada al lado de la pistola. El motor lo
toma por el primero de la Sky en CP2.

**Evidencia.**

- No tiene nombre ni ninguna lectura en Salida, J81, J82, J83, J200 ni Meta.
- Tiene 37 lecturas, todas de la pistola y del 03/10:
  - 17 de 07:38:27 a 07:41:54, durante la recogida de dorsales.
  - 20 de 11:05:53 a 11:24:14: cada ~10 s hasta las 11:08:40, y luego a las 11:10:48, 11:11:00 y 11:24:14.
- Entre las 11:05:53 y las 11:24:14 la pistola no lee nada más. Es la misma pauta del chip 0 de madrugada.
- El primer corredor de verdad pasa por la pistola a las 11:28:02 (el 50), 22 min después.
- RSSI de −24 a −76; los corredores van de −53 a −80.

**Qué hace el motor.**

- Sin salida, cuenta desde la oficial. CP1 no tiene paso y se salta.
- CP2 toma la primera lectura posterior a 09:02:23, la de las 11:05:53.
- Queda STD con 2:03:30 y 1.º en CP2 (ritmo 06:51). El 50 baja a 2.º y todos los demás un puesto.
- En la web saldría el primero del bloque «en carrera», con 02:03:30 y 3:26/km.
- Ojo: el 70 existe porque la carga inscribió toda la tabla de chips. Si en producción no está inscrito, el motor
  ignora sus lecturas y da el aviso `dorsal_sin_inscripcion`.

**Qué debería hacer.**

- **Un paso aislado va a aviso.** Es un paso sin salida, sin control anterior ni posterior y sin meta. No da STD, ni
  puesto en el parcial, ni tiempo publicado hasta que alguien lo revise. En las tres pruebas solo lo cumple el 70. No
  vale «sin salida» a secas: el 21 no tiene salida y llegó.
- **Detector de etiqueta parada**: el mismo chip cada ~10 s durante minutos, sin otros chips en medio.
- Señal secundaria: una ventaja anómala sobre el segundo (aquí 22 min, un 15 %).
- `min_time` no lo arregla. Con CP2 ≥ 2:15 se descarta la lectura de las 11:05:53, pero queda la de las 11:24:14
  (2:21:51) y sigue 1.º. Habría que ponerlo a menos de 4 min del ganador.
- Que las etiquetas de prueba no lleven un dorsal de carrera ni estén inscritas.

### H3. Si el U479 entra como un solo punto, la Marcha 555 gana en 0:28:29 · alta (si se monta así) · [PR #11]

**Qué pasa.** Salida y meta las lee el mismo U479. Si llega todo a un solo punto de cronometraje, una retirada que
vuelve a pisar la alfombra cuenta como llegada.

**Evidencia.**

- `Salida.txt` y `Meta.txt` traen en todas sus filas el mismo controlador U479, Reader 0, antena 0. RaceTec lo repartió
  por hora: «Start» de 08:43:19,5 a 09:56:57,0 y «U479» de 10:10:59,0 a 16:49:15,3.
- La carga lo separó por fichero. El receptor no puede: da un token por lector (`config.json › tokens`, libro §5.1
  paso 4).
- La 555 sale entre las 09:30:10 y las 09:30:14 y vuelve a la alfombra de 09:56:52 a 09:56:57. No la lee nadie más.
- Probado con el motor real, en una transacción con ROLLBACK, y con una simulación aparte. Sky y Trail quedan igual.
  La Marcha pasa a 49 llegados, con la 555 1.ª en 0:28:28,98 (chip 0:26:37,06), por delante de la 526 (1:18:47,6). El
  seguro de salida no lo frena.

**Qué hace el motor.** La meta es la primera lectura posterior a la salida chip más el hueco de 1 min. `min_time`
existe, pero nadie lo rellena. El motor sí avisa (`meta_sin_paso` «555: CP4»), pero el aviso no le quita el puesto
ni el podio. Además, se mezcla con las lecturas perdidas (23, 26 y 48).

**Qué debería hacer.**

- Decidir con el dueño cómo entra el U479 en producción.
- En la comprobación de estructura: si START y FINISH comparten punto de cronometraje, **`min_time` en META
  obligatorio**. Por ejemplo 3 h en la Sky, 30 min en el Trail y 40 min en la Marcha (los ganadores hicieron 3:47,
  0:42 y 1:18). Ojo: `min_time` se mide desde la salida oficial, no desde la chip.
- Una llegada sin paso por ningún control con alfombra se queda sin puesto hasta que se revise.

### H4. 13 chips sin dorsal hacen recorrido de corredor y se pierden sin aviso · media · [PENDIENTE]

**Qué pasa.** Entre las 482 lecturas sin dorsal hay chips que corren junto a inscritos. RaceTec tampoco les da dorsal
(Race No vacío en 66 lecturas de `Salida.txt` y 41 de `Meta.txt`). De las 482, 27 son de la pistola de otro día y
21 del chip 0.

| Chip | Prueba probable | Pasos | Va con |
|---|---|---|---|
| 7293453 | Sky | completo: salida 09:02:27 … meta 14:34:16 (5:31:53) | 26 (a 2–5 s en 4 puntos). Lo leen J82 y J83, justo donde al 26 no |
| 1544082 | Sky | salida, CP1, CP2, CP3 y J83 (15:00:50), sin meta | 46 (en la pistola, al mismo segundo) |
| 1134606 | 8K | completo, meta 10:57:43 | 322/507 o 335 |
| 3921721 | 8K | completo, meta 11:19:22 | 321, 524 |
| 642001 | 8K | completo, meta 11:27:33 | 543; a 17 ms de 13034732 |
| 13034732 | 8K | J83 10:42:55 y meta 11:27:33, sin salida | 642001 |
| 2304634319 | 8K | completo, meta 11:34:30 | 548 |
| 863013 y 6530984 | 8K | completo, meta 11:49:49–55 | 510/511/513; entre sí, a 10 ms |
| 2737657853 | 8K | salida y meta 11:57:31, sin J83 | — |
| 95462, 1846087, 562086 | 8K | salida y J83, sin meta | — |

Son 13 chips, no 13 personas: 7 hacen el recorrido completo. Los pares a pocos milisegundos pueden ser una persona con
dos etiquetas. 7293453 y 1544082 pueden ser segundos chips del 26 y del 46.

**Qué hace el motor.** No las ve, porque la carga las descarta, igual que en producción (libro §3.4).
`dorsal_sin_inscripcion` solo cubre lecturas que traen dorsal. En producción no se pierden del todo: están en el
fichero del VPS y `--reenviar` las sube después de asignar el chip. Pero nadie avisa de que existen.

**Qué debería hacer.**

- Aviso «N chips sin dorsal con recorrido de corredor»: leídos en meta o en 2 o más puntos, dentro de la ventana. Que
  diga la prueba probable, el dorsal con el que van y en cuántos puntos coinciden.
- Proponer las dos explicaciones: segundo chip de un dorsal (si rellena pasos que le faltan, como 7293453 con el CP3
  del 26) o corredor sin inscribir.
- Guardarlas en una tabla aparte de lecturas sin dorsal: en producción `timing_readings.bib_number` es NOT NULL. Al
  asignar el chip, que pasen a `timing_readings` en el servidor y se recalcule, sin SSH. Es la fila 5 del plan.
- Las de un solo punto van a la lista de etiquetas (H11).

### H5. Los «en carrera» se quedan así para siempre y publican un tiempo · media · [PR #11] + [PENDIENTE]

| Dorsal | Último paso | Motor | Lo probable |
|---|---|---|---|
| Sky 30 | CP2 13:20:36 | STD 4:18:13 | retirado después de CP2 |
| Sky 34 | J83 15:15:36,8, sin J200 | STD 6:13:13,8 | retirado en CP4 |
| Sky 43 | J83 15:14:22,8 y J200 15:15:33 | STD 6:11:59,8 | ¿retirado en el último tramo o meta perdida? |
| Sky 28 | J83 15:34:10,4 y J200 15:35:19 | STD 6:31:47,4 | lo mismo |
| Marcha 542 | 71 lecturas en la alfombra de 09:01:54 a 09:29:37,8; nada más | STD 0:00:00, 1.ª en el parcial de Salida | no salió |
| Marcha 555 | sale a las 09:30:14; vuelve a la alfombra de 09:56:52 a 09:56:57; nada más | STD 0:00:00 | retirada |

- El 70 no es un retirado (H2). El 1544082 no tiene dorsal (H4).
- La meta siguió leyendo hasta las 16:49:15 (el 41, que pasó CP4 a las 16:21). El 51 pasó CP4 después que el 28 y
  llegó a las 16:03. De CP4 a meta se tardó de 12:49 a 28:01 (mediana 18:39). No hubo corte en CP4.
- Después de las 14:01, J200 leyó a todos los que pasaron por J83 salvo al 34 y al 1544082.

**Qué hace el motor.**

- STD sale de tener un paso o una salida chip. No hay ninguna regla de cierre: el motor no mira el tiempo límite ni la
  hora del último llegado. Solo cambia con una retirada o un estado manual.
- Para un STD, el motor escribe en `finish_time` (el tiempo que se publica) el último paso − salida. Si solo tiene
  salida, 0:00:00.
- La web pinta ese tiempo y su ritmo: el 28 con 6:31:47 y ritmo sobre 36 km; la 542 y la 555 con 0:00:00 y 0:00/km,
  al final de la Marcha.
- La 542 sale 1.ª en el parcial de Salida.

**Qué debería hacer.**

- [PR #11] **No publicar el último parcial como tiempo de un STD.** La web debe decir «en carrera · último paso CP4
  15:34». `finish_time` es NOT NULL (`20251120200905`, `types.ts`): o se hace una migración y se revisan sus lectores,
  o la web deja de pintarlo para los STD. `tiempo_calculado` sí admite NULL.
- [PR #11] No dar puesto en el parcial de Salida.
- [PENDIENTE] Las propuestas de la decisión 7, sin aplicarlas: CUT a quien llega después del tiempo límite y DNS al
  inscrito sin lecturas.
- [PENDIENTE] Propuestas nuevas, a consultar con el dueño:
  - «sin meta tras CP4: ¿retirado o lectura perdida?» (28 y 43);
  - «salió y no tiene más pasos» (542, y que el cronometrador elija DNS o DNF);
  - «vuelve a la alfombra de salida» (555);
  - un STD sin lecturas desde hace mucho, cuando ya llegaron los que iban detrás.

### H6. CP4 con dos lectores: el reloj de J200 va 70 s atrasado · media · [PENDIENTE]

**Qué pasa.** J200 no lee «1:10 después porque está más adelante». Su reloj va unos 70,4 s por detrás del de J83.

**Evidencia.**

- 19 dorsales leídos por los dos lectores, todos después de las 14:01. Última de J200 − última de J83: mediana
  70,4 s, entre 68,1 y 72,8. No cambia con la velocidad ni con la hora: es reloj, no distancia.
- El 23 lo deja claro. J83 lo lee una vez, a las 15:06:20,5. J200 lo lee de 15:06:33,7 a 15:07:31,4. Corregido, J200
  lo ve de 15:05:23 a 15:06:21, y la lectura de J83 cae justo al final, a 0,5 s. Si fuera distancia, habría hecho el
  tramo en 13 s.
- J200 leyó etiquetas de 09:31 a 09:33 y a las 09:54:53. **No tiene ninguna lectura de 09:54:55 a 14:01:41.** Su
  primer corredor es el 39, a las 14:04:50. No vio a nadie del 8K ni a los 15 primeros de la Sky.
- Solo J83 lee al 34 y al 1544082. Solo J200 lee al 26.
- La etiqueta 167 no sirve de testigo: da +67, +70 y −20 s según el momento.

**Qué hace el motor.** Con J83 y J200 en el mismo punto, toma la primera lectura en hora bruta. Como J200 va atrasado,
J83 gana en los 19 dobles. Solo el 26 sale de J200: CP4 a las 14:16:36 y 20.º; corregido, 14:15:25,8 y 19.º. La meta
no cambia. Al 23 le toca 15:06:20.

En producción esto no se puede montar: J200 iría en su propio punto y el 26 saldría en el aviso «26: CP3, CP4». Y si
el reloj del secundario fuera adelantado, «la primera de los dos» cogería el secundario para todos.

**Qué debería hacer** (cuando se haga la fila 8 del plan, principal + respaldo):

- Usar J83 de referencia y J200 corregido solo para quien falte, con aviso por cada paso que salga del respaldo.
- Desfase por lector, estimado con la mediana última−última de los corredores leídos por los dos. Con un mínimo de
  pares, su dispersión y su ventana de validez (aquí solo desde las 14:01). Nunca con etiquetas. Enseñarlo antes de
  aplicarlo.
- Aviso cuando dos lectores del mismo control discrepen de forma sistemática (más de 30 s).
- La fila 16 (offset por lector) deja de ser «no esencial» si se hace la 8.
- El cronometrador: sincronizar todos los lectores, también los de respaldo, y apuntar a qué hora arranca cada uno.

### H7. La pistola: epoch con milisegundos, otros días y la recogida de dorsales · media · [PENDIENTE]

**Evidencia.**

- 180 lecturas. El epoch leído como UTC da la hora de texto más 0,008–0,999 s, en todas. Es la hora de pared con
  milisegundos. Pasado a Madrid sumaría 2 h, y el 50 pasaría CP2 a las 13:28, después de su meta (12:49).
- Otros días: 27 lecturas el 01/10 (15 chips de otras tandas).
- Noche del 03/10, de 00:03 a 00:07: 36 lecturas (chip 0 cada 10 s, 25162012 y 25162017).
- Ráfaga de recogida, de 07:38:26 a 07:38:28: 31 chips de carrera (12 Sky, 15 Trail, 4 Marcha). Diez no se vuelven a
  leer en todo el día: Sky 2, 35, 36, 68 y 69; Trail 301, 302, 304 y 330; Marcha 540. Los otros 21 corrieron.
- La pistola no leyó al 48.

**Qué hace el motor.** La carga toma el texto (bien), con `.000` (pierde las milésimas). Lo de las 07:38 no cuenta,
porque todo paso exige una hora posterior a la salida. Lo de otros días no casa con nadie.

**Qué debería hacer** (entrada de la pistola, fila 18):

- Hora de pared = epoch leído como UTC, solo si su segundo coincide con el texto. Si no, el texto. Así, si el
  fabricante arregla el epoch, la hora no se mueve 2 h sin avisar. Nunca convertir.
- Filtrar por fecha y por ventana: las de las 00:03 son del mismo día.
- Descartar el chip 0.
- La ráfaga no sirve para proponer DNS, porque 21 de los 31 corrieron. El DNS sale de «inscrito sin ninguna lectura
  en la ventana».

### H8. El seguro de salida (b) cuenta líneas y en vivo podría bloquear · media · [PR #11]

**Evidencia.**

- La Sky tiene 28 lecturas de control 15 min o más antes de la salida: las de la pistola de 07:38 a 07:41 (12
  dorsales, 17 de ellas del 70). El seguro salta con más de 50 y más que las de después.
- Con la carrera acabada hay 691 lecturas después: no hay riesgo. Pero en vivo, de 09:02:23 a 09:42:01 (primer paso
  por CP1), las de después son 0.
- Si una recogida con más de 50 lecturas se hace en un lector de control, el motor no calcula nada en ese rato. Y dice
  «Revisa Horas de Salida», que invita a tocar una hora que está bien.
- La parte (b) es la única que detecta un día mal puesto. Con la salida el 04/10, la (a) no ve nada y la (b) salta (719
  antes y 0 después). Por eso no hay que quitarle lo de otro día.

**Qué debería hacer.**

- Contar dorsales distintos, no líneas (aquí 12, no 28).
- No contar las lecturas de control anteriores a la primera lectura del recorrido en su alfombra de salida (aquí las
  08:44:51, frente a las 07:38).
- Si la (a) confirma la hora (10 o más dorsales y la mediana cerca), la (b) solo avisa. Con 0 lecturas después,
  avisar en vez de bloquear.

### H9. Lecturas perdidas: el aviso acierta pero se queda corto; el 21 sin tiempo chip · baja · [PENDIENTE]

**Evidencia.**

- El aviso de la Sky, «23: CP3, 26: CP3, 48: CP2», acierta: son lecturas perdidas, no atajos. Los tramos saltados van
  a un ritmo normal para cada uno. Por ejemplo, el 48 tarda 228 min de CP1 a CP3, y corredores de su nivel tardan
  213–234.
- Ningún dorsal tiene un control con hora anterior al previo. En el 8K, todos los llegados tienen J83 y salida.
- Al 26 no lo leen J82 ni J83. En esos dos puntos sí leen al chip 7293453, que va con él.
- **El 21** no tiene ninguna lectura de salida, pero sí de CP1 a CP4 y meta. Queda FIN 30.º, 6:33:14, con el tiempo
  chip vacío y sin ningún aviso.
- Tampoco salen en ningún aviso: el 26 con su CP4 sacado del lector secundario, el 70, los STD sin meta, ni la 542 y
  la 555.

**Qué hace el motor.** `meta_sin_paso` solo mira a los FIN y a los puntos CONTROL. El tiempo chip solo se calcula si
hay salida chip. Al clasificar por chip ya usa el oficial cuando falta el chip.

**Qué debería hacer.**

- Aviso «llegado sin salida chip», y tiempo chip = oficial, marcado «sin salida detectada», como Wiclax. Es el hueco
  que ya apunta el libro. En la Sky no cambia nada (≤ 6 s). En el 8K le costaría unos 1:40 (Trail) o 1:57 (Marcha). No
  estimar una salida a partir de los demás.
- Para saber si un tramo saltado es atajo: un atajo es un tramo demasiado rápido. Hay que compararlo con el más rápido
  y con el ritmo del propio corredor, no con la mediana.
- Avisos aparte para «en carrera sin meta» (H5) y «solo lecturas en un punto» (H2), sin meterlos en «lectura perdida
  o atajo».

### H10. Ritmo, puesto en Salida, sexo y categoría sin datos que los sostengan · baja · [PR #11]

- El ritmo se mide desde la salida oficial. El 339 lleva 7:18/km en CP4 contando 1:38 parado en la alfombra (H1).
  Aquí además los km de CP1–CP4 son inventados.
- El puesto en Salida es el orden de la última lectura, recortada a la oficial. El 51 sale 1.º de la Sky con 0:00:00
  y la 542 1.ª de la Marcha. No significa nada.
- Sin sexo, todos caen en «X» y se clasifican como un grupo: el puesto por sexo es igual a la general en los 111. Lo
  mismo con la categoría vacía. Con estos datos no se puede contrastar.

**Qué debería hacer.**

- No dar puesto en la Salida.
- Ritmo desde la salida chip o por tramo. Si los km no están, no mostrar ritmo.
- Puesto por sexo vacío cuando el sexo es desconocido, con un aviso «N corredores sin sexo». Lo mismo con la
  categoría. Mantener «X» para quien se inscriba así.

### H11. Etiquetas de prueba y lectores mudos · baja · [PENDIENTE]

| Chip | Dónde | Qué parece |
|---|---|---|
| 167 | J82 08:13, J81 08:19, J83 09:24–16:25, J200 09:31–16:25 | etiqueta de prueba (arranque y cierre) |
| 64 | J81, J83, J200 | etiqueta de prueba. El Sky 64 no tiene ninguna lectura: chip = dorsal lo confundiría |
| 269 | J81, 73 lecturas de 08:19 a 10:47 | etiqueta parada |
| 151 | J82, 72 lecturas de 09:50 a 11:45 | etiqueta parada |
| 2885681152, 8400896, 1100001500 | J83 09:24:40; J200 14:01:41; meta 16:35:42–54 | etiquetas |
| 0 y 25162670 (Sky 70) | pistola | etiquetas (H2) |
| 2586560, 880761, 3697311149, 2820920127 | J81 09:05–09:25; meta 12:49–14:12; salida 08:58–09:31; J200 09:32 | organización o gente parada |
| 153549 | J83 10:38–10:39 | coincide con el grupo de la Marcha: dudoso |
| 895755 | J82 15:31:46, después del último Sky | ¿la escoba? |

Primer corredor de cada lector: J81 09:42:01 (59), pistola 11:28:02 (50), J82 12:09:46 (50), J83 09:57:36 (339),
J200 14:04:50 (39), meta 10:10:58 (339).

**Qué hace el motor.** Lo sin dorsal no le llega: bien. Pero nada dice cuándo arrancó, cerró o se calló cada lector.
J200 estuvo mudo de 09:55 a 14:01 mientras pasaban 15 corredores de la Sky por J83.

**Qué debería hacer.** Una lista de etiquetas por lector, y con ella enseñar arranque, cierre y **huecos** de cada
lector (pantalla Receptor Ultra). Meter ahí también los chips de carrera con patrón de etiqueta (H2). Separarlos de los
desconocidos con recorrido de corredor (H4). «Chip = dorsal» ya está descartado (decisión 3).

### H12. Paradas largas y vueltas a la meta · baja · el motor lo hace bien

- En J83, 17 corredores de la Marcha pasan más de 1 min con lecturas: el 554 tiene 54 lecturas en 6:48. En la Sky el
  máximo es de 44 s.
- En meta vuelven a pisar la alfombra: el 320 durante 1:22:52, el 518 durante 42:57, el 306 durante 20:41, el 504 y
  el 519 unos 17 min, y el 44, el 332 y el 23 unos 10 min. En la pistola, el 12 y el 34 unos 3 min.
- El motor toma la primera lectura posterior al paso anterior: bien en todos.
- La salida chip es la última dentro de [−1 h, +5 min], y aquí sale bien. Con una ventana mayor, a la 555 le tocaría
  salida chip a las 09:56:57.
- Si alguna vez se amplía la ventana: quedarse con la última del grupo de salida, cortando en un hueco de minutos. Un
  minuto no basta: dentro del corral del 8K hay huecos de 60–80 s (308, 333, 518). Y mantener «nunca antes de la
  oficial» (el 51).

### H13. Líneas repetidas y fuera de orden en los ficheros · baja · [PENDIENTE]

- J83 trae 32 líneas de más: el bloque de los dorsales 57 y 42 (13:28:38–13:29:58) aparece tres veces, y una lectura
  del 57 sale cinco. J82 trae 17, J81 11 y J200 2.
- Hay 10 saltos hacia atrás en el orden del fichero (7 en J83).
- No cambia el resultado, porque el motor ordena por hora. Sí infla los recuentos.
- El receptor ya deduplica por número de lectura, pero los ficheros no lo traen. Al importar, deduplicar por (punto o
  lector, chip, hora, antena) y no suponer que el fichero viene ordenado (fila 13).

### H14. Dorsales sin lectura: la tabla de chips es la tanda entera · baja · [PENDIENTE]

- 62 dorsales sin ninguna lectura:
  - Sky, 27: 1, 3–10, 13, 14, 16, 18, 20, 22, 27, 29, 47, 58, 60–67.
  - Trail, 16: 303, 305, 310, 313, 329, 340–350.
  - Marcha, 19: 503, 514, 515, 528–535, 539, 541, 546, 561, 567–570.
- Con los 10 de la ráfaga son los 72 «sin datos».
- Las tablas son rangos enteros con chip = base + dorsal y colas sin leer. No dicen quién estaba inscrito. Los
  nombres de RaceTec tampoco: el export es de lecturas.
- El motor no les crea fila (bien) ni propone DNS (decisión 7, pendiente). El DNS propuesto debe salir de las
  inscripciones reales.

### H15. Chips de la Marcha fuera de la fórmula; la meta subió con retraso · baja · datos

- En la Marcha, los dorsales 501–510 tienen chip = 25162170 + dorsal, y los 511–570 tienen 25162240 + dorsal. La serie
  salta el hueco 25162681–25162750, que es donde está el Trail. La fórmula del README del contraste está mal. La
  carga usa la tabla: bien.
- En `Meta.txt`, la subida tarda de 0,9 a 15,9 s, salvo en dos bloques. A las 15:40:06 entraron juntas 33 lecturas con
  143–591 s de retraso, del 23 y del 21 (incluida la meta del 21). A las 16:38:52 entraron 8 de la etiqueta
  1100001500, con unos 3 min. Probables cortes de enlace.
- El motor usa la hora del lector y no le afecta. En directo, el retraso de subida por lector debería verse en
  Receptor Ultra.

---

## 4. Lo que el motor hace bien con datos reales

- **Calcula lo que dice**: 0 diferencias con el cálculo independiente en 190 dorsales y 449 pasos, al milisegundo.
- **La meta es la de RaceTec**: la primera lectura de `Meta.txt` en los 111 llegados.
- **Lo de antes de la salida no cuenta**: ni la recogida de las 07:38 ni las lecturas de otros días se convierten en
  pasos. La excepción es el 70 de las 11:05 (H2).
- **El corral no le engaña**: la salida chip es la última lectura sobre la alfombra. El Sky 37 tiene 241 lecturas de
  08:56:41 a 09:02:23, y el Trail 332 pasa 4:55 encima. Nunca queda antes de la oficial: al 51 le da chip = oficial.
- **Paradas y vueltas**: toma la primera lectura (el 564 tiene 44 lecturas en 2:23 en J83; el 23, el 44 y el 320 en
  meta).
- **Las líneas repetidas no cambian nada.**
- **Horas de pared sin convertir**, de la carga al resultado.
- **El seguro de salida no da falsa alarma** aquí: la (a) cuadra y la (b) se queda en 28, por debajo del umbral de 50.
- **No hay cruces entre pruebas.** Del 8K solo hay lecturas en CP2 en la recogida de las 07:38, antes de su salida.
  J83 es compartido sin solaparse: el 8K de 09:57 a 11:40 y la Sky de 12:36 a 16:21. Un aviso de cruces en un control
  compartido tendría que mirar además si la hora es plausible.
- **Es rápido**: de 24 a 36 ms por recorrido.

---

## 5. Hallazgos refutados

Ningún hallazgo se refutó entero. Estas afirmaciones sueltas sí cayeron; no hay que volver a investigarlas:

- «J200 no arrancó hasta las 14:01» (README del contraste): leyó etiquetas a las 09:31–09:33 y a las 09:54. Lo que
  hay es un hueco sin lecturas de 09:55 a 14:01.
- «J200 lee 1:10 después porque está 100 m más adelante»: es desfase de reloj (H6).
- «La etiqueta 167 pasó a la vez por los dos lectores de CP4»: no está demostrado (+67, +70 y −20 s).
- «Hay que tratar J83 como principal tal cual»: al 23 le dejaría su lectura tardía. Primero se corrige J200.
- «Once dorsales sin recoger en la ráfaga»: son diez; el 70 es una etiqueta.
- «Estar en la ráfaga quiere decir dorsal sin recoger»: 21 de los 31 corrieron.
- «Un dorsal sin nombre en RaceTec no está inscrito»: el export solo trae dorsales leídos.
- «Trece personas sin dorsal»: son trece chips.
- «Todos los chips sin dorsal del 8K tienen salida»: el 13034732 no la tiene.
- «Si luego se sabe el dorsal, no hay nada que recalcular»: en producción, el fichero del VPS y `--reenviar` lo
  recuperan.
- «7293453 sería el 20.º de la Sky»: es una hipótesis; puede ser el segundo chip del 26.
- «Con `min_time` en CP2 se quita al 70»: queda su lectura de las 11:24:14.
- «Hay que avisar de quien va más rápido que nadie»: el primero siempre lo es.
- «La 555 ganaría con 0:28:33»: serían 0:28:28,98, la primera lectura de la pasada.
- «Para la 555 no hay ninguna comprobación»: `meta_sin_paso` avisa, aunque no le quita el puesto.
- «La web pondría a la 542 y la 555 arriba»: van al final del bloque de la Marcha.
- «Basta con poner `finish_time` a NULL»: la columna es NOT NULL.
- «El seguro no debería contar lo de otro día»: se quedaría ciego ante una fecha mal puesta.
- «De CP4 a meta se tarda 17–25 min»: de 12:49 a 28:01, con mediana de 18:39.

---

## 6. Qué falta del dueño

1. **La clasificación oficial publicada** de las tres pruebas. Sin ella solo comparamos con la primera lectura cruda.
2. **La hora real de la pistola del 8K.** ¿Fue a las 09:28:23 o hacia las 09:30:00? ¿09:28:23 es la prevista
   (Sky + 26:00)? ¿Trail y Marcha salieron juntos?
3. **J83 y J200**: dónde están exactamente, cuál va antes, y qué reloj es el bueno. ¿Por qué J200 no leyó de 09:55
   a 14:01?
4. **El U479**: ¿salida y meta en el mismo sitio? En producción, ¿entraría como un solo punto?
5. **El 70 y las etiquetas**: quién llevaba la pistola y qué es el 70. Qué son 269, 151, 167, 64, 880761 y 895755
   (¿la escoba?).
6. **Los 13 chips sin dorsal**: ¿segundos chips (7293453 del 26, 1544082 del 46) o gente sin inscribir?
7. **El estado real** de Sky 28, 30, 34 y 43 y de Marcha 542 y 555.
8. **La lista real de inscritos**: ¿los 72 sin datos son no salidos o dorsales sin vender? ¿Se recogieron los 10 de
   la ráfaga?
9. **Datos para contrastar el resto**: el tiempo límite de cada prueba, los km reales de CP1–CP4, y el sexo y la
   categoría de cada corredor.
10. **La Marcha**, que no es competitiva: ¿clasifica por oficial o por chip?
11. **Pregunta 12**: esta es una de las 2–3 carreras pedidas. Faltan 1–2, mejor si alguna tiene salida y meta en la
    misma alfombra o salidas a horas distintas.
