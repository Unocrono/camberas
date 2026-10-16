# Contraste del motor del PR #11 con Peña Prieta 2026

Estado: 16-oct-2026, segunda vuelta. Motor: rama `claude/cronometraje-automatico`, migración `20261013180000` (sin
aplicar), en copias locales; nada de producción. Marcas y vocabulario, los del libro. Solo dorsales y chips, sin nombres.

**En corto.**
- El motor calcula lo que dice: 0 diferencias con un cálculo independiente; las 111 metas son las de RaceTec. En vivo
  acaba igual que por lotes. Es idempotente y respeta las correcciones.
- Falla en lo que da por bueno: una salida oficial mal puesta menos de 15 min pasa sin aviso, en cualquier sentido (en modo
  chip, adelantada, nunca avisa). Si va tarde, el chip copia el error; si va adelantada más de ~5 min, el chip se pierde o sale
  del corral. La del 8K se cargó a las 09:28:23 y fue a las **09:30:00** (lo confirma el dueño, 16-oct): 1:37 de error que
  el motor publicó sin decir nada.
- Falla en los parciales: no miran el estado. El 70, una etiqueta, va 1.º en CP2 de 11:06 a 17:00, y el DSQ no lo quita.
- Con el U479 como un solo punto, la Marcha la gana una retirada; con la oficial 20 min adelantada, una que no salió.
- En vivo salen 55 «en carrera» antes de su pistola. Fuera del motor, `/race/:id/results` sale vacía siempre.
- 16 arreglos para el PR #11 antes de aplicarlo (tabla al final del §3). El resto va al libro.

## 1. Qué carrera, qué datos y cómo se cargó
Peña Prieta 2026 (Maratón Logroño SkyRace), 3-oct-2026. Tres pruebas de un recorrido cada una:

| Prueba (RaceTec) | En Camberas | Salida oficial | Dorsales | Puntos de control |
|---|---|---|---|---|
| SKY RACE 36K | Sky | 09:02:23 | 1–70 | Salida, CP1, CP2, CP3, CP4, Meta |
| SKY RACE 8K | Trail | 09:28:23 en la carga; la real, 09:30:00 | 301–350 | Salida, CP4, Meta |
| MARCHA 8K | Marcha | 09:28:23 en la carga; la real, 09:30:00 | 501–570 | Salida, CP4, Meta |

El contraste se hizo con 09:28:23, la hora que se tenía. El 16-oct el dueño confirmó que Trail y Marcha salieron a las
09:30:00: lo que se cuenta del 8K es, por tanto, lo que hace el motor con una salida mal puesta en una carrera real (H1).

- **Lectores.** Salida y Meta, el mismo U479 (`U479_Salida.txt` y `U479_Meta.txt`, convertidos de los exports de
  RaceTec). CP1 J81, CP2 la pistola (vale su hora de texto), CP3 J82, CP4 J83 y J200 (el 8K solo J83). Horas de pared.
- **Carga** (`cargar.py`, `crono_automatico`): 6 puntos (SALIDA, CP1–CP4, META). **J83 y J200, en el mismo punto CP4**, que
  producción no permite (H6). **El U479, partido en SALIDA y META por fichero**, como RaceTec (H3). 190 inscripciones (toda la
  tabla de chips; 117 con nombre, H14). Km de CP1–CP4 inventados (meta: 36 y 8, reales). Sin sexo ni categoría.
- 5.996 lecturas. Entran las 5.514 con dorsal; **las 482 sin dorsal no**, como en producción (Salida 66, J81 105,
  pistola 69, J82 80, J83 77, J200 44, meta 41). Ganadores: Sky 50 (3:47:06,140), Trail 339 (0:42:35,970), Marcha 526
  (1:18:47,597); con la salida real, 0:40:58,970 y 1:17:10,597. Único aviso, en la Sky: `meta_sin_paso` «23: CP3, 26: CP3, 48: CP2».
- **Segunda vuelta**: cinco pruebas con el motor real (mismo md5 que el PR), cada una en su copia: pp_t1, U479 único;
  pp_t2, retiradas, correcciones y web; pp_t3, modo chip y salidas mal puestas; pp_t4, el día en vivo, cada 2 min de
  07:30 a 17:00; pp_t5, chips sin dorsal, 117 inscritos y 307/308. Scripts fuera del repo, en `motor/v2/`.

## 2. Resultado del contraste
El **cálculo independiente** (Python sobre los crudos, con la misma salida chip y la primera lectura posterior) prueba
que el motor está bien escrito, no que sus reglas sean buenas. La **meta de RaceTec** es la primera lectura de cada
dorsal en `Meta.txt`, no la clasificación publicada.

| Prueba | Inscritos | Con fila | FIN | STD | Sin datos | = independiente | Meta = RaceTec |
|---|---|---|---|---|---|---|---|
| Sky | 70 | 38 | 33 | 5 | 32 | 70 de 70 | 33 de 33 |
| Trail | 50 | 30 | 30 | 0 | 20 | 50 de 50 | 30 de 30 |
| Marcha | 70 | 50 | 48 | 2 | 20 | 70 de 70 | 48 de 48 |
| **Total** | **190** | **118** | **111** | **7** | **72** | **0 diferencias** | **111 de 111** |

- Estado, puesto, oficial, chip y hora de cada paso, al milisegundo: 449 parciales = 449 pasos; un empate (Salida de la Sky: 50
  y 55 a 0:00:01,843, 14.º y 15.º por dorsal), ninguno en la general. En vivo (pp_t4), el mismo final: 0 campos distintos. No
  se contrastó el tiempo de los 7 STD (H5). «Sin datos»: 62 sin ninguna lectura y 10 solo con la recogida de la pistola.
- **Contrastado con el motor real**: salida chip y paso; `min_time` y `min_lap_time` en META y `max_time` en START;
  modo chip; seguro (a) y (b); las cuatro retiradas, también editadas y borradas; `tiempo_manual`, `penalizacion`,
  `estado_manual`, `status_code` e inscripción cancelada o borrada; disparadores, marcas e idempotencia; los avisos.
- **No contrastado**: **vueltas con varios pasos por una alfombra** (el hueco de vuelta, solo en META compartida con START:
  H3); `max_time` de controles y meta; sexo, categoría, `dorsal_repetido` (190 distintos), lecturas fijadas a un punto, pg_cron
  real, retrasos de subida. Ni el CUT: el motor no lo calcula (solo `estado_manual`; proponerlo, [PENDIENTE], decisión 7).

**Conclusión.** Las reglas se aplican como están escritas. «Nada que corregir en el cálculo» solo vale en esta
configuración: puntos separados, sin ventanas, por oficial y sin retiradas. Fuera de ella hay dos fallos de cálculo,
los dos en los parciales: no miran el estado ni las correcciones, y en modo chip cuentan desde la oficial (H17).

## 3. Hallazgos confirmados
Del más grave al más leve. H1–H15 son de la primera vuelta, revisados; H16–H21, nuevos. **[PR #11]**: arreglarlo en el
PR antes de aplicarlo. **[PENDIENTE]**: regla nueva para el libro.

| # | Hallazgo | Gravedad | Marca |
|---|---|---|---|
| H1 | Salidas oficiales mal puestas pasan sin aviso; la del 8K estaba 1:37 adelantada | alta | [PR #11] |
| H2 | Sky 70, una etiqueta junto a la pistola, sale «en carrera» y 1.º en CP2 todo el día | alta | [PR #11] |
| H3 | Con el U479 como un solo punto, la Marcha 555 gana en 0:28:28,980 | alta (si se monta así) | [PR #11] |
| H16 | Con alfombra compartida, el seguro no ve una oficial adelantada | alta (si se monta así) | [PR #11] |
| H17 | Los parciales no miran el estado ni las correcciones | alta | [PR #11] |
| H5 | Los STD se quedan así para siempre y publican un tiempo | media | [PR #11] + [PENDIENTE] |
| H18 | Retiradas y correcciones: avisos que no frenan y huecos | media | [PR #11] |
| H19 | Cada página de la web trata los estados a su manera; una sale vacía | media | [PENDIENTE] (web) |
| H8 | El seguro de salida cuenta líneas, y en vivo estuvo a punto de bloquear | media | [PR #11] |
| H4 | 13 chips sin dorsal hacen recorrido de corredor y se pierden sin aviso | media | [PENDIENTE] |
| H6 | CP4 con dos lectores: el reloj de J200 va 70 s adelantado respecto al de J83 | media | [PENDIENTE] |
| H7 | La pistola: epoch con milisegundos, otros días y la recogida de dorsales | media | [PENDIENTE] |
| H14 | La tabla de chips es la tanda entera; `dorsal_sin_inscripcion` mezcla pruebas | media | [PENDIENTE] |
| H20 | El automático recalcula de más y puede tardar 45 s | baja | [PR #11] |
| H21 | 307 y 308: mismo nombre, siempre juntos, y nadie avisa | baja | [PENDIENTE] + dueño |
| H9 | Lecturas perdidas: el aviso acierta pero se queda corto; el 21 sin tiempo chip | baja | [PENDIENTE] |
| H10 | Ritmo, puesto en Salida, sexo y categoría sin datos que los sostengan | baja | [PR #11] |
| H11 | Etiquetas de prueba, organización y lectores mudos | baja | [PENDIENTE] |
| H12 | Paradas largas y pasadas sueltas por la meta | baja | (el motor lo hace bien) |
| H13 | Líneas repetidas y fuera de orden en los ficheros | baja | [PENDIENTE] |
| H15 | Chips de la Marcha fuera de la fórmula; la meta subió con retraso | baja | datos |

### H1. Salidas oficiales mal puestas pasan sin aviso; la del 8K estaba 1:37 adelantada · alta · [PR #11]
- **Confirmado por el dueño (16-oct): Trail y Marcha salieron a las 09:30:00, no a las 09:28:23.** Recalculado con
  09:30:00 (copia `pp_0930`): los 78 FIN bajan 1:37,000 justos, sin cambiar estado, puesto ni chip. Oficial − chip queda en
  1,1–4,8 s (Trail) y 6,2–27,7 s (Marcha), como en la Sky. Si RaceTec publicó con 09:28:23, sus tiempos del 8K llevan 1:37 de más.
- **El 8K.** Última pisada en la alfombra de salida: Sky, 35 de 36 entre 09:02:23,3 y 09:02:28,9 (+0,3 a +5,9 s: es el
  testigo). Trail, los 30 entre 09:30:01,1 y 09:30:04,8 (+98 a +102 s). Marcha, 48 de 50 entre 09:30:06,2 y 09:30:27,7 (+103 a
  +125 s). p10: Trail +1:38,2, Marcha +1:44,4. Fuera, el 51 (se va 1 min antes), la 542 y la 555 (H3).
- El 339 pisa la alfombra desde las 09:28:07,6 (93 lecturas seguidas) y la deja a las 09:30:01,1. De 09:28:23 a
  09:29:23 hay 575 lecturas de 23 dorsales del Trail quietos. El reloj del U479 no salta. 09:28:23 es 09:02:23 + 26:00.
- **Efecto.** Oficial − chip: Sky 0–5,9 s, Trail 1:38,1–1:41,8, Marcha 1:43,2–2:04,7. Con el 8K a 09:30:00, los 78 FIN
  bajan 1:37,000 justos, sin cambiar orden ni chip (el ritmo del 339 en CP4 pasa de 7:18 a 6:54/km). **Por chip**, la Marcha
  cambia 14 puestos (11 pares; el 509, de 12.º a 15.º) y el Trail, ninguno. Los parciales siguen en la oficial (H17).

| Oficial mal puesta (pp_t3; «tarde»: después de la salida real) | Seguro | Qué publica |
|---|---|---|
| Sky 09:13:00 (10:37 tarde) | no avisa | 33 FIN −10:37,000; las 36 salidas chip, recortadas a la oficial: chip = oficial |
| 8K 09:44:00 (13:59 tarde) | no avisa | 78 FIN −15:37,000 (frente a 09:28:23); las 80 salidas chip, recortadas |
| Sky 09:20:00 (17:37 tarde) | **bloquea** | sigue la clasificación anterior; el error queda guardado |
| Sky 08:50:00 (12:23 pronto) | no avisa | 33 FIN +12:23; 26 sin chip y 7 con chip mal (+10:41 a +12:25) |
| 8K 09:10:00 (~20 min pronto) | bloquea en 'oficial'; **nada en 'chip'** | en 'chip', 28 de 30 FIN del Trail y 43 de 48 de la Marcha sin chip |

- **La ventana chip (+5 min) se rompe antes que el seguro.** Si la salida real va k min detrás de la oficial, pierde la
  última pisada desde 4:54,057 (Sky), 4:56,200 (Trail) y 4:33,287 (Marcha); el seguro no salta hasta 14:57,913,
  14:58,283 y 14:41,303, y en modo chip nunca. Con k de 6 a 10 ningún chip sale bien. Con `max_time` = 15 min en START, sí.
- **Motor.** Salida chip = `greatest(oficial, última pisada)`: con la oficial tarde, el chip copia el error. El seguro
  (a) salta a 15 min de la mediana. En modo chip apaga «oficial antes de la alfombra», lo que protege la ventana chip.
- **Debería** (arreglos 1–4). El p10 del recorrido, nunca el mínimo: «La cabeza dejó la alfombra 1:38 después de la salida
  oficial del Trail: ¿se dio hacia las 09:30:00?». **En modo chip, mantener la comprobación** (la primera vuelta decía lo
  contrario). No corregir la hora sola, ni publicar el 8K por oficial sin el dueño.

### H2. Sky 70: una etiqueta junto a la pistola sale «en carrera» y 1.º en CP2 · alta · [PR #11]
- **Evidencia.** El chip 25162670 (dorsal 70), sin nombre, solo lee en la pistola: 17 veces en la recogida y 20 de
  11:05:53 a 11:24:14, cada ~10 s y sin otro chip en medio (RSSI −24 a −76). El 50, el primero, pasa a las 11:28:02.
- **Motor.** Sin salida, cuenta desde la oficial y toma en CP2 la lectura de las 11:05:53: STD con 2:03:30, 1.º en CP2,
  ritmo 06:51. En vivo entra a las 11:06 y sigue 1.º hasta las 17:00 (178 pasos, 5 h 54 min); el 50 es 2.º.

| Corrección (pp_t2, con ROLLBACK) | ¿Lo quita de CP2? | Qué queda |
|---|---|---|
| `estado_manual` DSQ, o DESCALIFICADO desde /timing | **no** | DSQ 2:03:30 sin puesto final, pero 1.º en CP2 (H17) |
| Anular sus 37 lecturas (`status_code`) | sí | con DSQ manual, fila DSQ 0:00:00; sin él, sin fila |
| Inscripción a `cancelled` | sí | aviso `dorsal_sin_inscripcion` [70]; con DSQ manual, la fila se queda |
| Borrar la inscripción | local, a medias; producción, no | no deja marca (H18); la FK `timing_readings_registration_id_fkey` lo impide |
| `min_time` en CP2 (simulado) | solo ≥ 2:21:52 | a menos de 4 min del ganador (2:25:39): no sirve |

- Con los 117 con nombre (pp_t5) el 70 no está inscrito y CP2 queda bien. **Debería** (arreglo 5): al final solo el 70 es paso
  aislado; en vivo, también el 21, de 09:59 a 13:02 (solo CP1). «Sin salida» no basta: el 21 llegó. Detectar etiquetas paradas.

### H3. Si el U479 entra como un solo punto, la Marcha 555 gana en 0:28:28,980 · alta (si se monta así) · [PR #11]
- **Evidencia.** `Salida.txt` y `Meta.txt` traen el mismo U479, Reader 0, antena 0; RaceTec lo partió por hora. El
  receptor da un token por lector. La 555 sale a las 09:30:14,920 y vuelve a la alfombra a las 09:56:51,980.
- **Probado** (pp_t1: SALIDA y el START de los tres recorridos, a META). Sin ventanas, la 555 es FIN 1.ª con 0:28:28,980
  (chip 0:26:37,060); la 542 queda STD y el 526 baja a 2.º: 102 diferencias, todas en la Marcha. `meta_sin_paso` «555:
  CP4» no le quita el puesto. Sky y Trail no cambian, pero la Meta sale como vuelta 2 («Lap 2») en los 111 llegados.
- **`min_time` en META** (3 h, 30 min y 40 min): 0 diferencias con la separada (salvo la vuelta 2). El rango que vale es
  estrecho: Sky ≤ 3:47:06,140, Trail ≤ 0:42:35,970, Marcha de 0:28:33,998 a 1:18:47,597. Corto (10 min) no hace nada.
  Largo, **sin aviso**: con 50 min el 339 queda STD; con 2:00 en la Marcha gana la 518 con su segunda pasada (2:00:03,360).
- **`min_lap_time` en META**: con 0 o 60 s, nada. Con 30 min, igual que separado y sin tocar a nadie: solo actúa sobre
  quien no pasa por ningún control (555 y 542). La 555 queda STD desde 0:26:42,077. En START no se lee.
- **Debería** (arreglos 6–7). Con punto compartido, **`min_lap_time` en META** protege mejor que `min_time`.

### H16. Con alfombra compartida, el seguro no ve una oficial adelantada · alta (si se monta así) · [PR #11]
- **Motor.** La (a) mira solo hasta salida + 5 min y apaga «oficial antes de la alfombra»; la (b) cuenta el corral como «antes»
  (Sky 38: 28 de la pistola y 10 del corral; Trail 3; Marcha 20). Con las horas buenas da NULL, también en vivo.
- **Probado** (ROLLBACK), la oficial del 8K 20 min adelantada (09:08:23). Separado, bloquea. Con el punto único da
  50 FIN de 50 en la Marcha: gana la 542, que no salió, en 0:06:37,967 (una lectura del corral, 09:15:00,967, hace de
  meta). El Trail lo gana el 339 con 1:02:35,970. Chip, 4 de 50 y 2 de 30. Único aviso: «542: CP4, 555: CP4».
- **Debería** (arreglo 8). Probado (ROLLBACK): con la oficial buena, medianas a +0:00:02,087, +0:01:39,717 y +0:01:56,697, sin
  falsa alarma; con la mala, a +0:21:39,717 y +0:21:56,41, y salta solo quitando además `NOT v_compartida`.

### H17. Los parciales no miran el estado ni las correcciones · alta · [PR #11]
- **Probado** (pp_t2, pp_t3). Los puestos de `split_times` salen de todos los pasos. El DSQ 70 sigue 1.º en CP2, la
  DNS 542 1.ª en Salida y el DNF 30 34.º en CP1. Con 50 DNF, 59 DSQ y 339 DNS, salen de la general pero siguen 1.º/2.º
  en Meta: el 37 es 1.º en la general y 3.º en Meta. El CUT 41 sigue 33.º en Meta.
- Meta no recoge las correcciones: con `tiempo_manual` 4:26:00, el 15 sigue con 4:26:17,337 en Meta. Con 2:00 de
  `penalizacion`, el 38 es 7.º en la general (4:29:42,027), pero sigue 5.º en Meta (4:27:42,027).
- **Modo chip**: parciales, puestos y ritmo siguen desde la oficial. En la Marcha, Meta no casa con el final en 14 de
  48, y en CP4 cambiarían 4 del Trail y 7 de la Marcha. **Debería**: arreglos 9–10.

### H5. Los STD se quedan así para siempre y publican un tiempo · media · [PR #11] + [PENDIENTE]
| Dorsal | Último paso | Motor | Lo probable |
|---|---|---|---|
| Sky 30 | CP2 13:20:36 | STD 4:18:13 | retirado después de CP2 |
| Sky 34 | J83 15:15:36,8, sin J200 | STD 6:13:13,8 | retirado en CP4 |
| Sky 43 / Sky 28 | J83 15:14:22,8 / 15:34:10,4 (J200 en bruto, 15:15:33 / 15:35:19) | STD 6:11:59,8 / 6:31:47,4 | ¿retirado o meta perdida? |
| Marcha 542 | 71 lecturas en la alfombra, 09:01:54–09:29:37,8 | STD 0:00:00, 1.ª en Salida | no salió |
| Marcha 555 | sale 09:30:14; vuelve a la alfombra 09:56:52–57 | STD 0:00:00 | retirada |

- La meta leyó hasta las 16:49:15 (el 41). De CP4 a meta, de 12:49 a 28:01 (mediana 18:39). No hubo corte en CP4. Sin
  regla de cierre, STD sale de un paso o una salida chip, y `finish_time` = último paso − salida (o 0:00:00).
- **En vivo** (pp_t4), una pisada en la alfombra desde 1 h antes de la oficial ya publica STD con 0:00:00. Son 55 «en
  carrera» antes de su pistola: Sky 28 a las 09:02, Trail 19 y Marcha 8 a las 09:28 (hasta 40 min antes). La 542 sale
  así desde las 09:02 y la 555 desde las 09:32, y siguen igual hasta las 17:00.
- **Retiradas** (pp_t2). ABANDONO al 30: DNF con `finish_time` 4:18:13 (su último parcial), sin chip ni puesto; NO_SALE
  a la 542: DNS 0:00:00. EN_CARRERA posterior, o borrar la retirada, lo devuelve a STD tal cual. El tiempo falso se
  queda: lo pinta el panel del PR (DNS 30, 4:18:13), y LiveResults lo da a los STD (43: 6:11:59, 10:20/km). Ver H19.
- **Debería.** [PR #11] Arreglos 11–12: «en carrera · último paso CP4 15:34» en vez de un tiempo. `finish_time` es NOT
  NULL (`20251120200905`): o migración, o la web no lo pinta. [PENDIENTE] Decisión 7 (CUT tras el tiempo límite, DNS al
  inscrito sin lecturas) y avisos «sin meta tras CP4: ¿retirado o lectura perdida?» (28, 43), «salió y no tiene más
  pasos» (542), «vuelve a la alfombra de salida» (555) y «STD parado cuando ya llegaron los de detrás».

### H18. Retiradas y correcciones: avisos que no frenan y huecos · media · [PR #11]
- **`retirado_con_meta` avisa, pero no frena** (pp_t2). Salta con DNF y DNS (Sky 50, Trail 339), no con DSQ, y quita el
  puesto igual. Guardan chip: 50 DNF 3:47:04,297; 339 DNS 0:42:35,970 de oficial y 0:40:57,863 de chip.
- **NO_SALE con pasos, sin aviso**: la retirada del 30 editada a NO_SALE deja DNS 4:18:13 con CP1 y CP2.
- **FIN manual sin tiempo publica CP4 como llegada**: al 28 le da FIN 30.º con 6:31:47,400 (su CP4) y echa al 21 del
  30.º. `meta_sin_paso` no avisa, porque exige paso por meta.
- Penalización a un STD (34) o a un DNS (542): se ignora. DNS manual sin fila (Sky 1): crea DNS 0:00:00. La retirada
  manda sobre `tiempo_manual` (43: DNF 6:30:00); solo `estado_manual` la supera.
- **Dos retiradas en un mismo INSERT** (cola offline de /timing sin token, `TimingApp.tsx:1066`): mismo `created_at`;
  desempata `id DESC`, un uuid al azar, y ABANDONO + EN_CARRERA da DNF o STD según el azar. Con token no pasa.
- **Borrar una inscripción no deja marca** (no hay disparador de marca en DELETE). El panel pinta «4:29:42 +2:00» con la
  penalización ya sumada. `updated_at` solo no se mueve en la copia local (sin `handle_updated_at`); en producción dice qué
  cambió. **Debería**: arreglo 15, avisar de la penalización ignorada y desempatar retiradas por orden de llegada.

### H19. Cada página de la web trata los estados a su manera; una sale vacía · media · [PENDIENTE] (web)
Fuera del motor (SQL en pp_t2 y código leído). **Debería**: una sola regla de qué se publica en cada estado, para todas.

| Página | Qué hace con los estados |
|---|---|
| LiveResults (`/race/:id/live`, `/:slug/live`) | Solo FIN y STD; los STD, con último parcial y ritmo. Recalcula los intermedios sobre FIN+STD. El realtime escucha `race_results` «*» de todas las carreras y recarga todo |
| RaceResults (`RaceResults.tsx:184`) | Filtra `finished`/`in_progress`, que no existen desde `20251203082326`: **0 filas siempre** |
| SplitClassification (`/:slug/live/split/N`) | No lee el estado: DSQ 70 1.º en CP2, DNS 542 1.ª en Salida. Filtra por `checkpoint_order`, no por carrera (código): con el corte de 1.000 filas puede perderlas |
| OrgResults (`/org`) | Ordena el estado como texto: CUT, DNF, DNS y DSQ antes que el ganador. ResultsManagement de `main`, igual |
| ResultsManagement del PR #11 | FIN, STD, DNF, CUT, DSQ, DNS, INS; puesto solo para FIN; pinta el tiempo de todos (DNS 542 0:00:00) |
| SplitTimesManagement (`:480`) y SplitTimesDisplay | El primero crea la fila con `in_progress` y la FK la rechaza («Error al crear resultado»). El segundo no lo importa nadie |

### H8. El seguro de salida cuenta líneas, y en vivo estuvo a punto de bloquear · media · [PR #11]
- **(b) en vivo** (pp_t4). La Sky tiene 28 lecturas de control antes de las 08:47:23: la pistola de 07:38 a 07:41, 12
  dorsales (17 son del 70). Tras la salida, 0 hasta el paso de las 09:44 (CP1, 09:42:01): 65 pasos con más «antes» que
  «después». No bloqueó porque exige más de 50: le sobraron 22 líneas.
- **(a) en vivo, el gemelo.** Exige 10 dorsales. A las 09:16 la Marcha tenía 6 en el corral, con la mediana a las
  08:51:11,6, 22:11 bajo el umbral. Con 4 más pisando pronto habría bloqueado el 8K con la hora bien puesta.
- **Día mal puesto.** Con el 04/10, la (b) bloquea los tres (719, 205 y 855 antes; 0 después). Con el 02/10 nadie
  avisa: los 111 FIN suben 24 h, nadie tiene chip, la Sky gana 5 STD (2, 35, 36, 68 y 69, por la recogida), y la 542 y
  la 555 se quedan sin fila. El motor no lee `races.date`. Bloquear no escribe: deja la clasificación anterior.
- **Debería** (arreglos 13–14). Por dorsales, la (b) de la Sky contaría 12 (6 con los 117 inscritos) y empezaría en
  su primera lectura en la alfombra (08:44:51, no 07:38). Mantener lo de otro día.

### H4. 13 chips sin dorsal hacen recorrido de corredor y se pierden sin aviso · media · [PENDIENTE]
Las 482 lecturas sin dorsal son de 55 chips: otro día (01/10), 15 chips y 27 lecturas; chip 0, 1 y 21; madrugada del
03/10, 2 y 17; etiquetas 7 y 184, organización 9 y 80, pasos sueltos 8 y 37 (H11); **recorrido de corredor, 13 y 116.**

| Chip | Prueba | Pasos | Va con (±10 s en cada lector) |
|---|---|---|---|
| 7293453 | Sky | completo, meta 14:34:16 | 26, a 0,2–5 s. Lo leen J82 y J83, justo donde al 26 no |
| 1544082 | Sky | salida, CP1, CP2, CP3 y J83 (15:00:53); sin J200 ni meta | 46, en los 5 lectores que lo leen |
| 1134606 y 562086 | 8K | completo / salida y J83 | Trail 322 o Marcha 507: un grupo de cuatro |
| 3921721 | 8K | completo, meta 11:19:22 | Trail 321 o Marcha 524 |
| 642001 y 13034732 | 8K | completo / J83 y meta, sin salida | Marcha 543; entre sí, a 17 ms |
| 2304634319 | 8K | completo, meta 11:34:30 | Marcha 548 |
| 863013 y 6530984 | 8K | completo, meta 11:49:49,5 (863013) y 11:49:53,9 (6530984) | Marcha 511 o 513; entre sí, a 10 ms |
| 2737657853 | 8K | salida y meta 11:57:31, sin J83 | grupo de la Marcha 505, 506, 536, 537 y 547 |
| 1846087 / 95462 | 8K | salida y J83 | Marcha 549 / solo coincide con alguien en la salida |

- **7293453 como segundo chip del 26** (ROLLBACK): el 26 gana CP3 (13:32:46,127, 18.º) y su CP4 sale de J83
  (14:15:29,807, 19.º), no de J200 (20.º). `meta_sin_paso` pierde «26: CP3». Meta y puesto final, iguales.
- **1544082** no le da nada al 46, y le falta justo donde al 46 lo leen (J200 y meta). ¿Segundo chip o acompañante?
- **Criterio del aviso** (también en SQL). «Meta o 2 o más puntos» (primera vuelta), 19: suma 64 y 167 (etiquetas), 2494, 38030
  y 1100001500 (pasos sueltos) y 880761 (organización). «Salida o meta y un control», 12: pierde 2737657853. **«2 o más puntos,
  uno salida o meta, en orden»**, los 13; con el U479 único, «una pasada en 08:02:23–09:33:23 y otra desde 09:43:23», 13.
- **Debería.** Aviso «N chips sin dorsal con recorrido de corredor»: prueba, con quién van y «segundo chip» si rellena
  pasos (7293453). Guardarlas aparte y pasarlas a `timing_readings` al asignar el chip (fila 5); hoy, `--reenviar`.

### H6. CP4 con dos lectores: el reloj de J200 va 70 s adelantado respecto al de J83 · media · [PENDIENTE]
- **Evidencia.** 19 dorsales leídos por los dos, todos después de las 14:01. Última de J200 − última de J83: mediana 70,4 s
  (68,1–72,8), sin depender de la velocidad: es reloj, no distancia; cuál es el bueno, lo dirá el dueño. El 23: J83 a las
  15:06:20,5; J200 de 15:06:33,7 a 15:07:31,4 (corregido, de 15:05:23 a 15:06:21). J200 calla de 09:54:55 a 14:01:41: no vio al
  8K ni a los 15 primeros de la Sky. Solo J83 lee al 34 y al 1544082; solo J200, al 26.
- **El dueño (16-oct)** cree que J200 estaba en CP4 y que, al acabarse su batería, pusieron J83. Los datos lo dan al revés.
  La etiqueta 167 la leen los dos a la vez a las 09:53:4x y a las 14:19:52,8 (J200 corregido −70,4 s): estaban juntos
  desde la mañana. J83 lee todo el día (786 lecturas de corredores entre 09:55 y 14:01). El que se para es J200: calla a
  las 09:54:55 y vuelve a las 14:01:41 con una pasada de la 167, como quien lo enciende y lo prueba. Encaja con su batería.
- **Motor.** Primera lectura en hora bruta: J83 gana en los 19 dobles. Solo el 26 sale de J200 (14:16:36, 20.º;
  corregido, 14:15:25,8 y 19.º). En producción J200 iría en otro punto, y el 26 daría «CP3, CP4».
- **Debería** (filas 8 y 16). J200 corregido por la mediana de los pares, solo para quien falte y con aviso. Aviso si
  dos lectores discrepan más de 30 s. Sincronizar todos los lectores.

### H7. La pistola: epoch con milisegundos, otros días y la recogida de dorsales · media · [PENDIENTE]
- **Evidencia.** El epoch leído como UTC es la hora de texto más 0,008–0,999 s: hora de pared con milisegundos (en
  Madrid sumaría 2 h). Otros días: 27 lecturas el 01/10, y 36 de 00:03 a 00:07 del 03/10. No leyó al 48.
- **Ráfaga** de 07:38:26 a 07:38:28: 31 chips (12 Sky, 15 Trail, 4 Marcha). 10 no se vuelven a leer: Sky 2, 35, 36, 68
  y 69; Trail 301, 302, 304 y 330; Marcha 540. De los otros 21, **corrieron 20** (19 llegados y el 34); el otro es el 70.
- **Debería** (fila 18). El epoch, solo si su segundo coincide con el texto; si no, el texto. Nunca convertir. Filtrar
  por fecha y ventana. Descartar el chip 0. El DNS sale de «inscrito sin lecturas en la ventana», no de la ráfaga.

### H14. La tabla de chips es la tanda entera; `dorsal_sin_inscripcion` mezcla pruebas · media · [PENDIENTE]
- 62 dorsales sin ninguna lectura. Sky 27: 1, 3–10, 13, 14, 16, 18, 20, 22, 27, 29, 47, 58, 60–67. Trail 16: 303, 305,
  310, 313, 329, 340–350. Marcha 19: 503, 514, 515, 528–535, 539, 541, 546, 561, 567–570. Las tablas son rangos enteros
  y no dicen quién se inscribió. El export de RaceTec tampoco: es de lecturas.
- **Con solo los 117 con nombre** (pp_t5), la Sky avisa de 11 dorsales: 2, 35, 36, 68, 69, 70, 301, 302, 304, 330 y
  540. Trail y Marcha, de ninguno. 5 son del 8K: salen en la Sky porque la pistola solo es punto de la Sky. 10 de los 11
  solo tienen la recogida. No dice punto ni hora. Y 117 inscritos dan 117 filas: la lista sale de los dorsales leídos.
- **Debería.** Decir recorrido (ya está en `bib_chips`), punto y hora; no mezclar recorridos; separar «solo antes de salir».

### H20. El automático recalcula de más y puede tardar 45 s · baja · [PR #11]
- **Probado en vivo** (pp_t4). Cada INSERT de lecturas y cada retirada marcan **los tres** recorridos. 293 de los 498 cálculos
  (59 %) eran de recorridos sin lecturas suyas. No escriben clasificación, pero reescriben `cronometraje_recorridos`, que va
  por realtime al panel. Con una subida por segundo nunca hay 3 s de calma: calcula a los 30 s y no vuelve hasta los 75: hasta
  45 s, no los «nunca más de 30» del comentario. `motor_cronometraje` a mano no consume marcas. Tiempo, sin problema: el
  automático, mediana 270 ms y máximo 440,2 por pasada (en una sola sesión; con las estadísticas al día, 29–37 ms por
  recorrido); llamando al motor en cada paso, 118,6 y 208,5 ms (mediana y máximo). **Debería**: arreglo 16.

### H21. 307 y 308: mismo nombre, siempre juntos, y nadie avisa · baja · [PENDIENTE] + dueño
- **Evidencia.** Los dos son del Trail (chips 25162707 y 25162708), con el mismo nombre en todas sus filas y sexo «-».
  Salida a 0,344 s, J83 intercalados (mediana 0,38 s), meta a 0,68 s: el par más ajustado del 8K (el siguiente, 2,94 s).
- **Motor.** Publica a los dos: 307 24.º en 1:18:45,963; 308 25.º en 1:18:46,643. `dorsal_repetido` mira el dorsal.
  **Debería**: aviso «mismo nombre o documento en dos inscripciones del mismo recorrido», y si además van a menos de
  2 s en todos los puntos, preguntar si es una persona con dos dorsales.

### H9. Lecturas perdidas: el aviso acierta pero se queda corto; el 21 sin tiempo chip · baja · [PENDIENTE]
- «23: CP3, 26: CP3, 48: CP2» son lecturas perdidas, no atajos (el 48 tarda 228 min de CP1 a CP3; los de su nivel,
  213–234). **El 21** no tiene salida: FIN 30.º en 6:33:14, sin chip y sin aviso. Tampoco avisan el 26 con CP4 del
  respaldo, el 70, los STD sin meta, la 542, la 555 ni el FIN manual sin tiempo (H18). **Debería**: aviso «llegado sin
  salida chip» (chip = oficial, marcado, como Wiclax). Atajo = tramo más rápido que el mejor y que el ritmo propio.

### H10. Ritmo, puesto en Salida, sexo y categoría sin datos que los sostengan · baja · [PR #11]
- El ritmo cuenta desde la oficial (el 339, 7:18/km en CP4 con 1:38 parado). El puesto en Salida es el orden de la
  última pisada: el 51 es 1.º de la Sky con 0:00:00, la 542 1.ª de la Marcha. Antes de las pistolas, el parcial de
  Salida se reordena por dorsal con cada entrada (53 actualizaciones). Sin sexo, todos «X»: puesto por sexo = general.
- **Debería.** Arreglo 12. Ritmo desde la chip o por tramo. (Sin km el motor ya no da ritmo; aquí sale porque los km
  de CP1–CP4 son inventados.) Sexo o categoría desconocidos: puesto vacío y aviso «N corredores sin sexo».

### H11. Etiquetas de prueba, organización y lectores mudos · baja · [PENDIENTE]
| Clase | Chips | Señal |
|---|---|---|
| Etiqueta de prueba | 167, 64, 269, 151, 2885681152, 8400896, 10027185 | 167 al arrancar y revisar J81, J82, J83 y J200; 64, 2885681152, 8400896 y 10027185, a menos de 1 s del 167. 269 parada en J81 (73 lecturas, 08:19–10:47); 151 en J82 (72, 09:50–11:45) |
| Organización o parada | 2746708, 3697311149, 2586560, 2820920127, 880761, 2948912, 2361491, 1987674468, 895755 | 2746708: primera lectura del día en la salida (08:43:19). 3697311149: pistola 07:40:50–07:41:00 y salida 08:58–09:31. 2948912, 2361491 y 1987674468: J81 tras su último corredor (cierre o escoba). 895755: J82 tras el último Sky |
| Paso suelto | 876411, 1013518, 776691, 8858734, 153549, 2494, 38030, 1100001500 | Un solo punto, en la ventana de corredores. 1100001500 (8 en meta, 16:35:42–54) no es etiqueta por estas reglas |
| Etiqueta con dorsal | 25162670 (Sky 70) | pistola (H2). El Sky 64 no tiene lecturas: «chip = dorsal» lo confundiría con la etiqueta 64 |
| Chip 0 | 0 | lector sin chip válido: 21 lecturas de pistola (19 de la madrugada del 03/10 y 2 a las 07:37), sin dorsal |

- Primer corredor por lector: J81 09:42:01 (59), pistola 11:28:02 (50), J82 12:09:46 (50), J83 09:57:36 (339), J200
  14:04:50 (39), meta 10:10:58 (339). **Debería**: lista de etiquetas por lector, y con ella arranque, cierre y huecos
  de cada lector en Receptor Ultra (J200 calló de 09:55 a 14:01). Separarlas de los chips con recorrido (H4).

### H12. Paradas largas y pasadas sueltas por la meta · baja · el motor lo hace bien
- En J83, 17 de la Marcha pasan más de 1 min con lecturas (el 554, 54 en 6:48); en la Sky, 44 s. En meta vuelven a
  pisar la alfombra en **pasadas sueltas**, no en una estancia (desde la oficial): el 320, meta a 1:01:09,127 y pasadas
  a 1:17:27 y 2:23:58; el 306, meta a 0:58:06,547 y pasada a 1:18:47,643; la 518, meta a 1:53:35,167 y pasadas a
  2:00:03,360 y 2:36:28,763. El 504 y el 519 vuelven a los 10 y 17 min; el 44, a los 1,5 y 10; el 332, a los 10; el 23 da cinco
  pasadas en 10 min. En la pistola, el 12 tiene 3 lecturas en 3:18, y el 34, 2 en 2:11.
- El motor toma la primera posterior al paso anterior: bien. Un `min_time` largo coge esas pasadas (H3). Si se amplía
  la ventana de salida, cortar en un hueco de minutos (el corral del 8K tiene huecos de 60–80 s); nunca antes de la oficial.

### H13. Líneas repetidas y fuera de orden en los ficheros · baja · [PENDIENTE]
- J83 trae 32 líneas de más (el bloque de los dorsales 57 y 42 sale tres veces); J82, 17; J81, 11; J200, 2. Hay 10
  saltos hacia atrás. No cambia nada. Al importar, deduplicar por (lector, chip, hora, antena) y no suponer orden.

### H15. Chips de la Marcha fuera de la fórmula; la meta subió con retraso · baja · datos
- Marcha: 501–510 tienen chip = 25162170 + dorsal; 511–570, 25162240 + dorsal. La serie salta de 25162680 a 25162751:
  el Trail es 25162701–25162750, y 25162681–25162700 no son de nadie ni tienen lecturas. La carga usa la tabla.
- En `Meta.txt` la subida tarda 0,9–15,9 s, salvo en **tres** bloques: 15:40:06, 33 lecturas del 23 y el 21 con 143–591
  s, sus metas incluidas (la del 23, de las 15:30:15,29, es la de 591 s); 15:41:17, 2 del 23 con 44–45 s; 16:38:52, 8 de
  1100001500 con ~3 min. En directo debería verse en Receptor Ultra.

### Arreglos del PR #11 antes de aplicarlo
| # | Hallazgo | Arreglo |
|---|---|---|
| 1 | H1 | Aviso que no bloquee si el p10 del recorrido se aleja 30–60 s de la oficial, en los dos sentidos |
| 2 | H1 | Avisos por % de salidas chip recortadas a la oficial y % sin salida chip con lecturas de salida |
| 3 | H1 | En modo chip, mantener la comprobación de «oficial antes de la alfombra» |
| 4 | H1 | Ventana chip atada a la alfombra, o de 15 min (`max_time` del START), sin pasar nunca del hueco (`min_lap_time`) del siguiente punto con la misma alfombra |
| 5 | H2 | Paso aislado (sin salida, control vecino ni meta): aviso, siempre. Quitar STD, puesto y tiempo solo si además es una etiqueta parada (como el 70, H2) |
| 6 | H3 | START y META en el mismo punto: exigir `min_lap_time` en META y avisar «llegado sin ningún control» |
| 7 | H3 | Numerar la vuelta sin contar el START (hoy la Meta sale «Lap 2») |
| 8 | H16 | Con alfombra compartida, la parte (a) mira hasta salida + `min_time` o hueco de META, y vuelve a comprobar «oficial antes de la alfombra» (quitar `NOT v_compartida`) |
| 9 | H17 | Puesto en los parciales solo entre FIN y STD |
| 10 | H17 | Parcial de Meta con tiempo manual y penalización; en modo chip, parciales y ritmo desde la chip |
| 11 | H5 | No publicar el último parcial ni 0:00:00 como tiempo de STD, DNF y DNS |
| 12 | H5, H10 | Sin STD antes de la oficial y sin puesto en el parcial de Salida |
| 13 | H8 | (b) por dorsales y desde la primera lectura en la alfombra. Antes de la pistola (`ahora_pared()` anterior a la salida y salida del día de `races.date`), (a) y (b) sin «después» solo avisan. Con la salida en otro día, se sigue bloqueando |
| 14 | H8 | Detectar también el día de menos |
| 15 | H18 | `retirado_con_meta` pide confirmación; avisos de NO_SALE con pasos y FIN sin tiempo; marca al borrar inscripción |
| 16 | H20 | Marcar solo el recorrido afectado; no reescribir `cronometraje_recorridos` sin cambios; tope real de 30 s |

## 4. Lo que el motor hace bien con datos reales
- **Calcula lo que dice**: 0 diferencias en 190 dorsales y 449 pasos; las 111 metas, las de RaceTec. **En vivo acaba
  igual que por lotes**, y el seguro no bloqueó nunca sin motivo. Cuando bloquea, deja la clasificación anterior.
- **Es idempotente**: un cálculo sin cambios reescribe 0 filas de `race_results` y `split_times` (por `xmin` y
  `pg_stat`), también con retiradas y correcciones. En el día: 118 altas, 331 cambios y 0 bajas en `race_results`.
- **Respeta las correcciones**: sobreviven a tres cálculos; EN_CARRERA anula el ABANDONO; la penalización reordena la
  general (38: de 5.º a 7.º). Las marcas se consumen todas: 3 por INSERT con lecturas y 0 tras cada pasada.
- **Las lecturas de antes de la salida no dan paso de control** (ni la recogida del 70: su paso falso es de las 11:05:53); en
  vivo sí dan paso de Salida y STD 0:00:00 antes de la pistola (H5, H10). **El corral no le engaña** (el Sky 37: 241 lecturas
  de 08:56:41 a 09:02:23). **Paradas**: toma la primera (el 564, 44 lecturas en 2:23 en J83). Horas de pared sin convertir,
  líneas repetidas sin efecto, sin cruces en J83. **Rápido**: 24–36 ms por recorrido; en vivo, ver H20.

## 5. Hallazgos refutados
Ningún hallazgo se refutó entero. Estas afirmaciones sí cayeron:
- **J200** sí arrancó antes de las 14:01 (etiquetas 09:31–09:33 y 09:54); su desfase es de reloj (adelantado, no atrasado), no
  de distancia. Que la 167 pasara a la vez por los dos, sin probar. J83 tal cual dejaría al 23 su lectura tardía.
- **Ráfaga**: los sin recoger son diez, no once; corrieron 20 de los 31, no 21. El 70 es una etiqueta.
- **Chips sin dorsal**: trece chips, no personas; el 13034732 no tiene salida; «meta o 2 o más puntos» da 19, no 13;
  1544082 va con el 46 en 5 lectores, no solo en la pistola; 7293453 rellena lo que le falta al 26, no es «el 20.º».
- **El 70**: ni `min_time` en CP2 ni el DSQ manual lo quitan. **La 555**: sin ventanas gana con 0:28:28,980 (no
  0:28:33); `meta_sin_paso` sí avisa; `min_time` la quita solo en un rango estrecho.
- **Seguro**: el aviso de H1 no debe callar en modo chip. La (b) ve un día de más, no uno de menos.
- **Cálculo**: los parciales sí tienen algo que corregir (H17). Una pasada sin cambios reescribe
  `cronometraje_recorridos`. El automático tarda hasta 45 s, no 30.
- **Ficheros**: en meta hay pasadas sueltas, no estancias de 1:22:52; el 12 y el 34 están 3:18 y 2:11 en la pistola;
  el Trail es 25162701–25162750, no todo el hueco; la meta subió con retraso en tres bloques, no dos; de CP4 a meta se
  tardó de 12:49 a 28:01, no 17–25 min. En LiveResults, la 542 y la 555 van al final. `finish_time` es NOT NULL.

## 6. Qué falta del dueño
1. **La clasificación oficial publicada** de las tres pruebas. Sin ella solo comparamos con la primera lectura cruda.
2. **Respondida (16-oct): Trail y Marcha salieron juntos a las 09:30:00.** Queda saber si RaceTec publicó con 09:28:23.
3. **J83 y J200**: los dos en CP4 (dueño, 16-oct); J200 calló de 09:55 a 14:01, probablemente por la batería (H6). Falta qué reloj es el bueno.
4. **El U479**: salida y meta en el mismo sitio (dueño, 16-oct); no hay fichero de texto, las lecturas salen de RaceTec. Con
   el receptor entraría como **un solo punto** (un token por lector): H3 es el caso real. Falta: ¿vale exigir `min_lap_time` en META?
5. **El 70 y las etiquetas**: quién llevaba la pistola y qué es el 70. Qué son 269, 151, 167, 64, 880761 y 895755.
6. **Los 13 chips sin dorsal**: ¿segundos chips (7293453 del 26, 1544082 del 46) o gente sin inscribir?
7. **El estado real** de Sky 28, 30, 34 y 43 y de Marcha 542 y 555. **307 y 308**: ¿una persona con dos dorsales?
8. **La lista real de inscritos**: ¿los 72 sin datos son no salidos o dorsales sin vender? ¿Se recogieron los 10?
9. **Datos para el resto**: tiempo límite de cada prueba (para `max_time` y CUT), km reales de CP1–CP4, sexo y categoría.
10. **La Marcha** no compite: ¿oficial o chip? Por chip cambian 505, 506, 509, 511, 513, 521–523, 536, 537, 553, 557, 558 y 562.
11. **Qué ve el público**: ¿qué páginas de resultados se usan? `/race/:id/results` sale vacía.
12. **Pregunta 12**: faltan 1–2 carreras. Pedir **una con vueltas** y otra con **salida y meta en la misma alfombra**.
