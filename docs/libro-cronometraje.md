# Libro de cronometraje de Camberas

Estado: 16-oct-2026. Es la fuente de verdad de cómo cronometra Camberas. Cada afirmación lleva una de tres marcas: **[PROD]** ya funciona en producción (`main`), **[PR #11]** está escrito en la rama `claude/cronometraje-automatico` (migración `20261013180000`) pero sin aplicar, **[PENDIENTE]** está decidido o propuesto pero no escrito. Lo que no se sabe, se dice. Las decisiones del dueño del 15-oct (§10) mandan sobre todo lo demás; donde una regla sale del análisis o de un valor por defecto del PR y no de una palabra del dueño, se dice. El análisis completo frente a Wiclax está en `docs/analisis-wiclax.md`. El contraste del motor del PR #11 con una carrera real (Peña Prieta 2026) está en `docs/contraste-pena-prieta-2026.md`.

Quién lee qué: §1, §2 y §5 son para todo el mundo (organizador, voluntarios); §3, §4, §8 y §9 son para quien monta y vigila el cronometraje; §10 es la lista de decisiones.

---

## 1. Qué cronometra Camberas (y qué no)

Camberas cronometra **carreras sencillas de trail y MTB**: una salida en masa, puntos intermedios y meta. Sin grandes pretensiones: lo complejo lo hacen RaceTec, Wiclax o la app de Javi.

**Sí:**
- Una carrera con uno o varios recorridos (21K y 10K el mismo día), cada uno con su clasificación. **[PROD]**
- **Una salida por recorrido**, dada con `/start` o tecleada. **[PROD]**
- De **1 a 10 puntos de cronometraje** por carrera, mezclando alfombras (RFID Ultra), **pistolas** y puestos con móvil (`/timing`). La **pistola es como el puesto con móvil, pero lee el chip en vez de teclear el dorsal**: un aparato que manda «chip + hora» por internet con su token, con respaldo en fichero; cómo se vuelcan a Camberas sin cobertura lo dará su fabricante y **aún no está definido**. Puede haber de 1 a 9 pistolas, y son un punto de primera, no un respaldo. **[PENDIENTE]** la entrada de la pistola (hoy solo entran el Ultra, el móvil y el fichero; un punto de control lee de **un solo** punto de cronometraje; ver §3.2 y §8)
- **Tiempo límite solo en meta** (`cutoff_time`, una duración desde la salida); no hay barreras por control. **[PROD]**
- Clasificaciones general, por sexo y por categoría **[PROD]**; por atributos (locales, regionales…), equipos y parejas **[PENDIENTE]**.
- Vueltas **sencillas** (2–4 pasos por la misma alfombra) **[PR #11]**, solo porque el motor ya las hace; no se amplían.
- **Nube** (Supabase) con respaldo: ninguna lectura depende **de la nube**. Las del Ultra las guarda el VPS en disco antes de que se confirmen y el Ultra retiene en memoria lo no confirmado; las del puesto con móvil esperan en su cola hasta que vuelve la cobertura; las de la pistola, en su fichero de respaldo (volcado por definir). Clasificar sin internet es un proyecto futuro (§8). **[PROD]**
- **Qué ve hoy el público durante la carrera [PROD]**: nada hasta que alguien pulsa «Procesar Tiempos y Resultados», y nada en absoluto quien no tenga sesión (ver §7). Las lecturas del puesto con móvil no se publican solas. Con el PR #11 la clasificación se refresca cada 15 s para quien sí la ve.

**No:**
- Olas, cajones ni salidas por grupo o categoría (una salida por recorrido).
- Contrarreloj, etapas, campeonatos, relevos, Backyard, torneos, penalizaciones en puntos, maillots, modo TV/quiosco, API.
- Más de 10 puntos: «más de 10 no es cronometraje para Camberas».

**En paralelo:** RaceTec sigue recibiendo las mismas lecturas del Ultra (vía el receptor del VPS) como red de seguridad mientras Camberas se afina. La app de Javi **podría** recibirlas también como un destino más del receptor **si** su servidor admite el protocolo del Ultra; las otras dos vías (leer del puerto 23024 del PC, o un destino «web» nuevo en el receptor) requieren trabajo en su lado o en el nuestro. Nada de esto está hecho ni probado; la app no se ha visto. **Decisión:** Camberas debe cronometrar, no publicar lo que cronometran otros; hoy el grafismo (`camberas-overlays`) aún lee lo de RaceTec (§7, §9 fila 11). Lo que Camberas es y ellos no: inscripciones, web de la carrera, GPS en vivo y grafismo.

---

## 2. Vocabulario

| Camberas | Qué es | Tabla | Wiclax / RaceTec |
|---|---|---|---|
| **Carrera** | La prueba del panel: nombre, fecha, slug, organizador. Agrupa recorridos. | `races` | *Evento* (archivo .clax) |
| **Recorrido** (evento) | Cada distancia: 21K, 10K, Parejas. Clasifica aparte; tiene rango de dorsales (`bib_start`/`bib_end`), tiempo límite (`cutoff_time`) y categorías propias. | `race_distances` | *Carrera* |
| **Salida** | Hora de salida del recorrido. **Prevista** (`hora_prevista`, se teclea en Recorridos, informativa) y **oficial** (`start_time`, la pistola: cronometraje, ventanas, `/start`). Una por recorrido. Hora de pared. | `race_waves` (1:1) | Fila de la lista de salidas (prevista → exacta) |
| **Tiempo límite** | Duración máxima del recorrido **desde la salida oficial**, tecleada en Recorridos como «Tiempo Límite (HH:MM:SS)» («07:00» o «7 h» = 7 horas). No es una hora de reloj: si se teclea «13:30» pensando en la hora de cierre, el sistema entiende 13 h 30 min. Lo lee la ventana de lecturas. Vacío o ilegible = 12 h. | `race_distances.cutoff_time` (texto) | Barrera horaria de meta |
| **Punto de cronometraje** | El aparato físico: una alfombra (un lector del Ultra), una pistola (como el móvil, pero lee el chip) o un puesto con móvil (`/timing`). Lleva **token**. | `timing_points` | *Adquisición*; RaceTec: *timer name / Location* (`CP1`, `Finish`) |
| **Punto de control** | El punto **lógico** del recorrido, en orden: START, CONTROL, FINISH. Dice qué punto de cronometraje lo lee (`timing_point_id`, **uno solo**), tiempo mínimo/máximo, mínimo de vuelta. La misma alfombra puede ser META del corto y CONTROL 1 y 3 del largo. Un punto de control sin alfombra asignada **no existe para el motor**. | `race_checkpoints` | *Control intermedio* / Salida / Meta (*destino*) |
| **Lectura** (pasaje) | Chip o dorsal visto a una hora en un punto de cronometraje. Con milésimas si viene del Ultra. | `timing_readings` | *Pasaje* |
| **Ventana de lecturas** | Franja en la que Camberas acepta lecturas de una carrera: primera salida oficial −24 h hasta la última salida + tiempo límite + 2 h. Sin salida oficial, el día de la carrera entero (+2 h). Las carreras `demo-*` la tienen siempre abierta. Lo que cae fuera **ya se confirmó al Ultra** y solo sobrevive en el fichero del VPS. | `cronometraje_window` (`20260804140000`) | — |
| **Parcial** | Tiempo calculado en un punto de control (y número de vuelta). Se deriva de las lecturas. | `split_times` | *Parcial / split* |
| **Resultado** | Tiempo oficial, tiempo chip **[PR #11]**, estado y puestos (general, sexo, categoría) de un inscrito en su recorrido. Se deriva. | `race_results` | *Resultado* |
| **Chip** | Código RFID atado a un dorsal. **N chips por dorsal** (hoy hasta 5 códigos por dorsal **y recorrido**). | `bib_chips` (`UNIQUE(race_distance_id, bib_number)`) | Tabla chip–dorsal |
| **Dorsal** | Identidad del corredor en la carrera. Único por carrera en la práctica (rangos por recorrido que no se solapan). | `registrations.bib_number` | Dorsal |
| **Token** | UUID que identifica un **puesto** (no una persona): el móvil o el lector que lo usa *es* ese punto. Un token es **un dispositivo**: el primero que lo usa se lo queda. Ver `docs/tokens-camberas.md`. | `gps_tokens` (referenciado desde `timing_points.token_id`) | No existe (Wiclax usa login) |
| **Lector** | Cada cabeza lectora del Ultra, numerada (el «Reader» de su pantalla, p. ej. 137). Un lector = un punto de cronometraje. | `timing_readings.reader_no`; `config.json › tokens` del VPS | Adquisición |
| **Receptor / VPS** | El programa `receptor.py` en el servidor 212.227.159.123 que recibe al Ultra por TCP 23023, guarda en disco, sube a Camberas y reparte a los destinos. Pantalla **Receptor Ultra** (solo admin). | `ultra_receptores`, `ultra_destinos`, `ultra_lectores` | Outreach + nube del fabricante |
| **El que contesta** | El destino (como mucho uno, p. ej. Outreach → RaceTec) que recibe el tráfico del Ultra tal cual y le confirma las lecturas. Si no hay o está caído, confirma el receptor. | `ultra_destinos.contesta` | — |
| **Copia** | Destino que recibe cada lectura desde el disco del VPS, con reintento si está caído. | `ultra_destinos` | — |
| **Estado** | FIN, STD (en carrera), DNF, DNS, DSQ, CUT (fuera de control), INS (inscrito). | `race_results_status` | DNF, DNS, DSQ, OTF |
| **Atributo de clasificación** | Marca del corredor (local, regional, militar…), 1–3 por carrera, que da una clasificación filtrada. | **[PENDIENTE]** no existe | *Clasificación adicional* por filtro |
| **Equipo** | Vínculo entre inscritos individuales; clasificación derivada. | `teams`, `team_members`, `registrations.team_id` (datos sí, clasificación no) | *Equipo* |
| **Pareja** | Dos personas, **un dorsal**, un recorrido propio («Parejas») y dos nombres en la inscripción. | **[PENDIENTE]** | Carrera por equipos de 2 |

No renombrar en BD: `race_distances` sigue siendo el recorrido aunque Wiclax lo llame carrera.

---

## 3. Cómo entran las lecturas

### 3.1 Ultra en directo **[PROD]** (desde el 15-oct, PR #13 y #14)

```
Ultra ──TCP 23023──► receptor.py (VPS 212.227.159.123) ──┬─► Camberas (ultra_registrar_lecturas, cada 2 s, lotes de 500)
                          │                                ├─► el que CONTESTA (p. ej. Outreach → RaceTec), en directo
                          │                                ├─► COPIAS (otros servidores, desde disco)
                          │                                └─► PC de cronometraje (puerto 23024 → RaceTec.ps1 → U137.txt + SQL Server)
                          └─ /root/ultra/lecturas/AAAA-MM-DD.txt  (TODO, pase lo que pase)
```

- El receptor escribe **toda** lectura en disco. Quién confirma al Ultra (`OK<n>`) depende del modo: si no hay destino «el que contesta» (o está caído), confirma el receptor **después** de escribir en disco; si lo hay (Outreach → RaceTec), el receptor le pasa los bytes del Ultra en directo y es **ese destino** quien confirma. Si no responde en 10 s, pasa a contestar el receptor y lo reintenta cada 30 s.
- **Mientras «el que contesta» está caído, lo que llega no le llega a él** (sí a Camberas y a las copias). El receptor apunta desde dónde falta; solo lo recibe todo si después alguien lo pasa a **copia** en la pantalla Receptor Ultra. Importa para §8.
- Un **token de punto de cronometraje por lector** del Ultra (`config.json › tokens`, el número de la pantalla «Reader»). Se edita **a mano en el VPS** (SSH, admin), no hay pantalla. Ese punto queda vinculado al dispositivo `ultra-<lector>` y la RPC rechaza a cualquier otro: un móvil ya no puede usarlo. Dos contracaras: (a) **regenerar el QR** de ese punto rompe al receptor (el token viejo deja de valer; hay que cambiar `config.json` y reiniciar el servicio); (b) un punto que ya escaneó un móvil («Vinculado» en Puntos de Cronometraje) **no se puede dar al Ultra**.
- Camberas resuelve **chip → dorsal en SQL** (Chips RFID) y no duplica: punto + lector + número de lectura + hora. Conserva **milésimas**. **Riesgo:** si el mismo dorsal está inscrito en dos recorridos, la lectura se cuelga del inscrito **más antiguo** sin aviso (`ORDER BY created_at LIMIT 1`): por eso los rangos de dorsales no pueden solaparse (§5, paso 1).
- La pantalla **Receptor Ultra** (admin) muestra cada 15 s el estado del VPS (Ultras conectados, número y hora de la última lectura de cada uno, pendientes por destino, estado de la subida a Camberas) y desde ella se eligen los destinos, el identificador (`U137`) y el timer name de RaceTec de cada Ultra. No muestra qué PCs están conectados (el VPS sí lo sabe) ni las lecturas descartadas.
- Sin internet en el VPS, las lecturas esperan en `cola.jsonl` y se suben al volver.

### 3.2 Puesto con móvil (`/timing`) **[PROD]**

`/timing?t=<token>` por QR. El voluntario teclea el dorsal y el puesto apunta «dorsal + ahora» con la **hora del móvil**, al segundo, con cola offline. `reading_timestamp` lleva esa misma hora del móvil, así que **nadie puede medir después la deriva**, ni el servidor. Acepta **cualquier dorsal**: si no está inscrito avisa «NO REGISTRADO» pero lo apunta igual (con el PR #11 sale en el aviso `dorsal_sin_inscripcion`); se resuelve después. Puede apuntar retiradas con motivo (ABANDONO, NO_SALE, DESCALIFICADO; EN_CARRERA anula).

Si el token estaba en otro móvil, `/timing` pide confirmar el **traspaso** y deja huérfano al anterior. **Nunca escanear con un móvil el token de un lector del Ultra**: el traspaso desvincula al receptor y el Ultra deja de subir a Camberas.

Un móvil **no puede compartir punto de cronometraje con una alfombra** (un token es un dispositivo), y un punto de control lee de **un solo** punto de cronometraje, hoy y con el PR #11. Por tanto un móvil de respaldo en meta es un **segundo** punto de cronometraje, y sus lecturas **no entran en la clasificación** salvo que alguien las mueva a mano en Lecturas Crono al punto de la alfombra, o cambie el `timing_point_id` del punto de control al de la pistola (y entonces se quedan fuera las de la alfombra). Ver §8 y §9 fila 8.

### 3.3 Fichero **[PROD]**

«Importar RFID» (`RFIDImportDialog.tsx`): resuelve chips en el navegador, guarda al segundo (pierde milésimas), duplica al reimportar, exige un punto por fichero y no entiende el formato nativo del Ultra. **Elegir siempre el punto de cronometraje**: sin él las lecturas quedan con `timing_point_id` NULL y no entran en ninguna clasificación, ni hoy ni con el PR. **[PENDIENTE]** que llame a la misma RPC que el receptor (`ultra_registrar_lecturas` o una gemela) para que la lectura sea idéntica venga por TCP o por fichero.

### 3.4 Qué se guarda y qué se descarta

- **Hoy [PROD]:** un chip sin dorsal **no se guarda** (`bib_number NOT NULL`); `ultra_registrar_lecturas` descarta `chips_sin_dorsal` y `fuera_de_ventana` **después** de confirmar al Ultra, y solo lo dice en el registro (los contadores vuelven al receptor y este los escribe en `journalctl -u receptor-ultra`; la pantalla Receptor Ultra no los muestra). Lo que se borra en Lecturas Crono desaparece de Camberas. Lo descartado y lo borrado sobreviven en el fichero del VPS: `python3 /root/ultra/receptor.py --reenviar AAAA-MM-DD` (SSH, admin) lo vuelve a subir sin duplicar lo que sigue existiendo (p. ej. tras asignar chips tarde, o tras borrar una lectura por error).
- **Objetivo [PENDIENTE]:** guardar **toda** lectura con estado (`nueva | integrada | rechazada | ignorada`) y motivo; un trigger sobre `bib_chips` casa los chips sin dorsal al asignarlos; vista propia «pasajes no integrados» por recorrido con «asignar a dorsal», «cambiar de recorrido», «ignorar» (nunca borrar); botones «Reenviar día/rango» del VPS y «Pedir rewind al Ultra» desde la pantalla Receptor Ultra.

---

## 4. Reglas

Cada regla en una frase y, debajo, en qué estado está. En la última columna se distingue lo que dijo el dueño de lo que es consecuencia del análisis o del PR.

| Regla | Hoy [PROD] | [PR #11] | Decidido 15-oct / origen |
|---|---|---|---|
| **Salida oficial por recorrido.** El tiempo oficial de cada corredor se cuenta desde `start_time` de la ola de su recorrido. | `race_waves` 1:1. `/timing` muestra la **salida más temprana de la carrera**, no la del dorsal, y con ella calcula el tiempo de carrera que ve el voluntario: en el segundo recorrido ese tiempo en pantalla está mal, pero **la lectura es correcta** (hora de pared). Que nadie corrija nada por eso. | Igual + **seguro de salida**: si la mitad pisa la salida a >15 min de la pistola o la mayoría de lecturas son anteriores, no escribe y avisa en Resultados; **el recorrido entero deja de clasificarse** hasta corregir Horas de Salida. | Dueño: una salida por recorrido, sin olas. **[PENDIENTE]** arreglar `cronometrador_contexto`. |
| **Paso = primera lectura por su alfombra posterior al punto anterior.** Los puntos se recorren en orden. | Primera lectura por (inscripción, punto); ignora el orden; `lap_number` siempre 1. | `motor_pasos` en orden; dos lecturas de la misma alfombra a menos del **tiempo mínimo de vuelta** (1 min por defecto) son el mismo paso. | Consecuencia de la decisión 1 (aplicar el PR #11), no decisión expresa. |
| **Tiempo mínimo y máximo** por punto de control filtran lecturas imposibles. | Solo en parciales, no en el resultado. | El motor **sí los aplica** al asignar pasos (descarta lecturas fuera de rango). Controles sin paso: solo aviso `meta_sin_paso`. | Criterio del análisis, no del dueño: un control perdido **nunca** rechaza al corredor. **[PENDIENTE]** trazar en la lectura por qué se rechazó (`min_time`, `max_time`, `min_lap_time`). |
| **Tiempo oficial** = meta − pistola; **tiempo chip** = meta − salida chip. | Solo pistola (`finish_time`). | `tiempo_chip`: última lectura en START entre pistola −1 h y pistola + máximo del punto (5 min), nunca antes de la pistola; **vacío si hay corrección manual**. `clasificar_por` (`oficial` por defecto, `chip`). | Valor por defecto del PR, sin decisión expresa del dueño: clasifica por oficial, chip informativo. Hueco conocido: sin salida detectada `tiempo_chip` queda NULL (Wiclax pone chip = oficial). |
| **Penalización** se suma al oficial y al chip. | No existe. | `race_results.penalizacion`. | Dueño (decisión 10): solo en tiempo; sin puntos ni bonificaciones. |
| **Estados FIN/STD/DNF/DNS/DSQ/CUT.** | FIN/STD del cálculo; DNF/DNS/DSQ/CUT a mano y **se pierden al reprocesar**; las retiradas de `/timing` no llegan. | Retiradas → DNF/DNS/DSQ solas (la última manda); `estado_manual` prevalece y admite CUT. | Dueño (decisión 7): el motor **propone** (no aplica) CUT a quien llega después del tiempo límite y DNS a quien no tiene ninguna lectura. **[PENDIENTE]** |
| **Correcciones protegidas.** El motor nunca toca lo corregido a mano. | «Procesar Tiempos y Resultados» machaca tiempos y estados manuales. | `tiempo_manual`, `estado_manual`, `penalizacion` intocables; vaciar vuelve a lo calculado; el CSV también escribe correcciones. | Consecuencia de la decisión 1. |
| **Recálculo continuo.** Nada de «procesar». | Botón por recorrido. | Marcas en `cronometraje_marcas` + `pg_cron` cada 15 s, idempotente, interruptor por recorrido; carreras pasadas quedan apagadas. | Consecuencia de la decisión 1. **[PENDIENTE]** «congelar» como oficiales con quién y cuándo. |
| **Tiempo límite solo en meta**, como duración desde la salida oficial. | `race_distances.cutoff_time` (texto, «HH:MM:SS» o «7 h»); lo lee la ventana de lecturas. | Igual. | Dueño (decisiones 7 y 14): sin cierre por control. El tiempo límite son **horas de carrera desde la salida oficial** («7 h»; si la salida se retrasa, se mueve). Nada de hora de reloj ni de tanto por ciento. La pantalla de Recorridos lo dice claro desde el PR #16 (campo de texto, «7 h de carrera · con la salida prevista a las 09:30, el cierre sería a las 16:30»; la ficha pública: «Tiempo límite: 7 h desde la salida»). El CUT propuesto por el motor sigue **[PENDIENTE]**. |
| **Cambio de recorrido en carrera** (bajarse del largo) se hace desde Inscripciones y el cronometraje lo sigue. | Se cambia en Inscripciones (pago manual si sube). Hay que volver a pulsar «Procesar» en los dos recorridos; sin comprobar qué pasa con el resultado del recorrido viejo. | **Lo sigue solo**: el trigger sobre `registrations.race_distance_id` marca los dos recorridos; el motor mueve el resultado al nuevo, recalcula con **su** salida y limpia lo que sobra del viejo (si no tiene correcciones manuales). No avisa. | Dueño (decisión 6): sin reglas automáticas. **[PENDIENTE]** solo el aviso «dorsal del largo solo leído en el corto» y comprobar las lecturas con `checkpoint_id` fijado al recorrido viejo. |
| **Dorsal único por carrera.** | En la práctica sí, por rangos `bib_start/bib_end` que no se solapen; sin candado en BD (`bib_chips` es único por recorrido, no por carrera). Con dorsal repetido, la lectura va al inscrito más antiguo (§3.1). | Aviso `dorsal_repetido`. | Dueño (sobre 8.2): **[PENDIENTE]** índice único `registrations(race_id, bib_number)` no canceladas + aviso de rangos solapados. **Nada más** (`bib_chips` se queda por recorrido). |
| **Chips: N por dorsal**, da igual el tipo. | `bib_chips`, hasta 5 códigos por dorsal y recorrido, CSV en Chips RFID. | Igual. | Dueño (decisión 3): se queda; «chip = dorsal por patrón» **no se hace**. |
| **Hora de pared.** Toda hora de carrera es hora local `+00`, nunca se convierte. | Norma del repo (`CLAUDE.md`, `timezoneUtils.ts`). El Ultra manda segundos desde 1980 en **su** hora local; según el dueño (respuesta 11), no cambia solo con el horario de verano. | Igual. | Dueño (decisión 11): se sincroniza el Ultra con **RFIDServer** antes de cada carrera. Offset por lector: «bueno, no esencial». **[PENDIENTE]** deriva de reloj visible en `/timing` y en Receptor Ultra. |
| **Precisión hh:mm:ss.** | Segundo en `/timing`, fichero y panel; milésimas solo del Ultra. | Igual. | Dueño (decisión 9): se publica y exporta al segundo; las milésimas se conservan en las lecturas y no se muestran. |
| **Vueltas sencillas.** | No (V1 = V2). | `lap_number` = n-ésimo paso por la alfombra; poner máximo en vueltas y mínimo en meta para que una vuelta perdida no descoloque. | Dueño (decisión 10): se quedan porque están hechas; no se amplían. |

---

## 5. El día de carrera con Camberas

Marcado lo que hoy no existe.

### 5.0 Quién hace qué

| Pantalla / acción | Quién | Cómo entra |
|---|---|---|
| `/timing` (puesto con móvil) | Voluntario del puesto | QR, sin cuenta |
| Pistola (lee el chip) | Voluntario del puesto | Su configuración, con el token del punto, como el móvil; **[PENDIENTE]** |
| `/start` (dar la salida) | Admin u organizador de la carrera | Con sesión; **no** vale el QR. Una vez **por recorrido** |
| Recorridos, Horas de Salida, Puntos de Cronometraje, Puntos de Control, Chips RFID, Lecturas Crono, Resultados, Inscripciones | Admin u organizador | Con sesión |
| Receptor Ultra (pantalla) | Solo admin | Con sesión |
| `config.json` del VPS, `--reenviar`, reiniciar el servicio | Solo admin | SSH al VPS |
| `RaceTec.cmd` en el PC de cronometraje | Cronometrador | En el PC |

Si un voluntario ve algo raro, llama al cronometrador; no corrige nada desde el puesto.

### 5.1 Días antes

1. Crear la carrera (o **duplicar** una pasada) y sus recorridos con distancia, rango de dorsales y tiempo límite. **Duplicar copia la estructura** (recorridos, olas con la hora desplazada, categorías, formulario, reglamento…) **pero los puntos de control llegan sin alfombra y no hay puntos de cronometraje ni chips**: los pasos 3, 4 y 5 hay que hacerlos enteros, y revisar salida y tiempo límite del año nuevo. Comprobar que los rangos de dorsales **no se solapan** entre recorridos antes de abrir inscripciones (**[PENDIENTE]** el aviso automático; hoy un dorsal repetido manda la lectura al inscrito más antiguo sin avisar).
2. Categorías por recorrido; inscripciones abiertas; dorsales por rango (`assign_next_bib`).
3. Chips RFID: CSV chip → dorsal (hasta 5 por dorsal y recorrido). Tiene que estar subido **antes de la primera lectura**: un chip leído sin dorsal se descarta y solo lo recupera el admin con `--reenviar` por SSH (minutos, si hay alguien con acceso).
4. **Puntos de cronometraje**: uno por lector del Ultra, uno por pistola (su token irá en la configuración de la pistola o de su receptor, **[PENDIENTE]**) y uno por puesto con móvil; imprimir el QR (`/timing?t=`) de cada puesto con móvil. Los del Ultra los pone el admin en `config.json › tokens` del VPS a mano y **no se reparten** ni se regeneran después (regenerar rompe al receptor). Un punto ya vinculado a un móvil no sirve para el Ultra.
5. **Puntos de control** por recorrido, en orden, con su punto de cronometraje y tipo (START, CONTROL, FINISH), tiempos mínimo/máximo si procede. Sin alfombra asignada el punto no existe para el motor.
6. **Horas de salida**: la prevista se teclea en Recorridos; al crear la ola, la **oficial nace igual que la prevista**; después nada copia de una a otra. Si cambia la prevista, Recorridos pregunta si es también la oficial.
7. Receptor Ultra: identificador (`U137`) y timer name de RaceTec (`CP1`, `Finish`) por Ultra, **antes de cada carrera**; destinos (RaceTec/Outreach como «el que contesta», copias). El PC de RaceTec (paso 11) depende de esto y del puerto 23024 abierto.
8. Sincronizar la hora del Ultra con **RFIDServer**. Cómo se comprueba: paso 10.
9. **Comprobación de estructura** (la que más carreras salva): por recorrido, exactamente un START y un FINISH, todos los puntos de control con alfombra y en orden; cada lector del Ultra con su punto en `config.json`; cada pistola escaneada y «Vinculado».
10. **Prueba de extremo a extremo con chip real [PROD]**: con el Ultra conectado, pasar un chip con dorsal asignado por cada alfombra y verlo aparecer en Lecturas Crono con la hora correcta. Es también la única comprobación posible hoy de la hora del Ultra. Ojo a la **ventana de lecturas**: una prueba a más de 24 h de la primera salida oficial se descarta en silencio (`fuera_de_ventana`); hacerla el día antes, a una hora posterior a la de salida, o el mismo día. La carrera `demo-*` con lecturas simuladas queda como mejora **[PENDIENTE]**.

### 5.2 Montaje

11. Ultra: Settings › Remote: LAN, URL = IP del VPS, Port 23023, «Send data to remote server». Comprobar en la pantalla **Receptor Ultra** que aparece conectado.
12. PC de RaceTec: doble clic en `RaceTec.cmd`. La primera vez recibe lo de hoy desde el principio; si ya corrió antes, sigue por `cursor.json` (recupera lo de hoy y ayer).
13. Puestos con móvil: hora automática activada en el móvil y comparar con el reloj del cronometrador **antes** de escanear (**[PENDIENTE]** aviso de deriva). Escanear el QR del puesto; si pide traspaso es que otro móvil lo tenía: confirmar solo si es intencionado. Nunca el QR de un lector del Ultra.
14. Con el PR #11: comprobar en Resultados que el automático está encendido para cada recorrido.

### 5.3 Salida

15. Dar la salida en `/start` (admin u organizador con sesión, **una vez por recorrido**; escribe `start_time`). Si se da sin `/start`, teclearla en Cronometraje › Horas de Salida. Con el PR #11, si no cuadra con las lecturas el seguro de salida lo dirá en Resultados: «la salida oficial no cuadra con la alfombra de salida» y **no sale nadie clasificado** en ese recorrido hasta corregir la hora. Un voluntario tiene que saber que eso es lo que significa.

### 5.4 Durante

16. **Hoy [PROD]**: pulsar «Procesar Tiempos y Resultados» cada vez (y volver a poner los estados manuales que se pierdan). **[PR #11]**: la clasificación se refresca sola cada 15 s; mirar avisos (controles sin paso, dorsales no inscritos, repetidos, retirados con meta).
17. **Vigilancia**: Receptor Ultra (admin) para ver cada Ultra conectado, número y hora de su última lectura y el estado de la subida a Camberas; Lecturas Crono filtrada por punto para ver entrar cada lectura. No hay otra pantalla.
18. Lecturas que no entran (chips sin dorsal, fuera de ventana): hoy solo en el `journalctl` del VPS y en el fichero; **[PENDIENTE]** vista «no integrados».
19. Correcciones: Lecturas Crono (editar/borrar/mover; hoy editar pone los segundos a 00) y, con el PR #11, el lápiz de Resultados (tiempo corregido, penalización, estado). **Borrar una lectura del Ultra es recuperable**: `--reenviar` del día la vuelve a insertar.
20. Retiradas desde el puesto con móvil (motivo) o desde Resultados.
21. Tiempo límite: **[PENDIENTE]** el motor propone CUT y DNS; hoy se marcan a mano.

### 5.5 Después

22. **[PENDIENTE]** congelar el recorrido como oficial (parar el motor, dejar quién y cuándo).
23. Exportar: hoy PDF (solo FIN) y CSV básico; **[PENDIENTE]** Excel/CSV general y por categorías, ITRA, federación, todo en hh:mm:ss.
24. Publicar: `/:slug/live` y `/race/:id/results`. Hoy los visitantes sin sesión ven la clasificación **vacía** (RLS desde julio); **[PENDIENTE]** RPC pública.

### 5.6 Hoja del puesto (para pegar junto al móvil)

- Teclea el dorsal **al paso**: la hora que se guarda es la de la pulsación.
- Dos a la vez: teclea los dos seguidos, en el orden en que pasan.
- Dorsal que no reconoce («NO REGISTRADO»): apúntalo igual; se resuelve después.
- Retiradas: botón de estado con su motivo (abandono, no sale, descalificado).
- Sin cobertura, sigue tecleando: se sube al volver. **No cierres la pestaña ni borres datos del navegador** hasta que todo esté subido.
- No escanees otro QR ni aceptes un traspaso que no te hayan pedido.
- Si el tiempo de carrera en pantalla no cuadra con tu recorrido, no pasa nada: la lectura es correcta. Avisa al cronometrador y sigue.

---

## 6. Clasificaciones

- **General, sexo y categoría [PROD]**: `overall_position`, `gender_position`, `category_position` en `race_results`, por recorrido. Una sola categoría por inscrito (`race_category_id`, categorías por recorrido). Hoy la web pública **solo muestra FIN y STD** (`LiveResults.tsx` filtra por esos dos estados): DNF/DNS/DSQ/CUT no aparecen, solo en el panel. **[PENDIENTE]** mostrar los no-FIN al final con su estado (§9 fila 10).
- **Por `clasificar_por` [PR #11]**: oficial por defecto; chip si se elige; se muestran los dos tiempos.
- **Atributos de clasificación [PENDIENTE]**: de 1 a 3 por carrera, definidos por el organizador (local, regional, militar…), marcados por corredor en la inscripción; cada uno es la general filtrada. Hoy no hay ningún atributo fijo; si una carrera recoge «local» es como campo personalizado del formulario, que no sirve para clasificar.
- **Equipos [PENDIENTE]**: clasificación derivada de la individual con criterio por carrera: **suma de tiempos de los N primeros** (lo habitual), **suma de puestos** o **suma de puntos**. Los datos ya existen (`teams`, `team_members`, `registrations.team_id`, desde `20260807100000`); falta el cálculo y la pantalla.
- **Parejas [PENDIENTE]**: un **recorrido propio** («Parejas»), un dorsal por pareja, «Nombre participante 1 / Nombre participante 2» en vez de nombre y apellidos. No necesita motor nuevo: es un recorrido más con la inscripción adaptada.

---

## 7. Publicación y exportación

| Salida | Hoy [PROD] | Falta |
|---|---|---|
| Web pública `/:slug/live` | Lee `registrations` directo; sin sesión, vacía; solo FIN y STD; no se refresca al cambiar `race_results` (no está en realtime); solo cambia al pulsar «Procesar» | **[PENDIENTE]** RPC `clasificacion_publica` (anon + authenticated, solo campos publicables, oficial y chip), `race_results` y `split_times` en realtime, no-FIN al final. TV/quiosco y API: **fuera del alcance** (decisión 1) |
| Grafismo (`camberas-overlays`) | Lee `racetec_*` (lo que cronometra RaceTec) | **[PENDIENTE]** que pueda leer la misma RPC pública de Camberas |
| PDF | jsPDF, solo FIN | Plantillas, diplomas: fuera del alcance de momento |
| Excel / CSV | CSV básico | **[PENDIENTE]** general y por categorías, hh:mm:ss |
| ITRA / federación | No | **[PENDIENTE]**, cuando toque, hh:mm:ss |

Todo tiempo publicado o exportado va en **hh:mm:ss**.

---

## 8. Respaldo y continuidad

Primero qué hace el sistema; después, qué hace **la persona** (plan B). Lo marcado «sin probar» no se ha ensayado en una carrera real.

- **Cae internet en meta (4G del Ultra)**: el Ultra guarda en memoria lo no confirmado y lo manda al reconectar. Nada se pierde según el protocolo (`OK<n>`); **sin ensayo de corte largo** con el receptor en producción. La clasificación en la nube se queda parada hasta que vuelva. **[PROD]**
- **Cae internet en el VPS**: las lecturas ya están en disco; la subida a Camberas espera en `cola.jsonl` y reintenta. También se cortan «el que contesta» y las copias (son servidores externos); los destinos se recuerdan en `destinos.json`. Siguen el disco y el PC por 23024. **[PROD]**
- **Cae el VPS (o no arranca el domingo)**: el Ultra retiene sin confirmación hasta que vuelva el receptor, y **tampoco llega nada a RaceTec** (el Ultra solo habla con el VPS). El PC se reengancha solo al volver (2–30 s) y recupera lo de hoy y ayer por `cursor.json`. El rewind del propio Ultra existe pero nunca se ha pedido desde Camberas. **Plan B de la persona (sin probar):** cambiar Remote del Ultra a la IP del PC con Outreach/RaceTec local, y después traer lo del Ultra a Camberas con Importar RFID (que hoy pierde milésimas y duplica si se reimporta). Es una decisión que el cronometrador tiene tomada **antes**, no en meta. **[PROD]**, botón de rewind **[PENDIENTE]**.
- **Cae Camberas/Supabase**: el VPS encola, los móviles encolan, las pistolas guardan en su fichero, RaceTec sigue; **no hay clasificación** y los resultados del día salen de RaceTec. Es la razón de que RaceTec siga en paralelo (decisión 1). **[PROD]**
- **Cae «el que contesta» (Outreach → RaceTec)**: a los 10 s confirma el receptor y RaceTec deja de recibir por esa vía **hasta que alguien lo pasa a copia** en la pantalla Receptor Ultra; entonces recibe todo lo que le faltaba. Es una acción, no automática. **[PROD]**
- **Cae el PC de RaceTec**: al volver sigue donde se quedó (`cursor.json`); como mucho repite la última lectura, que a RaceTec no le afecta. El VPS sabe qué PCs hay conectados y lo manda en su estado; la pantalla Receptor Ultra aún no lo muestra **[PENDIENTE]**. **[PROD]**
- **Cae un Ultra**: hoy **no hay respaldo automático** de ese punto. Una pistola o un móvil de respaldo es un segundo punto de cronometraje y sus lecturas no entran en la clasificación salvo que se muevan a mano al punto de la alfombra en Lecturas Crono, o se cambie el `timing_point_id` del punto de control al de la pistola (y las de la alfombra quedan fuera). El vídeo de llegada (`race_checkpoints.youtube_*`) existe como dato de la ficha pública; que sirva al cronometrador para ir al segundo del paso está **[PENDIENTE]** y sin confirmar. **[PENDIENTE]** permitir varios puntos de cronometraje por punto de control (principal + respaldo) y el modo «tiempos sin dorsal + dorsales por orden» en `/timing`, que es el respaldo real de una meta con una alfombra.
- **Cae un móvil o se pierde**: la cola offline de `/timing` guarda lo tecleado y lo sube al volver; lo que tenía en cola sin subir **se pierde con el móvil**. Regenerar el QR y escanear con otro deja huérfano al anterior. **[PROD]**
- **RaceTec en paralelo**: por el PC (puerto 23024, `cursor.json`) y por las copias recibe todo; por Outreach como «el que contesta» **solo lo que llegó mientras Outreach respondía**, salvo que después se le pase a copia. Si Camberas falla, RaceTec por el PC tiene todo. **[PROD]**
- **Copia local (proyecto futuro)**: hoy no se puede **clasificar sin internet**. Haría falta Supabase local en el PC, la misma web en `localhost`, el receptor del PC insertando con `ultra_registrar_lecturas` y sincronización en los dos sentidos. Antes hay que decidir si basta con (a) no perder lecturas y clasificar después (ya está) o hace falta (b) clasificar en vivo sin internet. Va **después** de todo lo de §9.

---

## 9. Plan de trabajo

| # | Qué | Estado | Toca |
|---|---|---|---|
| 0 | Ultra en directo (`ultra_registrar_lecturas`) y Receptor Ultra (destinos, PC) | **Hecho** (15-oct, `20261014220000`, `20261014233000`, aplicadas y en `main`) | `receptor-ultra/`, `ReceptorUltraManagement.tsx` |
| 1 | Motor automático: recálculo continuo, correcciones protegidas, tiempo chip, retiradas, vueltas sencillas, cambio de recorrido seguido | **En PR #11**, sin aplicar (`20261013180000`). Contrastado con Peña Prieta 2026 (16-oct): calcula bien, pero lleva **16 arreglos antes de aplicarse** (tabla al final del §3 del contraste) | `race_results`, `split_times`, `cronometraje_*`, `ResultsManagement.tsx` |
| 2 | Candado de dorsal único por carrera + aviso de rangos solapados | Pendiente | `registrations`, `DistanceManagement.tsx` |
| 3 | `/timing` muestra la salida del recorrido del dorsal (`cronometrador_contexto`) | Pendiente | `20260804140000`, `TimingApp.tsx` |
| 4 | Deriva de reloj visible en `/timing` y en Receptor Ultra (hora del Ultra vs servidor). El mensaje de estado que el Ultra manda cada segundo lleva su hora (bytes 39–42, segundos desde 1980, comprobado el 14-oct); el receptor aún no la lee | Pendiente | `TimingApp.tsx`, `ReceptorUltraManagement.tsx`, `receptor.py` |
| 5 | Guardar toda lectura con estado y motivo; vista «no integrados» (asignar / cambiar recorrido / ignorar); trigger al asignar chip; descartes visibles en Receptor Ultra | Pendiente | `timing_readings`, `ultra_registrar_lecturas`, `motor_pasos`, pantalla nueva |
| 6 | Reenviar día/rango del VPS y pedir rewind al Ultra desde el panel; PCs conectados en la pantalla | Pendiente | `ultra_receptores`, `receptor.py`, `ReceptorUltraManagement.tsx` |
| 7 | Cambio de recorrido: aviso «dorsal del largo solo leído en el corto» y comprobar las lecturas con `checkpoint_id` fijado al recorrido viejo (el recálculo ya lo hace el PR #11) | Pendiente (depende de 1 y 2) | motor, `ResultsManagement.tsx` |
| 8 | **Un punto de control puede leer de varios puntos de cronometraje** (principal + respaldo), para que una pistola o un móvil respalde una alfombra sin mover lecturas a mano | Pendiente, **por decidir con el dueño** (consecuencia de la decisión 4) | `race_checkpoints`, `motor_pasos` |
| 9 | `/timing`: modo «tiempos» sin dorsal + «dorsales» por orden; vídeo de llegada en Lecturas Crono. `FUERA_CONTROL` en el puesto con móvil **se quita** de la lista de 8.6 (decisión 7) | Pendiente | `TimingApp.tsx`, `TimingReadingsManagement.tsx` |
| 10 | Tiempo límite dicho claro en Recorridos y en la ficha pública (**hecho, PR #16**, `src/lib/tiempoLimite.ts`); CUT y DNS **propuestos** por el motor; congelar resultados como oficiales; no-FIN visibles al final | Parte hecha; el resto pendiente | motor, `cronometraje_recorridos`, `LiveResults.tsx` |
| 11 | Clasificación pública sin sesión (RPC), realtime de `race_results`/`split_times`, grafismo leyendo de Camberas | Pendiente. Ojo: `/race/:id/results` (`RaceResults.tsx`) filtra los estados antiguos `finished`/`in_progress` y sale siempre vacía (contraste, H19) | `LiveResults.tsx`, `camberas-overlays` |
| 12 | Atributos de clasificación (1–3 por carrera), equipos (3 criterios), parejas (recorrido propio, dos nombres) | Pendiente | `registrations`, `teams`, Resultados, inscripción |
| 13 | Importar RFID por la misma RPC que el receptor (milésimas, sin duplicados, formato Ultra) | Pendiente | `RFIDImportDialog.tsx` |
| 14 | Exportaciones Excel/CSV por categorías, ITRA, federación (hh:mm:ss) | Pendiente | Resultados |
| 15 | Ensayo con lecturas simuladas sobre carrera `demo-*` (`cronometraje_window` ya la trata con ventana abierta); contrastar el motor con lecturas brutas y resultados RaceTec de carreras pasadas | Mejora, no condición para cronometrar (el ensayo real con chip ya se puede hacer, §5 paso 10). Contraste **hecho con una carrera**, Peña Prieta 2026 (`docs/contraste-pena-prieta-2026.md`): 0 diferencias con un cálculo independiente, 111 de 111 metas iguales a RaceTec, el mismo final en vivo que por lotes. Faltan la clasificación publicada y 1–2 carreras más, mejor con vueltas o con salida y meta en la misma alfombra | RPC nueva |
| 16 | Offset por lector/puesto en el motor | Pendiente, segunda fila («no esencial»). Deja de serlo si se hace la fila 8: en Peña Prieta, J200 marcaba 70 s más tarde que J83 en el mismo control | `timing_points` |
| 18 | **Entrada de la pistola** (como `/timing`, pero lee el chip): «chip + hora» con el token del punto por `ultra_registrar_lecturas` o por el receptor; respaldo en fichero y volcado sin cobertura según diga el fabricante | Pendiente, **a la espera del fabricante** | `receptor.py` o RPC gemela, `timing_points` |
| 17 | Copia local para clasificar sin internet | Proyecto aparte, después de todo lo anterior | Supabase local, receptor del PC |
| — | Olas, contrarreloj, etapas, campeonatos, relevos, Backyard, puntos, maillots, TV/quiosco, API | **Fuera del alcance** | — |

Antes de aplicar nada: `git pull`, cada migración termina con `guardia_horas()` sin `FALLO`, y toda columna de hora nueva es hora de pared `+00`. Las migraciones se aplican a mano desde el panel de Supabase.

Pendientes conocidos del PR #11: las salidas de la Garita (+1 h) y la Virgen de la Esperanza (+1 día 2 h) están descuadradas con sus lecturas; el PR deja **apagadas** las carreras ya pasadas, así que no se recalculan, pero si alguien las enciende el seguro de salida las bloquea hasta corregir la salida. `process-gps-geofence` lee `gps_tracking`, que ya nadie escribe (sin paso virtual por GPS). Y los **16 arreglos** que salen del contraste con Peña Prieta 2026: salidas oficiales mal puestas que pasan sin aviso (la del 8K iba 1:38 por delante de la alfombra), parciales que no miran el estado ni las correcciones, una etiqueta parada que sale como corredor, salida y meta en el mismo Ultra, «en carrera» publicados con tiempo, y un seguro de salida que cuenta líneas en vez de dorsales.

---

## 10. Decisiones tomadas (15-oct-2026)

1. Camberas **cronometra** carreras sencillas de trail (salida, intermedios, meta), «sin grandes pretensiones»; no publica lo de otro. RaceTec y Outreach siguen en paralelo como red de seguridad. 8.14 (vueltas completas, contrarreloj, etapas, campeonatos, relevos, TV/quiosco, API…) queda fuera del todo.
2. Camberas sigue siendo **nube**; el respaldo local (clasificar con `localhost`) es un proyecto aparte y posterior; antes se decide si hace falta (a) no perder lecturas o (b) clasificar sin internet.
3. El tipo de chip no importa: **uno o varios chips por dorsal** (`bib_chips`); «chip = dorsal por patrón» no se hace.
4. De **1 a 10 puntos** por carrera; más de 10 no es Camberas. Las pistolas (1 a 9) son puntos de primera, con uso real. **La pistola es prácticamente lo mismo que el puesto con móvil (`/timing`), solo que lee el chip en vez de teclear el dorsal**: manda «chip + hora» por internet con su token, con respaldo en fichero; cómo se vuelcan a Camberas sin cobertura lo dará el fabricante (aún sin definir). Entra por la misma puerta que el Ultra, que ya hace chip → dorsal con el token del punto (`ultra_registrar_lecturas`), o por el receptor si habla el protocolo del Ultra **[PENDIENTE]**.
5. **Una salida por recorrido**; olas fuera. Solo se arregla que `/timing` muestre la salida del recorrido del dorsal.
6. **Cambiar de recorrido sí**, desde Inscripciones con pago manual si sube; el cronometraje debe seguirlo; sin reglas automáticas de asignación.
7. **Sin barreras por control**; cierre solo en meta, «y el cierre de control ya lo tenemos» (es el tiempo límite `cutoff_time`, una duración desde la salida). El motor **propone** CUT y DNS, no los aplica. `FUERA_CONTROL` en el puesto con móvil no hace falta.
14. **Tiempo límite = horas de carrera desde la salida oficial** (si la salida se retrasa, se mueve). Nada de hora de reloj ni de tanto por ciento sobre el primero (eso es de ciclismo; se descartó). Hay que dejarlo claro en la pantalla: «hoy no se sabe si son horas de más respecto de la salida o una hora de reloj».
8. **Parejas**: clasificación aparte como un recorrido más, un dorsal, dos nombres. **Equipos**: por tiempos (lo normal), también suma de puestos o de puntos. **Locales/federados**: muy importante, de 1 a 3 atributos de clasificación por carrera.
9. Exportaciones ITRA, federación y Excel del organizador, en **hh:mm:ss**.
10. Camberas **no cronometra vueltas ni contrarreloj**; las vueltas sencillas del PR #11 se quedan sin ampliarse.
11. Hora del Ultra: se sincroniza con **RFIDServer** antes de cada carrera; el Ultra no cambia solo con el horario de verano; el offset «es bueno, no esencial». Se hace la deriva visible en el puesto y en Receptor Ultra.
12. Terminología: Wiclax *evento* = carrera de Camberas (`races`); Wiclax *carrera* = recorrido/evento de Camberas (`race_distances`). El dorsal es único por carrera gracias a los rangos; solo falta el candado en BD.
13. La **app de Javi** es un calco web de Wiclax; Camberas no la imita. El receptor del Ultra **podría** alimentarla como un destino más si su servidor acepta el protocolo del Ultra; las otras dos vías (puerto 23024 del PC, URL web) requieren trabajo. Camberas se queda con el cronometraje sencillo bien hecho y con lo que los otros no son: inscripciones, web, GPS y grafismo.

**Sin decisión del dueño (preguntas abiertas):** la pregunta 12, respondida en parte: el dueño dio Peña Prieta 2026 y el contraste está hecho; faltan la clasificación publicada y 1–2 carreras más, y las preguntas del §6 del contraste (hora real de la salida del 8K, qué es el chip 70, dónde estaban J83 y J200); si un punto de control puede leer de varios puntos de cronometraje (respaldo con pistola).

**Lo que no se sabe:** la app de Javi no se ha visto; el PR #11 se contrastó en lectura contra producción (925 de 927 llegadas) y con los ficheros de Peña Prieta 2026, también reproduciendo la carrera en vivo cada 2 minutos, pero nunca con el Ultra en directo; no se ha ensayado un corte largo de internet con el receptor en producción; no se ha probado el plan B del VPS caído (Ultra directo al PC); no está confirmado que el vídeo de llegada sirva para ir al segundo del paso.
