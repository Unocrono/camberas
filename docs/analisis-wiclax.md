# Análisis de Wiclax como referencia para reestructurar el cronometraje de Camberas

Estado: 15-oct-2026. Material: documentación oficial de Wiclax (docs.wiclax.com, versiones es/en/fr), blog de versiones de wiclax.com y el estado del cronometraje de Camberas leído en `main` (`eaa8426`) más la rama `claude/cronometraje-automatico` (PR #11). Revisado por dos lectores (exactitud contra el material y práctica de cronometrador en montaña); lo que viene de hechos de certeza baja o de contradicciones entre fuentes va marcado «(por confirmar)». No se ha instalado ni probado Wiclax: todo sale de su documentación, leída en extractos y resúmenes de búsqueda, no íntegra.

---

## 1. Qué es Wiclax y su idea central

Wiclax es un programa de escritorio (runtime .NET 6) de cronometraje deportivo que se vende en alquiler anual (licencias Estándar, Experto y Pro) y que se presenta como «capaz de adaptarse y cronometrar pruebas muy diferentes manteniendo sus conceptos básicos». Su idea central es que **el cronometraje es una resta sobre una única base horaria**: cada lector RFID, cronómetro o fotocélula envía *pasajes* (un chip visto a una hora del día), Wiclax traduce chip → dorsal, decide a qué *punto lógico* del recorrido corresponde cada pasaje, y el tiempo de carrera es «hora de paso − hora de salida» de ese corredor. Todo lo demás (varias carreras en un archivo, olas, controles compartidos, vueltas, equipos, etapas) son parametrizaciones de ese esquema, no motores distintos. El trabajo del cronometrador consiste en preparar bien la estructura (carreras, rangos de dorsales, controles, salidas) antes de la prueba, y en el día en vigilar un flujo continuo de pasajes y corregir excepciones. Un evento es un archivo (.clax) y el PC del cronometrador es a la vez estación de trabajo, servidor local de resultados (G-Live) y API JSON.

---

## 2. El modelo de Wiclax

### Entidades

| Entidad | Qué es | Dónde se declara |
|---|---|---|
| **Evento** | «Conjunto de carreras/pruebas gestionadas en un archivo único». Nombre, organizador, fecha, disciplina, federación (de la que se derivan las categorías oficiales). Puede tener varias etapas. | Asistente de creación (2 pasos) → archivo .clax |
| **Carrera** (= curso/recorrido) | «El elemento cardinal de la estructura»: cada carrera genera su propia clasificación. Propiedades: nombre (única obligatoria), distancia, color, **rango de dorsales**, condiciones de asignación automática. Es **opcional**: si todos corren lo mismo no se declara. Un competidor pertenece a **una sola** carrera. | Lista de carreras del evento |
| **Etapa** | Subdivisión temporal del evento (varias jornadas, rondas de torneo). A diferencia de la carrera, un competidor puede estar en varias etapas. Una etapa es la «activa» (círculo verde) y recibe los resultados por defecto. Etapas dependientes o independientes, decisión irreversible una vez hay resultados. Licencias Experto/Pro. | Opciones del evento › Etapas |
| **Control intermedio** | «Punto cronometrado del recorrido entre la salida y la llegada». Se declara **a nivel de evento** y se asocia o no a cada carrera; un mismo control físico se declara una vez aunque lo compartan varios recorridos. Es un punto **lógico**: si el recorrido pasa dos veces por el mismo sitio hay dos controles lógicos sobre una sola adquisición física. En circuito, un control es «un punto que los competidores pasan en cada vuelta». | Asistente (paso 2) u opciones del evento |
| **Segmento** | Sección entre dos puntos cronometrados (salida–control, control–control, control–meta). Puede marcarse «cronometrado» o no (transiciones, raids). | No consta dónde se declara (por confirmar) |
| **Adquisición** | «Instrumento de integración de pasos»: la conexión con un lector RFID, un cronómetro, un fichero importado periódicamente, un servicio en la nube o un software de terceros. Se registra en la **estación de trabajo (PC)**, no en el evento. Parámetros: modelo, IP/puerto o COM, **destino**, intervalo de recruce, offset, filtros, línea de respaldo. Sin límite de adquisiciones activas. | Ventana de adquisiciones (F9) |
| **Destino** | A qué punto lógico van los pasajes de una adquisición: Salida, Meta, Control intermedio, «Control salida» (solo sí/no, presencia en la zona de salida) o una serie de puntos que se asignan secuencialmente. | Dentro de la adquisición |
| **Pasaje** | Una detección: chip (o dorsal) + hora del día. Tiene estado: nuevo (sin integrar), integrado, rechazado por condición, «para ignorar». Se guarda **siempre**, se integre o no, y se consulta en el historial del formulario de resultados. (Que la trama lleve además lector/antena sale solo de un cliente no oficial; por confirmar.) | Llega por la adquisición |
| **Chip / transpondedor** | Identificador que el lector envía. Se traduce a dorsal por una **tabla de correspondencia**, opcional si chip = dorsal (con o sin prefijo). **Un dorsal puede tener varios chips** (N:1). Admite prefijos y «códigos cortos». | Tabla chip–dorsal, columna «ID de chip» del participante, o formulario |
| **Competidor / participante** | La persona inscrita. Su identidad es el **dorsal** («identificador único y numérico»; existe «dorsal real» si no se puede garantizar la unicidad). Tiene carrera, hasta dos categorías, equipo, hora de salida individual (prevista y/o medida), datos personalizados. | Participantes (F2), importación Excel/CSV/TXT con el dorsal como clave de actualización |
| **Categoría** | Dos niveles independientes (edad y nivel: un corredor puede ser «Sénior» y «Élite»). Diccionario de referencia de la federación → asignación automática por sexo y edad. Categorías de equipo en lista aparte. | Asistente (federación) u opciones |
| **Salida** | Se gestiona como una **lista de filas** «hora + condición de filtro + nombre». Una fila por carrera, por ola, por grupo (p. ej. `Categoría = 'Handisport'`), por vuelta (Backyard) o por corredor (contrarreloj). Hay hora **prevista** y hora **exacta** que la sustituye. Columna de «dorsales adicionales» para excepciones. La doc habla también de «la hora de salida asociada a esta carrera»; si la ficha de carrera tiene además un campo propio está por confirmar. | Gestión de salidas (Ctrl+P → «sal») |
| **Resultado** | Lo que se deriva: tiempo oficial (disparo), tiempo chip, parciales, vueltas, rangos general / sexo / categoría, estado (DNF, OTF, DSQ…), penalizaciones y bonificaciones. La doc no describe ningún paso de proceso manual: G-Live se actualiza «en unos segundos» al integrar pasajes y «primera salida» recalcula todos los tiempos. Admite entrada manual de pares dorsal/tiempo (F3). | Resultados – Clasificaciones (F3 para entrada manual) |
| **Equipo** | Vínculo entre competidores inscritos individualmente; clasificación por equipos derivada de los individuales (suma de tiempos, suma de rangos, tiempo del N-ésimo…). Relevos son un caso aparte. | Columna de equipo / propiedades del equipo |
| **Clasificación adicional, campeonato, maillot, penalización** | Capas sobre la clasificación principal: por puntos o filtro; agregación de varios archivos .clax (.tph); portadores de maillot; listas de penalizaciones/bonificaciones en tiempo o puntos. | Otras características |

### Cómo se relacionan

```
EVENTO (archivo .clax; nombre, fecha, federación → diccionario de categorías)
│
├── ETAPAS 1..n (opcional; un competidor puede estar en varias; una es la "activa")
│
├── CARRERAS 1..n (opcional; cada una clasifica aparte)
│     nombre, distancia, color, rango de dorsales, reglas de asignación
│     ▲
│     │ pertenece a UNA (por rango de dorsal o por regla; se reevalúa al cambiar datos)
│     │
├── COMPETIDORES (identidad = DORSAL, único en todo el archivo)
│     ├── categoría nivel 1 (edad)   ┐ del diccionario de la federación
│     ├── categoría nivel 2 (nivel)  ┘
│     ├── equipo (opcional)
│     ├── salida individual prevista / medida (contrarreloj)
│     └── CHIPS 1..n  ◄── tabla de correspondencia chip → dorsal (opcional si chip = dorsal)
│
├── CONTROLES INTERMEDIOS (del evento; cada carrera los asocia o no)
│     puntos LÓGICOS: Salida ─ CI1 ─ CI2 ─ … ─ Meta   (segmentos entre ellos)
│
├── LISTA DE SALIDAS: filas [hora prevista → exacta | condición | nombre | dorsales extra]
│     "Media maratón 09:30" (dorsal 1-1000), "Ola 2 10:05" (categoría = X), …
│
└── (en el PC, no en el archivo)
    ADQUISICIONES 1..n  ──► DESTINO (Salida | Meta | CIk | Control salida | serie)
      lector URTime 192.168.1.201:6546, offset, recruce 10 s, respaldo, filtros
      │
      ▼ tramas chip + hora del día (base GPS)
    PASAJES (se guardan todos) ──► chip→dorsal ──► condiciones de paso ──► integrado / rechazado / ignorado
      │
      ▼
    RESULTADO = hora de paso − hora de salida (de su fila de salida / su salida individual)
      parciales por control, vueltas (cada cruce de Meta), tiempo oficial y chip,
      rangos, estados, penalizaciones  ──►  G-Live local (:8070) / Internet / API JSON
```

Tres decisiones de modelo que conviene retener:

1. **Carrera y salida están desacopladas.** La carrera agrupa y clasifica; la salida se gestiona como filas con una condición. Por eso las olas y los grupos que salen tarde no obligan a crear carreras, y una carrera puede tener varias filas de salida. (Si la carrera guarda además su propia hora, por confirmar; el formulario de resultados «recuerda la hora de salida asociada a la carrera».)
2. **Control lógico ≠ lector físico.** El lector (adquisición) apunta a uno o varios destinos; el control es lo que el corredor debe pisar. El mismo lector sirve de Salida y de Meta según **cuándo** lee (retardo tras el disparo) o por asignación secuencial de una serie de destinos.
3. **El pasaje se guarda siempre y el resultado se deriva.** Corregir es cambiar el estado o el dorsal de un pasaje, añadir o quitar pasos, o editar la salida; la doc no describe un paso de «procesar» a mano. Que editar la hora de una salida masiva recalcule a todos los afectados está por confirmar.

---

## 3. Reglas que aplica

Cada regla en una frase, con su valor por defecto cuando la documentación lo da.

- **Base horaria única**: Wiclax trabaja con horas del día tomando la hora GPS como referencia; cada lector lleva su RTC en hora GPS y el PC también; por defecto la base es el reloj del PC, pero el «reloj de Wiclax» (abajo a la derecha) se puede inicializar con otra base. En «carrera de varios días» todo pasaje lleva además **fecha**.
- **Tiempo de carrera** = hora de paso − hora de salida que corresponde al corredor (fila de salida de su carrera/ola, o su salida individual).
- **Intervalo de recruce** (repaso): se ignora toda lectura del mismo chip antes de que pasen **10 s** (por defecto) desde la anterior; si el destino está en modo «último paso», este intervalo no aplica. Es un parámetro de la adquisición; su ámbito exacto (adquisición, destino o global) por confirmar.
- **Primer cruce en Meta**: en un destino Meta solo se integra el **primer** paso; los siguientes son recruces y se ignoran (desde la v10 la opción primer/último paso es **por destino**, icono negro/naranja).
- **Último cruce en Salida**: en una línea de salida la opción por defecto es «tener en cuenta el último paso»: cada nueva lectura sobrescribe la salida del corredor **mientras no tenga ya un paso en Meta o en un control posterior**; se puede conmutar a un único paso.
- **Retardo tras el disparo y enrutado a Meta**: las lecturas en la línea durante un margen tras la hora de disparo se toman como salidas (quedándose con la más reciente); pasado ese margen, las lecturas por la misma adquisición se enrutan a Meta y ya solo cuenta la primera; el blog de la v10 dice **2 min** tras la hora de disparo y la doc francesa **10 min** tras la salida del corredor (por confirmar cuál aplica y si es configurable).
- **Offset por adquisición**: se puede sumar o restar un valor de tiempo fijo a todos los pasajes de una adquisición para corregir un lector mal sincronizado.
- **Cambio de base de salida**: la herramienta de «primera salida» recalcula todos los tiempos sobre una nueva base «sin alterar el orden ni la frecuencia iniciales» (útil si la carrera se retrasa).
- **Línea de respaldo** (solo Meta): limita los avisos sonoros/visuales de ese lector, marca la fila con «backup line» cuando el corredor no fue visto en la línea principal, y un tiempo del principal puede sobrescribir al del respaldo si es anterior, con un límite de **1 min**.
- **Salida prevista → exacta**: se recomienda teclear la hora prevista de cada carrera antes de competir para que «las carreras que aún no han empezado no se vean afectadas por detecciones inoportunas», y sustituirla por la exacta al dar la salida. No se ha visto una regla explícita que descarte pasajes anteriores a la salida (por confirmar).
- **Tiempo oficial (disparo) y tiempo chip**: el oficial es salida de la carrera/ola − paso; el chip es salida individual medida − paso; **por defecto la clasificación va por tiempo oficial** y el chip es informativo; una opción cambia la base de la clasificación (el extracto en español la llama «basada en tiempos de disparo» y el inglés sugiere que es «basada en tiempos chip»; por confirmar).
- **Sin detección en salida**: «si un competidor no se detecta en la línea de salida, su tiempo chip se considerará automáticamente como su tiempo disparo»; lo mismo si su salida individual es anterior a la de la carrera.
- **Olas**: cada ola es una fila de salida; con composición conocida, la condición dice quién va en cada ola; con composición dudosa, «determinación automática de la ola según el tiempo del chip»; los «dorsales adicionales» de una fila tienen prioridad sobre cualquier condición.
- **Contrarreloj**: se ignora la hora de salida de la carrera; cada corredor necesita salida prevista o medida (una de las dos obligatoria para vincularle un resultado); si existe medida, prevalece para el tiempo neto; modos «solo previstas», «solo medidas» o ambas.
- **Vueltas**: cada cruce de Meta incrementa el contador; «el primer paso en la línea no es una vuelta» cuando la salida está fuera de la meta (admite distancia distinta del primer tramo); fin por número de vueltas (al completar el líder, los demás solo terminan la vuelta en curso), por «duración + n vueltas» (n+1 cruces tras el tiempo) o ilimitado; clasificación opcionalmente por mejor vuelta.
- **Condiciones de paso**: rechazan pasajes anómalos: **tiempo mínimo por vuelta**, tiempo mínimo entre dos puntos, o faltan controles anteriores (controles obligatorios); suponen integración en orden natural (si el CI1 llega después del CI2, el CI2 ya integrado no se toca); el rechazo queda en el historial. Valores por defecto no documentados.
- **Lecturas parásitas**: filtros por prefijo del chip, parte del código, rangos de dorsal/chip o carreras, inclusivos o exclusivos.
- **Chips desconocidos** (por confirmar, blog v8.x): con «bloquear participantes desconocidos» la lectura abre un aviso para asignarla a un participante nuevo o existente; sin bloqueo, un chip alfanumérico desconocido crea un dorsal a partir de **100000**.
- **Pasaje «para ignorar»**: un pasaje descartado se marca para que no se vuelva a procesar si reaparece por una importación periódica o un servicio cloud (v9.1).
- **Reasignación de pasaje**: cualquier pasaje (sin dorsal o con dorsal equivocado) se reasigna tecleando el dorsal correcto; en vueltas se añaden/quitan pasajes con + y − y se edita su hora.
- **Cambio de carrera**: la carrera de un competidor se cambia en cualquier momento, con resultados ya existentes, y se reevalúa sola si hay reglas (por confirmar si se recalcula con la nueva salida; no está escrito).
- **Pelotón UCI** (etapas en línea): corredores del mismo grupo reciben el mismo tiempo con corte entre grupos de **1 s** por defecto; regla de los últimos 3 km.
- **Redondeo UCI**: tiempos truncados al segundo, centésimas solo para desempatar contrarrelojes; no se ha encontrado una opción general de precisión (por confirmar).
- **Estados**: en **Backyard** «Wiclax no elimina automáticamente a los competidores que no cumplen con el tiempo límite»: se marcan DNF a mano. Existe un estado OTF («fuera del límite de tiempo») distinto de DNF (consta como variable de exportación), pero no está documentado si se asigna solo ni dónde se fija el límite (por confirmar).
- **Penalizaciones y bonificaciones**: dos listas (individual y equipos), en tiempo o puntos, limitadas a la etapa actual; las de tiempo van a la general, las de puntos a la clasificación por puntos; las bonificaciones de una clasificación adicional (sprint, puerto) se dan en segundos y se aplican a la principal.
- **Equipos**: criterio principal entre suma de tiempos, suma de rangos, tiempo del último compañero (y desde la v8.2 vueltas totales, distancia total, media de rangos); el relevo es aparte: el tiempo del equipo es el del último relevista y cada tramo se clasifica como carrera independiente.
- **General por etapas**: suma de tiempos por defecto, alternativas mejor tiempo, distancia total o puntos; desempates reordenables (reglamento UCI en ciclismo); las etapas canceladas no cuentan para los desempates de las clasificaciones por equipos ni por puntos.
- **Empates**: no documentado cómo trata ex aequo en una carrera simple (por confirmar).

---

## 4. Tipos de prueba

| Tipo | Cómo lo resuelve Wiclax |
|---|---|
| **Salida en masa, una carrera** | No hace falta declarar carrera; una fila de salida con la hora del disparo; Meta = primer cruce. |
| **Varias distancias el mismo día** (21K + 10K) | Varias carreras en el mismo archivo, cada una con rango de dorsales (1–1000 / 1001–2000) y su fila de salida (9:30 / 10:00); controles y adquisiciones compartidos a nivel de evento; cada carrera clasifica aparte. |
| **Grupo que sale a otra hora** (p. ej. Handisport) | Fila de salida extra con condición (`Categoría = 'Handisport'`), sin crear carrera. |
| **Olas** | Una fila de salida por ola con condición fija, o «determinación automática de la ola según el tiempo del chip»; excepciones en «dorsales adicionales». Tiempo oficial = salida de la ola; chip = salida individual. |
| **Libre elección de recorrido** (corto/largo) | Dos carreras, un control que solo pisa el largo, regla de asignación automática «tiene tiempo en CI_x → carrera larga». |
| **Contrarreloj individual** | Tipo «Contrarreloj»: se ignora la salida de la carrera; salida prevista (lista generada con hora inicial + intervalo, o huecos de la general en persecución) y/o medida en la línea; pantalla remota de salidas `http://<ip>:5050/starts` con cuentas atrás. |
| **Circuito / vueltas / 24 h** | Tipo «carrera por vueltas»: Meta cuenta vueltas; controles intermedios se pisan en cada vuelta; fin por vueltas, por duración + n vueltas o ilimitado; pestaña Vueltas con lista bruta y matriz en tiempo real; condición de tiempo mínimo por vuelta. |
| **Backyard / Last Man Standing** | Carrera por vueltas ilimitadas con **una fila de salida por vuelta**; tiempo final = última vuelta o acumulado para desempatar a igual número de vueltas; los eliminados se marcan DNF a mano. |
| **Carrera por equipos** | Inscripción individual + vínculo a equipo; clasificación de equipo derivada (p. ej. tiempo del 3.º); categorías de equipo propias; opción «Carrera por equipos» en las propiedades. |
| **Relevos / Ekiden** | Tipo relevo: cada tramo se convierte en una carrera; chip por corredor o un chip por equipo (dorsal del chip = número de equipo); tiempo del equipo = llegada del último; matriz de vueltas acumuladas por equipo. |
| **Etapas** (varios días, misma gente) | Etapas dependientes (todos en todas) o independientes (cada carrera vinculada a parte de ellas); general = suma de tiempos por defecto; penalizaciones por etapa; maillots; licencia Experto/Pro. |
| **Una carrera que cruza la medianoche** (24 h, raid) | Opción «Carrera de varios días» del evento: todos los pasajes llevan fecha; entrada manual `Lun.hh:mm:ss`. |
| **Triatlón / duatlón / raid multisport** | No tiene tipo propio: segmentos entre controles, marcados «cronometrados» o no; tiempo = suma de segmentos cronometrados; un track GPX por segmento en Mapas. |
| **Torneo** (series, semifinales, final) | Etapas = rondas; pestaña «Brackets» con series y competidores por serie, clasificados por serie y lucky losers; paso de ronda arrastrando o con «ejecutar». |
| **Rally** (solo doc inglesa) | Tramos especiales como etapas, controles horarios, copiloto y coche en la cuadrícula. |
| **Campeonato / copa** (varios eventos) | Módulo Campeonatos: agrega varios .clax por puntos o suma de tiempos, con bonificación por participaciones, mínimo de participaciones y tolerancia de homónimos. |

---

## 5. El día de carrera en Wiclax

Secuencia reconstruida de «Mi primer evento», «Gestionar las salidas», «Principio de las adquisiciones» y «Cronometraje manual».

**Antes (días previos)**

1. **Crear el evento** con el asistente (o «Crear una prueba a partir de una prueba existente», que copia toda la configuración sin datos): nombre, organizador, fecha, disciplina, federación → categorías oficiales.
2. **Declarar la estructura**: carreras con nombre, distancia, color y rango de dorsales; controles intermedios del evento y a qué carreras se asocian; segmentos; opciones de vueltas si las hay.
3. **Importar participantes** desde Excel/CSV/TXT asociando columnas (dorsal obligatorio salvo autonumeración); la carrera se asigna sola por rango de dorsal; reimportar con el dorsal como clave actualiza sin duplicar.
4. **Cargar la correspondencia chip → dorsal** (fichero, portapapeles o columna «ID de chip»), salvo que chip = dorsal.
5. **Teclear las horas de salida previstas** de cada carrera, ola o grupo como filas de la lista de salidas (y, en contrarreloj, generar la lista de salidas individuales).
6. **Simular la adquisición** (Ctrl+F9) con pasajes aleatorios para validar configuraciones, correspondencias de chips y pantallas Live.

**Montaje (la mañana de la prueba)**

7. Poner lectores y PC en la **misma subred** (192.168.1.x) y en **hora GPS**; una sola red en el PC principal para que G-Live no se confunda.
8. **Crear una adquisición por lector** (F9 → fabricante → IP y puerto, p. ej. URTime :6546, Timing Sense Connector 127.0.0.1:1000 filtrando por origen SALIDA/LLEGADA, RFID Timing Ultra con la IP de la caja) y fijar su **destino** (Salida, Meta, CI_k o serie), el intervalo de recruce (10 s), si es línea de respaldo, filtros por prefijo, y **Conectar**.
9. Para los puntos sin red: adquisición remota («Online passings» del fabricante, nube de Wiclax vía wiclax.com/mysplits, o un fichero vigilado) o la app Android **Timing Point** para cronometraje manual a distancia.
10. Arrancar **G-Live local** (botón Live → `http://<ip>:8070`) y, si procede, la sesión en Internet y las pantallas Live/quiosco.

**Salida**

11. Al disparo, **sustituir la hora prevista por la exacta** (tomada del reloj del PC en ese momento o tecleada poco después). Las lecturas de la alfombra de salida durante el margen posterior se toman como salidas individuales (último paso); pasado el margen la misma adquisición enruta a Meta (2 min según el blog de la v10 / 10 min según la doc francesa, por confirmar).
12. Comprobar en la barra de progreso de llegadas (abajo) los contadores por carrera y control.

**Carrera**

13. Los pasajes llegan en continuo; Wiclax los traduce, aplica recruce/condiciones y actualiza clasificación, parciales y vueltas; G-Live local se refresca «en unos segundos» y su pestaña Live muestra los pasos en tiempo real. La doc no describe ningún paso de proceso manual.
14. Vigilar y corregir excepciones desde el **formulario de resultados** (F3): historial de pasajes del dorsal (integrados o no, filtrados por chip o estado), reasignar un pasaje a otro dorsal, marcar «para ignorar», añadir/quitar un paso (vueltas), editar la salida individual, cambiar de carrera a un corredor (p. ej. el que hizo el largo sin saberlo). Los avisos de chip desconocido se resuelven asignando el chip a un participante (por confirmar).
15. Si un lector falla: **rebobinar** la adquisición (pedir al hardware o a la nube los pasajes de un rango de fechas), o corregir su desfase con el **offset**; si la salida se dio tarde, cambiar la base con «primera salida».
16. Sin lector: cronometraje manual con barra espaciadora (genera tiempos) + dorsal con tecla C, o tecla Fin para prevalidar el dorsal; control de cronología que avisa de tiempos menores que uno ya clasificado.
17. Marcar a mano DNF/DSQ (en Backyard no hay eliminación automática por tiempo límite; si OTF se asigna solo, por confirmar), introducir penalizaciones y bonificaciones.

**Después**

18. Imprimir (F12, plantillas, resumen de etapa, podios), exportar (Excel, PDF, ITRA/UCI, formato XML personalizado), diplomas, SMS/email a corredores, dejar los resultados publicados en G-Live Internet; guardar el .clax (un evento = un archivo). Dónde persisten los pasajes no está documentado: para Chronelec, Wiclax crea un fichero de log aparte que solo rebobina en ese PC.

---

## 6. Resultados y publicación

- **Qué se publica**: clasificación general, por sexo y por categoría (dos niveles), parciales con rango por punto, vueltas, tiempo oficial y chip, equipos (solo si se marcan como publicables), clasificaciones adicionales, generales de etapas, maillots, podios por carrera y sexo, lista de inscritos.
- **G-Live local**: el PC es servidor web en `http://<ip>:8070` para la red del recinto; pestañas Resultados, Inscritos, Live (pasos en tiempo real, no pensada para persistir) y Carto. Sufijos `/live`, `/tv` (auto-scroll, tema oscuro), `/kiosk` (buscar un dorsal); parámetros `?B=186` (dorsal), `?I=` (dato personalizado publicado), `?R=` (índice de carrera), `live=1`. Actualización «en unos segundos».
- **G-Live Internet**: requiere la opción Web Services de la licencia (no está en Standard); asistente de puesta en línea; plugin WordPress G-Live CMS; fotos por marca de tiempo EXIF en `/photos/start|finish|split_n`, vídeos de llegada que arrancan unos segundos antes del paso, diplomas PDF, mapas GPX con geotracking opcional (opción de pago).
- **Pantallas Live**: diseñador de pantallas con widgets Reloj (cronómetro, hora o cuenta atrás), Lista de resultados (últimos pasos, líderes, general, equipos, inscritos, «en salida»/«en carrera» para contrarreloj) y Genérico (HTML); plantillas `.screenconfig`; controlador embebido para quien proyecta en el panel LED; «sticky leaders» en meta (v10.1).
- **Pantalla quiosco**: la lectura de un lector RFID en el PC se enruta como «petición de datos» para mostrar la ficha del atleta (verificación previa o fondo de foto de llegada).
- **API REST**: solo lectura, JSON, sin autenticación; en local se habilita al abrir un evento, por Internet es opción de pago y solo mientras Wiclax tiene el evento abierto. Para TV: URLs de lista de salida y general por etapa, y exportadores (fichero, socket, servidor TCP).
- **Salida de documentos**: Excel, PDF, formatos federativos (ITRA, UCI), XML personalizado con variables numeradas (22 tiempo, 23 salida individual, 40 chip, 74 gun, 30/31/75 rangos, 47 vueltas…), impresión con plantillas y resumen de etapa, diplomas `.mdp`, SMS por puntos (módulo de pago).

---

## 7. Camberas hoy frente a Wiclax

Producción = `main` aplicado. PR #11 = rama `claude/cronometraje-automatico` (migración `20261013180000`, no aplicada). El Ultra en directo (`20261014220000`) y el Receptor Ultra (`20261014233000`) se aplicaron el 15-oct y están en `main` (PR #13 y #14).

**Una diferencia que no cabe en la tabla y condiciona todo lo demás**: Wiclax es un PC que hace de servidor local; Camberas es solo nube. El Ultra remoto por 4G aguanta cortes (memoria del Ultra y confirmación `OK<n>` del receptor), pero la clasificación, `/start`, la web y el grafismo dependen de Supabase. Esa es la razón real de que RaceTec siga en paralelo (`receptor-ultra/pc/`). Antes de diseñar hay que decidir si Camberas **publica** lo que RaceTec (o la app de Javi) cronometra —y entonces lo que falta es conciliación entre ambos— o si Camberas **sustituye** a RaceTec y necesita una historia de «meta sin cobertura» (router 4G redundante, Ultra también por LAN al PC, importación posterior). Ver preguntas 1 y 10 en §8.

| Concepto | Wiclax | Camberas hoy (producción) | Camberas con el PR #11 | Hueco |
|---|---|---|---|---|
| Evento | Archivo .clax con carreras, etapas, controles | `races` (fecha, slug, organizador) | Igual | Sin etapas; «duplicar carrera» (`20260925150000`) hace de «crear a partir de prueba existente». |
| Carrera / recorrido | Carrera opcional, con rango de dorsales y clasificación propia | `race_distances` (distancia, `cutoff_time` texto, `is_visible`, **`bib_start`/`bib_end`/`next_bib`** editables en Recorridos) | Igual + `clasificar_por` | El rango existe pero solo lo usa la autonumeración; no hay unicidad de dorsal por carrera (solo `bib_chips UNIQUE(race_distance_id, bib_number)`), así que dos recorridos con el dorsal 15 se cruzan al casar lecturas por `bib_number`. Sin reglas de asignación. |
| Control (punto lógico) | Declarado a nivel de evento, asociado a carreras; lógico ≠ físico | `race_checkpoints` por recorrido (START/FINISH/CONTROL, `timing_point_id`, `min/max_time`, `min_lap_time`, `expected_laps`, vídeo de llegada `youtube_video_id`/`youtube_seconds_before|after`); varios controles pueden apuntar a la misma alfombra | Igual; el motor los recorre en orden | Modelo equivalente y más explícito para montaña (la alfombra del km 12 es META del corto, CONTROL 1 y CONTROL 3 del largo): **no es hueco**. Lo que falta es «copiar estructura de otro recorrido». El cálculo de producción ignora el orden y las vueltas. |
| Lector físico / adquisición | Adquisición en el PC con destino(s), recruce, offset, respaldo, filtros | `timing_points` por carrera con token; el Ultra entra por `ultra_registrar_lecturas`, el móvil por `/timing`, el fichero por «Importar RFID» | Igual | La alfombra no tiene parámetros propios (primer/último paso, offset, filtros); qué controles la leen lo dice `race_checkpoints.timing_point_id`. Sin offset es imposible corregir un Ultra con el horario de verano mal puesto sin editar lecturas. |
| Pasaje | Se guarda siempre con estado (nuevo/integrado/rechazado/ignorado); historial por dorsal | `timing_readings`; `is_processed` sin lectores; `status_code` (legado) solo actúa como filtro de exclusión (`calculate_split_times`, `LiveResults.tsx`) y nadie lo escribe; un chip sin dorsal **no se guarda** (`bib_number NOT NULL`); `is_rewind` existe y nadie lo rellena | Avisos `dorsal_sin_inscripcion`, `dorsal_repetido`; lecturas con `checkpoint_id` fijado valen solo para ese punto | No hay estado de pasaje ni «para ignorar»; lo descartado se borra; `ultra_registrar_lecturas` descarta `chips_sin_dorsal` **y** `fuera_de_ventana` tras confirmar al Ultra; se quedan solo en el fichero del VPS. |
| Chip → dorsal | Tabla N chips por dorsal; prefijos; códigos cortos; chip = dorsal sin tabla; chips desconocidos avisan si está activado «bloquear participantes desconocidos» (blog, por confirmar) | `bib_chips` 5 códigos por dorsal y recorrido; resuelto en SQL (Ultra) o en el navegador (fichero) | Igual | Sin regla «chip = dorsal por patrón» (prefijo + relleno), sin filtros, sin lista de chips desconocidos, sin reasignación posterior automática. |
| Competidor | Identidad = dorsal, una carrera, dos categorías | `registrations` + `race_category_id`; identidad = `registration_id` pero el cálculo casa por dorsal; ya tiene `club`, `team`, `team_id`, `team_member_id` | Igual, excluye canceladas, sexo por `gender_id` | Una sola categoría; inscritos no visibles sin sesión desde el 15-jul. |
| Salida | Lista de filas (hora prevista → exacta + condición + nombre + dorsales extra); olas; individual | `race_waves` **1:1** con recorrido, `hora_prevista` y `start_time` oficial (hora de pared); `cronometrador_contexto` da al puesto la **primera ola de la carrera**, no la del dorsal | Igual + seguro de salida desfasada | Sin varias olas por recorrido, sin salida por grupo/categoría, sin salida individual. Ya hoy, con dos recorridos a horas distintas, el puesto `/timing` muestra una salida equivocada para uno de ellos. |
| Tiempo oficial / chip | Ambos; clasificación por oficial por defecto, conmutable (por confirmar) | Solo pistola (`finish_time`) | `tiempo_chip` (última lectura en START entre salida −1 h y salida + `max_time`, nunca antes de la pistola), `clasificar_por` | El PR deja `tiempo_chip` **NULL** sin salida detectada y solo al clasificar por chip ordena a ese corredor por su oficial (`coalesce(tiempo_chip, finish_time)`); para igualar la regla de Wiclax habría que rellenar/mostrar chip = oficial en ese caso. |
| Recruce / primer-último paso | 10 s por defecto, parámetro de la adquisición (ámbito por confirmar); por destino primer/último; enrutado Salida→Meta tras 2 min (por confirmar) | Primera lectura por (inscripción, punto); `min_lap_time` decorativo | `motor_pasos`: primera lectura posterior al paso anterior; misma alfombra respeta `min_lap_time` (1 min por defecto) | El PR cubre el equivalente; la noción de «último paso» en salida es implícita. |
| Vueltas | Contador en Meta, modos de fin, primer paso no es vuelta, mejor vuelta, matriz | `lap_number` siempre 1; V1 = V2 en 153 de 233 corredores | `lap_number` = n-ésimo paso por la alfombra; parciales huérfanos se borran | Para XCO/XCM de 2–4 vueltas con una alfombra el modelo del PR basta y es más auditable. Fin por duración, ilimitado, Backyard y matriz solo si Camberas cronometra ese tipo de prueba (pregunta 9). |
| Condiciones de paso | Mín. por vuelta, mín. entre puntos, controles obligatorios; rechazo trazado | `min_time`/`max_time` solo en parciales, no en resultado | `min/max_time` y `min_lap_time` en el motor; aviso `meta_sin_paso` | Sin «controles obligatorios», sin rechazo trazable por lectura. En montaña una lectura perdida en un control con 4G es más frecuente que un atajo: solo propuesta, nunca aplicada. |
| Recálculo | La doc no describe proceso manual; G-Live se refresca en segundos | Botón «Procesar Tiempos y Resultados» por recorrido, que machaca tiempos y estados manuales | Triggers + `pg_cron` cada 15 s, idempotente, `tiempo_manual`/`estado_manual` protegidos | Cubierto por el PR #11. Falta «congelar» resultados como oficiales. |
| Estados | DNF/DSQ a mano; OTF existe (si se asigna solo, por confirmar) | FIN/STD del cálculo; DNF/DNS/DSQ/CUT a mano (Resultados o CSV) y se pierden al reprocesar; retiradas de `/timing` no llegan | Retiradas → DNF/DNS/DSQ; `estado_manual` prevalece y admite `CUT` («Fuera de Control», catálogo `race_results_status` desde `20251203081527`) | `/timing` no tiene `FUERA_CONTROL` entre sus `STATUS_OPTIONS` (`TimingApp.tsx:95-100`); ni el cálculo ni el puesto ponen CUT; sin propuesta de DNS. |
| Penalizaciones | Listas en tiempo/puntos, individuales y equipos, bonificaciones | No existen | `race_results.penalizacion` (sumada si FIN) | Sin bonificaciones, sin puntos, sin equipos, sin motivo/trazabilidad por penalización. |
| Corrección de lecturas | Reasignar dorsal, ignorar, +/− pasajes, editar hora, offset, rebobinar | Editar/borrar/mover en Lecturas Crono (segundos a 00) o en el puesto; importación RFID duplica al reimportar | Igual (pendiente en la doc del PR: edición a minuto, milésimas, duplicados) | Sin reasignación de pasaje huérfano (no existe la fila), sin offset, sin rebobinado desde el panel (solo `--reenviar` a mano en el VPS; el rewind del propio Ultra, nunca pedido). |
| Precisión | No documentada; milésimas solo en el protocolo genérico descrito por un cliente no oficial (por confirmar); UCI trunca al segundo | Segundo en `/timing`, fichero y panel; milésimas solo del Ultra en directo | Igual | Importación RFID pierde milésimas (`toLocalISOString`). En trail se publica al segundo (ITRA/FEDME): conservar las del Ultra, no gastar en mostrarlas. |
| Base horaria | Hora del día en base GPS; que no guarde zona horaria es deducción por ausencia (por confirmar); en varios días cada pasaje lleva fecha | Hora de pared `+00` nunca convertida; `ahora_pared()`/`hoy_local()`; GPS y `now()` son los únicos instantes reales. El Ultra manda segundos desde 1980 en hora local según **su** ajuste de zona/DST (`receptor-ultra/README.md:63-64`) | Igual | Compatible. Un Ultra con el DST mal pone todo a +1 h y el «seguro de salida» del PR bloquea el recorrido entero. La Garita (+1 h) y la Virgen (+1 día 2 h) tienen salidas descuadradas que el seguro del PR bloquea. `/timing` toma la hora del móvil y nadie mide la deriva. |
| Equipos / relevos / clubes | Equipos, relevos, categorías de equipo, criterios | `registrations.club/team/team_id/team_member_id` sin clasificación derivada | Igual | Falta la clasificación (tiempo del último, suma, N-ésimo), no el dato. |
| Etapas / campeonatos | Etapas dependientes/independientes, general, maillots; campeonatos entre .clax | No existen | No existen | Hueco entero. |
| Contrarreloj | Tipo propio, lista de salidas, pantalla `/starts` | No existe | No existe | Hueco entero. |
| Publicación local y web | G-Live :8070, Internet, /tv, /kiosk, API JSON | `/:slug/live` (`LiveResults.tsx`), `/race/:id/results`; todo público por RLS al instante; `race_results` no está en realtime; sin inscritos para visitantes sin sesión | Igual (`cronometraje_recorridos` en realtime) | Lo urgente: `/:slug/live` sin sesión y con refresco; grafismo lee `racetec_*`, no `race_results`. TV/quiosco/API después. |
| Cronometraje manual | Barra espaciadora (tiempos sin dorsal), tecla C, Fin, control de cronología, app Timing Point | `/timing` por token con cola offline, retiradas con motivo | Igual | El puesto por QR es equivalente o mejor para «dorsal + ahora». Falta el modo «tiempos sin dorsal + dorsales por orden», que es el respaldo real de una meta de trail con una alfombra. |
| Entrada de lecturas remota | Nube del fabricante, nube Wiclax, fichero vigilado, Timing Point | `receptor.py` → `ultra_registrar_lecturas` cada 2 s; «Importar RFID» | Igual | Receptor en marcha desde el 15-oct; sin rebobinado desde el panel. |
| Importación de inscritos | Excel/CSV con dorsal como clave de actualización | Inscripciones propias + CSV de chips | Igual | — |
| Salida de documentos | Excel, PDF, ITRA/UCI, XML custom, diplomas, SMS | PDF jsPDF (FIN), CSV | Igual | Sin ITRA, sin diplomas, sin plantillas. |

---

## 8. Qué tomar de Wiclax para reestructurar Camberas

Ordenado por lo que más duele hoy con 1–3 alfombras en montaña. En cada punto: qué se toma, por qué, qué toca, y si el PR #11 o el receptor del Ultra ya lo cubren. Los puntos que dependen de una respuesta del dueño remiten a las preguntas del final.

### 8.1 Recálculo continuo con correcciones protegidas — **ya lo cubre el PR #11**

La doc de Wiclax no describe ningún «Procesar»: los pasajes se integran y G-Live se refresca en segundos. Es la diferencia que explica casi todo el resto en Camberas (parciales que no cuadran, estados perdidos, vueltas a 1). El PR #11 lo resuelve con `motor_cronometraje` idempotente, marcas en `cronometraje_marcas`, `pg_cron` cada 15 s, `tiempo_manual`/`estado_manual` que prevalecen y borrado de parciales huérfanos. **Recomendación**: aplicar `20261013180000` antes que cualquier otra cosa; es la base sobre la que el resto tiene sentido. Toca `race_results`, `split_times`, `cronometraje_recorridos`, `ResultsManagement.tsx`. **Lo que falta**: un estado «resultados oficiales» por recorrido que pare el motor y deje trazado quién cerró y cuándo (el interruptor por recorrido del PR es el mecanismo; falta la semántica provisional/oficial y que la web pública la muestre).

### 8.2 Dorsal único por carrera y «chip = dorsal por patrón»

En Wiclax el dorsal es único en todo el archivo; el rango de dorsales sirve para asignar la carrera al inscribir o importar, y en el momento de la lectura el dorsal ya identifica al corredor sin ambigüedad. En Camberas `race_distances.bib_start/bib_end` **ya existen** (`DistanceManagement.tsx:1404-1468`) pero solo los usa la autonumeración, y no hay unicidad de dorsal en `registrations` (solo `bib_chips UNIQUE(race_distance_id, bib_number)`), así que hoy una lectura del dorsal 15 con dos inscripciones (21K y 10K) no tiene solución correcta posible. **Qué tocar**: índice único `(race_id, bib_number)` sobre inscripciones no canceladas; `bib_chips` pasa a ser por carrera, no por recorrido; validación de rango al asignar dorsal en `RegistrationManagement` y en el CSV de chips; el motor casa por `registration_id` cuando existe y por dorsal dentro de la carrera cuando no; el aviso `dorsal_repetido` del PR desaparece por construcción. Además, Wiclax trata «chip = dorsal» (con prefijo o código corto) como el modo normal, no como un filtro de parásitos: si Camberas se usa con bib-tags UHF con EPC = dorsal (pregunta 2), hace falta una regla por carrera (`chip_patron`: quitar prefijo, parsear entero) antes de ir a `bib_chips`, y el CSV de 5 chips por dorsal sobra. **No lo cubre el PR #11**.

### 8.3 Offset por lector y por puesto, aplicado en el motor

Wiclax corrige un lector mal sincronizado sumando o restando un valor fijo a todos los pasajes de la adquisición. En Camberas no hay forma de hacerlo salvo editando lecturas, y el Ultra manda la hora según su propio ajuste de zona/horario de verano: un Ultra con el DST mal pone todo a +1 h y el «seguro de salida» del PR bloqueará el recorrido entero sin dar salida. Lo mismo vale para los puestos manuales: `/timing` toma la hora del móvil y nadie comprueba la deriva (`reading_timestamp` ya permite medirla). **Qué tocar**: `timing_points.offset_ms` (aplicado al leer en el motor, **nunca** reescribiendo `timing_timestamp`, acotable a un día o tramo horario) y un offset equivalente por token de puesto; en `/timing`, mostrar «tu reloj va +7 s respecto al servidor» y `filtro_prefijo` para lecturas parásitas. Pantalla: `TimingPointsManagement.tsx`. **No lo cubren** ni el PR #11 ni el receptor (hoy la corrección de reloj solo se haría editando lecturas; el `offset` de `receptor.py` es posición en el fichero, no de reloj). Sin recruce por alfombra: el PR usa `min_lap_time` y el Ultra tiene su propio gating interno (por confirmar), así que sería redundante.

### 8.4 Guardar todo pasaje y darle estado (nunca tirar una lectura)

En Wiclax el pasaje se guarda siempre, con estado (nuevo / integrado / rechazado por condición / «para ignorar») y se reasigna de dorsal desde el historial. En Camberas un chip sin dorsal no se guarda (`bib_number NOT NULL`), `ultra_registrar_lecturas` descarta los `chips_sin_dorsal` **y** los `fuera_de_ventana` después de confirmar al Ultra (`OK<n>`), lo descartado en el panel se borra, y la importación duplica al reimportar. **Por qué**: hoy un chip asignado tarde obliga a `--reenviar` desde el VPS, y una corrección no deja rastro. **Qué tocar**: `timing_readings` → `bib_number` nullable (o `0` sentinel con `chip_code` obligatorio), nueva columna `estado` ∈ `nueva | integrada | rechazada | ignorada` con `motivo`, y un índice único también para las lecturas de fichero (por `(timing_point_id, chip_code, timing_timestamp)` cuando no hay `log_id`); `ultra_registrar_lecturas` guarda los `chips_sin_dorsal` y los `fuera_de_ventana` como filas `nueva` con motivo, y un trigger sobre `bib_chips` casa los primeros al asignar el chip; `motor_pasos` marca `rechazada` (con motivo `min_time`, `max_time`, `min_lap_time`) en vez de ignorar en silencio. En el panel, no un filtro más de Lecturas Crono sino una **vista propia «pasajes no integrados» por recorrido** (es la pantalla que el cronometrador mira en meta cada dos minutos) con acciones «asignar a dorsal», «cambiar de recorrido» e «ignorar» en vez de borrar. El receptor del Ultra ya conserva milésimas y deduplica por `log_id`; la pantalla «Receptor Ultra» (`20261014233000`) ya da el estado del VPS. **No lo cubre el PR #11** (sus avisos `dorsal_sin_inscripcion` señalan el problema pero no guardan el chip).

### 8.5 Rebobinado desde el panel: del Ultra y del VPS

Wiclax pide al hardware o a la nube los pasajes de un rango de fechas. En Camberas hay dos fuentes y ninguna tiene botón: la memoria del propio Ultra (comando de rewind; `timing_readings.is_rewind` existe desde `20251202193619` y nadie lo rellena) y el fichero del VPS (`/root/ultra/lecturas/AAAA-MM-DD.txt`, que es la fuente real porque el receptor confirma al Ultra al escribir en disco, no al insertar en Supabase; `receptor.py:16-19, 66`), con `--reenviar` a mano. **Qué tocar**: pantalla «Receptor Ultra» (`ReceptorUltraManagement.tsx`, tablas `ultra_receptores`/`ultra_destinos`) con «Reenviar día» y «Reenviar rango» del VPS, y «Pedir rewind al Ultra» marcando `is_rewind`, vía la cola de órdenes que ya sincroniza `ultra_receptor_sincronizar` (si no existe esa cola, añadirla a `ultra_receptores`). La migración `20261014233000` ya está aplicada.

### 8.6 Respaldo de meta: tiempos sin dorsal, dorsales por orden, puesto y vídeo

En Wiclax la barra espaciadora genera tiempos al paso de cada corredor y los dorsales se asocian después (columna de dorsales o tecla C, que toma el tiempo más antiguo; tecla Fin para prevalidar; control de cronología). Es la columna vertebral del respaldo en una meta de trail con una alfombra: `/timing` solo sabe «dorsal + ahora». La **línea de respaldo** de Wiclax (segunda alfombra en meta, tope de 1 min) no aplica con 1–3 alfombras: el respaldo real de Camberas es el puesto manual más el **vídeo de llegada que ya existe** (`race_checkpoints.youtube_video_id / youtube_video_start_time / youtube_seconds_before|after`), y el motor ya fusiona lecturas manuales y de alfombra si el puesto apunta al mismo `timing_point`. **Qué tocar**: en `/timing`, modo «tiempos» (un toque por llegada, sin dorsal) y modo «dorsales» (se teclean o los canta otro voluntario) con casado por orden y control de cronología; `FUERA_CONTROL` como `abandon_type` (→ `CUT`) para que el puesto de un control con hora de cierre lo apunte; en Lecturas Crono, columna «leído por alfombra / puesto / vídeo» y enlace al vídeo en el segundo del paso. **El PR #11** ya lleva las retiradas del puesto a DNF/DNS/DSQ y `estado_manual` admite `CUT`; falta todo lo demás.

### 8.7 Barreras horarias como hora de reloj, CUT y DNS propuestos, congelar resultados

Las barreras horarias en trail son horas de reloj («km 25 cierra a las 13:30»), no tiempos transcurridos: una salida retrasada no mueve la barrera. En Backyard Wiclax no elimina solo a quien supera el límite (DNF a mano); si en el resto de pruebas asigna OTF automáticamente o trae «barreras horarias», por confirmar antes de dar la regla por buena. **Qué tocar**: `race_checkpoints.hora_cierre` como hora de pared `+00` (igual que `race_waves.start_time`), mostrar en parciales la hora de paso además del tiempo, y que el motor **proponga** (no aplique) CUT para quien pasa después del cierre y DNS para quien no tiene ninguna lectura en ningún punto al cerrar la prueba (el destino «Control salida» de Wiclax es ese check-in de presencia; la recogida de dorsal puede alimentarlo desde `/timing`). `cutoff_time` de `race_distances` queda como texto informativo. En Resultados, mostrar los no-FIN al final con su estado (hoy `LiveResults.tsx` solo pinta FIN y STD). Junto con 8.1: estado «oficial» que congela el recorrido.

### 8.8 Cambio de recorrido en carrera («bajarse del largo al corto»)

Es cotidiano en trail y los reglamentos suelen permitirlo. Wiclax lo resuelve con regla de asignación («tiene tiempo en CI_x → carrera larga») y reevaluación al cambiar datos, y permite cambiar la carrera con resultados ya existentes (si recalcula con la nueva salida, por confirmar). **Qué tocar**: aviso «dorsal del largo leído solo en controles del corto / pisó la meta del corto» y un botón de cambio de recorrido en Resultados que mueve la inscripción, recalcula con **la salida del recorrido nuevo** y conserva las lecturas. Depende de 8.2 (dorsal único por carrera). Pregunta 5.

### 8.9 Publicación: clasificación pública sin sesión, realtime y grafismo

Wiclax expone la misma clasificación en `/tv`, `/kiosk`, `?B=dorsal` y API JSON, y el grafismo bebe de ahí. En Camberas el overlay lee `racetec_*` y `/:slug/live` no se refresca cuando cambia `race_results` (no está en la publicación realtime) ni muestra inscritos sin sesión. **Qué tocar, en este orden**: añadir `race_results` y `split_times` a `supabase_realtime`; una RPC pública `clasificacion_publica(p_race_distance_id)` (SECURITY DEFINER, anon + authenticated, solo campos publicables, con `clasificar_por` mostrado como «oficial / chip» y los dos tiempos visibles) que sustituya la lectura directa de `registrations` en `LiveResults.tsx`; que los overlays de `camberas-overlays` puedan leer esa misma RPC como alternativa a RaceTec. Modo TV/quiosco (`/:slug/live/tv`, `/:slug/live/kiosk?b=`) y API después. El PR #11 lista «clasificación pública sin sesión» como pendiente; no lo cubre.

### 8.10 Clasificaciones por filtro y por equipos/parejas

Wiclax construye clasificaciones adicionales aplicando un filtro sobre la principal (mejor joven, locales) y clasificaciones de equipo derivadas de los individuales (suma de tiempos, suma de rangos, tiempo del último compañero). Son la segunda petición más habitual del organizador de montaña tras la general (locales, federados, parejas, clubes) y en Camberas son una vista sobre `registrations` (`club`, `team_id`, campo personalizado) que **no toca el motor**. Van antes que etapas, maillots, campeonatos o la segunda categoría de Wiclax. Pregunta 7.

### 8.11 Importación RFID al nivel del receptor

La importación de fichero (`RFIDImportDialog.tsx`) pierde milésimas, no deduplica, exige un solo punto por fichero y no entiende el formato del Ultra. El receptor del Ultra ya resuelve todo eso en SQL (`ultra_registrar_lecturas`: lote, chip→dorsal, ventana, idempotencia por `log_id`, milésimas). **Recomendación**: que «Importar RFID» deje de resolver chips en el navegador y llame a la misma RPC (o a una gemela `importar_lecturas(p_timing_point_id, p_lecturas)` con idempotencia por `(timing_point_id, chip_code, timing_timestamp)`), mapeando `ID_Lector` → puesto con el mismo criterio que el receptor (un token por lector → `timing_points`, dispositivo `ultra-<lector>`) o con una tabla nueva lector→puesto; `ultra_lectores` **no sirve** para eso: solo liga cada Ultra con su `identificador` y `timer_name` de RaceTec, no tiene `timing_point_id`. Así la lectura es la misma venga por TCP o por fichero, como la «adquisición de tipo archivo» de Wiclax.

### 8.12 Salidas como lista de filas — **solo si el dueño las usa**

Wiclax modela la salida como filas «hora + condición + nombre + dorsales adicionales», y el tiempo oficial de cada corredor sale de **su** fila. Camberas tiene `race_waves` 1:1 con `race_distances` (`UNIQUE`), así que una categoría que sale 10 min después, dos cajones o un grupo élite no se pueden cronometrar bien. En trail/MTB de montaña las olas son raras (cajones en maratón MTB, élite adelantada), así que **solo si la pregunta 4 lo justifica**, y en versión mínima: N filas por recorrido con `nombre`, `orden`, `hora_prevista`/`start_time` y lista explícita de `race_category_id[]` o `dorsales` (que prevalecen), **sin** motor de condiciones ni «determinación automática de ola por chip». El motor resuelve «salida oficial del corredor = fila que lo incluye, si no la fila por defecto del recorrido». `hora_prevista`/`start_time` ya tienen semántica equivalente a «prevista → exacta» (Camberas conserva ambas; Wiclax sustituye la prevista por la exacta) y los triggers `race_waves_completar_salidas` y `auto_create_wave_for_distance` siguen valiendo para la fila por defecto. Pantallas: Recorridos, `WavesManagement.tsx`, `/start` (`StartControl.tsx`, `useStartControlSync.ts`) fila a fila, y `cronometrador_contexto` para que `/timing` muestre la salida del dorsal y no «la primera ola de la carrera» (`20260804140000:167-170`; esto último conviene arreglarlo **aunque no haya olas**, porque ya falla con dos recorridos a horas distintas). **El PR #11 no lo cubre**; su `motor_salida_desfasada` habría que evaluarlo por fila. Convendría copiar también que una lectura en salida **no sobrescriba** la salida chip si el corredor ya tiene un paso posterior (regla literal de «Dealing with starts»).

### 8.13 Ensayo con lecturas simuladas

Wiclax trae la simulación de adquisición (Ctrl+F9: pasajes aleatorios a la frecuencia deseada) para validar configuración, correspondencias y pantallas antes de la carrera. Camberas no tiene nada parecido. **Qué tocar**: duplicar la carrera a un slug `demo-*` (si `cronometraje_window` ya trata esos slugs con ventana abierta, por confirmar) y una RPC que genere lecturas falsas por alfombra, para probar estructura, ventanas y publicación antes del domingo. Se usa desde el paso 2 del orden en adelante, y se contrasta cada cambio del motor con lecturas brutas y resultados oficiales de carreras pasadas (pregunta 12), además de las 925/927 llegadas con que se validó el PR.

### 8.14 Fuera del alcance mientras no cambie la respuesta del dueño

Motor de vueltas completo (fin por duración + n vueltas, ilimitado, Backyard con salida por vuelta, matriz: para XCO/XCM de 2–4 vueltas el `lap_number` del PR basta), contrarreloj con lista de salidas y pantalla `/starts`, etapas, campeonatos, maillots, penalizaciones en puntos, relevos, diplomas, SMS, modo TV/quiosco y API JSON. Wiclax los resuelve, pero con 8.1–8.8 hechos el modelo de Camberas (alfombra ≠ control, lecturas atadas a la alfombra con estado, dorsal único, salida por fila) ya sería el de Wiclax y esos tipos se añadirían sin rehacer nada. Preguntas 9 y 10.

### Preguntas al dueño antes de diseñar

1. ¿RaceTec sigue siendo el cronometraje oficial el día de carrera y Camberas publica, o Camberas debe sustituirlo? ¿Quién firma los resultados que se mandan a la federación?
2. ¿Qué chips se usan: bib-tags UHF con EPC = dorsal (y el Ultra en modo «Chip = Bib»), chips reutilizables con tabla, o ambos según carrera? ¿Cuántos códigos por dorsal hay de verdad (dual tag)?
3. ¿Cuántas alfombras/Ultras hay por carrera (¿un Ultra con 2–4 lectores en el arco, otro remoto por 4G?) y cuántos puestos manuales con móvil? ¿Qué cobertura hay en las metas habituales?
4. ¿Hay carreras con salidas por olas o cajones, o salida adelantada de élite/categorías? ¿Cuáles y con qué frecuencia?
5. ¿Los reglamentos permiten cambiar de recorrido en carrera (bajarse del largo)? ¿Cómo se gestiona hoy?
6. ¿Hay barreras horarias por control (hora de reloj) y quién decide CUT: el puesto del control o el cronometrador en meta?
7. ¿Hay pruebas por parejas/equipos/clubes y con qué criterio (tiempo del último, suma, N-ésimo)? ¿Clasificaciones de locales/federados?
8. ¿Qué exportaciones se exigen de verdad (ITRA, FEDME/federación autonómica, RFEC, Excel del organizador) y en qué formato de tiempo?
9. ¿Se cronometran pruebas por vueltas (XCO, cross) o contrarreloj? Si no, 8.14 queda fuera del alcance.
10. ¿Qué hace exactamente la app de Javi: es de escritorio (offline), lee el Ultra en directo, calcula clasificaciones? ¿La idea es que conviva con Camberas (Camberas publica lo que ella calcula) o que Camberas haga lo mismo? Cambia el diseño tanto como la pregunta 1.
11. ¿Cómo se cuadra hoy la hora del Ultra (GPS o manual) y la de los móviles antes de la salida? ¿Ha habido carreras con el Ultra a +1 h por horario de verano?
12. ¿Se puede obtener el export de dos o tres carreras pasadas (lecturas Ultra brutas + resultados oficiales de RaceTec) para contrastar cualquier motor nuevo?

### Respuestas del dueño

**15-oct, pregunta 1.** «RaceTec y Wiclax son programas complejos y con muchas opciones.
Camberas es una plataforma que PUEDE CRONOMETRAR carreras sencillas de trail: salida, puntos
intermedios y meta. La idea es que Camberas cronometre, pero sin grandes pretensiones. Vamos a
seguir siendo nube, e incluso se puede hacer un respaldo en local y seguir cronometrando con
localhost si hiciera falta, o al revés: cronometrar con localhost y hacer un respaldo en la nube.»

Consecuencias para el diseño:

- **Alcance cerrado**: salida en masa, controles intermedios y meta, con vueltas sencillas
  (2–4 sobre la misma alfombra, lo que ya hace el PR #11). Quedan fuera contrarreloj, etapas,
  campeonatos, relevos, torneos, Backyard y la lista de salidas con condiciones (8.12 solo si
  algún día hay olas de verdad). 8.14 queda fuera del todo.
- **Camberas cronometra**: no publica lo de otro. Hace falta todo lo de 8.1–8.9; RaceTec
  y Outreach siguen en paralelo como red de seguridad mientras se afina, gracias al receptor
  del Ultra (`receptor-ultra/`), que ya replica cada lectura a los dos sitios.
- **Nube con respaldo local**: hoy ya ninguna lectura depende de la nube (el VPS las guarda
  en disco y confirma al Ultra desde ahí; el PC las recibe por el puerto 23024). Lo que no
  existe es **clasificar sin internet**: para eso haría falta una copia de Camberas en el PC
  (Supabase local con Docker, la misma web apuntando a `localhost` y el receptor del PC
  insertando en esa copia con la misma RPC `ultra_registrar_lecturas`) y una sincronización
  con la nube en los dos sentidos. Es un proyecto aparte, posterior a 8.1–8.9, y conviene
  decidir antes qué se necesita de verdad: (a) no perder lecturas y poder clasificar después
  si cae internet, que ya está; o (b) seguir clasificando en vivo sin internet, que es la
  copia local.

### Orden propuesto

1. Aplicar el PR #11 (`20261013180000`), que ya está escrito; el Ultra en directo y el Receptor Ultra ya están aplicados.
2. **8.2** unicidad de dorsal por carrera, `bib_chips` por carrera y «chip = dorsal por patrón», usando `bib_start/bib_end` existentes.
3. **8.3** offset por lector y por puesto aplicado en el motor; deriva de reloj visible en `/timing`.
4. **8.4** pasajes guardados siempre con estado (incluidos `fuera_de_ventana`), vista «no integrados» con asignar/cambiar recorrido/ignorar; **8.5** rebobinado pidiendo al Ultra y al VPS; **8.8** cambio de recorrido.
5. **8.6** respaldo de meta: tiempos sin dorsal + dorsales por orden en `/timing`, `FUERA_CONTROL` en el puesto, vídeo de llegada en Lecturas Crono.
6. **8.7** `hora_cierre` por control como hora de pared, CUT y DNS **propuestos**, congelar resultados como oficiales (**8.1**).
7. **8.9** clasificación pública sin sesión + realtime + grafismo leyendo de Camberas; **8.10** clasificaciones por filtro y por equipos/parejas; **8.11** importación unificada.
8. **8.12** salidas en N filas por recorrido, solo si la pregunta 4 lo justifica (arreglar antes `cronometrador_contexto` en todo caso).
9. **8.13** ensayo con lecturas simuladas sobre carrera `demo-*` desde el paso 2 en adelante, y contraste contra los datos de la pregunta 12 antes de cada paso que toque el motor.
10. **8.14** fuera del alcance mientras no cambien las respuestas a 9 y 10.

Cada migración termina con la guardia de horas (`guardia_horas()` sin `FALLO`), y toda columna de hora nueva (`hora_cierre`, filas de salida) sigue siendo hora de pared `+00`: Wiclax trabaja con horas del día en base GPS, así que el modelo es compatible (que no guarde zona horaria es deducción por ausencia; por confirmar).

---

## 9. Lo que no se ha podido comprobar

Todo el material de Wiclax sale de resúmenes de búsqueda y extractos, no de la lectura íntegra de cada página; el presupuesto de búsqueda se agotó en dos de los cuatro bloques, los dos revisores tampoco pudieron buscar y el proxy del entorno bloquea `docs.wiclax.com`. Preguntas abiertas, agrupadas:

**Pendientes de los revisores (prioritarias; se pueden lanzar en un mensaje posterior)**
- Criterio de clasificación por defecto oficial/chip: el bloque *adquisición* dice que la opción es «Clasificación basada en tiempos de disparo», el bloque *resultados* que es basar la clasificación en tiempos chip, y la doc inglesa «Ranking based on gun times».
- 2 min (blog v10) frente a 10 min (doc FR) para enrutar lecturas de la línea de salida a meta, y si es configurable.
- Si OTF se asigna solo y dónde se fija el límite de tiempo; si Wiclax ≥ 9 trae «barreras horarias» automáticas.
- Si la ficha de carrera tiene campo propio de hora de salida además de la fila de la lista de salidas.
- Precisión/milésimas fuera del caso UCI.
- Si editar la hora de una salida masiva recalcula a todos los afectados.

**Correcciones de los revisores no aplicadas por contradecir el material**
- «En Wiclax un pasaje en Meta anterior a la salida de la carrera no se integra»: el material dice literalmente que no se encontró una regla explícita que descarte pasajes anteriores a la salida (solo la recomendación de fijar la hora prevista y el retardo tras el disparo). La vista de «pasajes no integrados» se recomienda igualmente para Camberas (8.4), pero sin atribuir esa regla a Wiclax.
- «Wiclax resuelve peor que Camberas el control compartido por varios recorridos»: el material dice que Wiclax declara dos controles lógicos sobre una adquisición física y asocia controles a carreras, es decir, lo resuelve; se ha dejado en «modelo equivalente, no es hueco» sin valorar cuál es mejor.
- Que el Ultra tenga modo «Chip = Bib» y *gating* interno de relecturas viene de la práctica del revisor, no del material ni del `README` del receptor: se cita como «por confirmar».

**Modelo**
- Sintaxis y editor de las «condiciones personalizadas» de asignación de carrera, y si «Asignar a competidores» pisa asignaciones manuales.
- Qué pasa con los resultados al cambiar a un corredor de carrera (¿se recalculan con la nueva salida?) y con un pasaje en un control no asociado a su carrera.
- Cómo se asocia en la interfaz un control a unas carreras y no a otras; dónde se declaran los segmentos.
- Si «curso/recorrido» es exactamente «carrera» o hay una entidad aparte (la doc los trata igual).
- Entradas del glosario para Pasaje, Chip, Salida, Meta: no aparecieron.
- Límites por licencia (carreras, etapas, adquisiciones); solo consta que RFID, ficheros y nube son Pro, etapas Experto/Pro.

**Adquisición**
- Si el intervalo de recruce de 10 s es por adquisición, por destino o global, y su rango.
- Formato exacto del fichero para una adquisición de tipo archivo; el protocolo genérico de línea (y la presencia de lector/antena y milésimas en la trama) viene de un cliente Java no oficial.
- Estados exactos de un pasaje y cómo se reintegra o elimina uno integrado; dónde persisten los pasajes (¿dentro del .clax?).
- Comportamiento actual ante chips desconocidos («bloquear participantes desconocidos», dorsales desde 100000): solo en el blog.
- Especificación de «Passing cloud» y flujo de la app Timing Point (pantallas, lotes, sin cobertura).
- Procedimiento para «inicializar el reloj de Wiclax» y si toma hora GPS/NTP directamente; si guarda zona horaria o solo hora de pared.
- Puertos por defecto de RFID Timing Ultra/EchoActive e Ipico; contenido de ITS Chrono.

**Tipos de prueba**
- Relevos: dónde se detecta el cambio y cómo se asigna cada paso al tramo con chip único; cómo se calcula el tiempo individual de cada tramo.
- Vueltas: ordenación con duración fija; tratamiento de parciales repetidos por vuelta en la clasificación intermedia; la ordenación «vueltas, luego tiempo» solo está literal en Backyard.
- Varios días: pases a medianoche y lectores que mandan solo hora.
- Etapas: pasos para «mejor tiempo» / «distancia total»; efecto de «ronda de prueba».
- Equipos: dónde se fija el N-ésimo corredor y equipos incompletos; torneos: reparto en series y arrastre de tiempos.
- Contrarreloj: salidas adelantadas o retrasadas con detección en línea.

**Resultados**
- Ex aequo en una carrera simple; precisión y redondeo fuera del caso UCI.
- Cómo se marca DNS/DSQ/OTF, si se conserva el tiempo y cómo se ordenan.
- Edición manual de resultados y su trazabilidad.
- Página «G-Live en línea» (pasos, frecuencia en Internet), «PDF reports», nacionalidades y banderas, traducción de G-Live, endpoints concretos de la API, lista completa de «Otros formatos», servicio de geolocalización de Mapas, plantilla del SMS, correo a corredores.
- Tabla completa de variables de exportación (IDs 80, 108 y series 1xxx/2xxx/9xxx).
- Podios: solo visto en el blog.

**Camberas**
- El motor del PR #11 se contrastó solo en lectura contra producción (925 de 927 llegadas); no se ha probado con olas múltiples ni con el Ultra en directo porque el PR #11 no está aplicado (las del Ultra sí, desde el 15-oct).
- Si `cronometraje_window` trata los slugs `demo-*` con ventana abierta (8.13).
- Si `race_checkpoints.youtube_*` se usa hoy en alguna pantalla del panel o solo en la web pública.
- No se ha visto la app de Javi, así que no se puede decir qué parte de Wiclax ha copiado ni cómo (pregunta 10).

---

## 10. Fuentes

Documentación de Wiclax (español):
- https://docs.wiclax.com/es
- https://docs.wiclax.com/es/empezando-con-wiclax/glosario
- https://docs.wiclax.com/es/empezando-con-wiclax/mi-primer-evento
- https://docs.wiclax.com/es/empezando-con-wiclax/licencia-y-activacion
- https://docs.wiclax.com/es/empezando-con-wiclax/descarga-e-instalacion
- https://docs.wiclax.com/es/usando-wiclax/la-interfaz-general
- https://docs.wiclax.com/es/usando-wiclax/la-interfaz-general/consejos-y-atajos
- https://docs.wiclax.com/es/usando-wiclax/la-interfaz-general/trabajando-con-cuadriculas
- https://docs.wiclax.com/es/usando-wiclax/el-asistente-de-creacion-de-pruebas
- https://docs.wiclax.com/es/usando-wiclax/carreras-y-cursos
- https://docs.wiclax.com/es/usando-wiclax/gestionar-las-salidas
- https://docs.wiclax.com/es/usando-wiclax/adquisicion-de-datos-de-cronometraje/principio-de-las-adquisiciones
- https://docs.wiclax.com/es/usando-wiclax/adquisicion-de-datos-de-cronometraje/correspondencia-dorsal-chip
- https://docs.wiclax.com/es/usando-wiclax/adquisicion-de-datos-de-cronometraje/cronometraje-manual
- https://docs.wiclax.com/es/usando-wiclax/adquisicion-de-datos-de-cronometraje/condiciones-de-paso
- https://docs.wiclax.com/es/usando-wiclax/adquisicion-de-datos-de-cronometraje/adquisiciones-remotas
- https://docs.wiclax.com/es/usando-wiclax/adquisicion-de-datos-de-cronometraje/los-diferentes-sistemas
- https://docs.wiclax.com/es/usando-wiclax/adquisicion-de-datos-de-cronometraje/los-diferentes-sistemas/urtime
- https://docs.wiclax.com/es/usando-wiclax/adquisicion-de-datos-de-cronometraje/los-diferentes-sistemas/timing-sense
- https://docs.wiclax.com/es/usando-wiclax/transmision-de-resultados-en-vivo/aplicacion-g-live
- https://docs.wiclax.com/es/usando-wiclax/transmision-de-resultados-en-vivo/aplicacion-g-live/presentacion
- https://docs.wiclax.com/es/usando-wiclax/transmision-de-resultados-en-vivo/aplicacion-g-live/mapas
- https://docs.wiclax.com/es/usando-wiclax/transmision-de-resultados-en-vivo/pantallas-live
- https://docs.wiclax.com/es/usando-wiclax/transmision-de-resultados-en-vivo/pantallas-quiosco
- https://docs.wiclax.com/es/usando-wiclax/transmision-de-resultados-en-vivo/trabajar-con-una-agencia-de-television
- https://docs.wiclax.com/es/usando-wiclax/exportar
- https://docs.wiclax.com/es/usando-wiclax/imprimir
- https://docs.wiclax.com/es/trabajar-en-red/api
- https://docs.wiclax.com/es/los-diferentes-tipos-de-prueba/contrarreloj-individual
- https://docs.wiclax.com/es/los-diferentes-tipos-de-prueba/carrera-de-vueltas-circuito
- https://docs.wiclax.com/es/los-diferentes-tipos-de-prueba/carrera-por-etapas
- https://docs.wiclax.com/es/los-diferentes-tipos-de-prueba/carrera-de-relevos
- https://docs.wiclax.com/es/los-diferentes-tipos-de-prueba/carrera-por-equipos
- https://docs.wiclax.com/es/los-diferentes-tipos-de-prueba/carrera-de-varios-dias
- https://docs.wiclax.com/es/los-diferentes-tipos-de-prueba/backyard
- https://docs.wiclax.com/es/los-diferentes-tipos-de-prueba/torneos
- https://docs.wiclax.com/es/los-diferentes-tipos-de-prueba/raid-multisport
- https://docs.wiclax.com/es/otras-caracteristicas/clasificaciones-de-equipo
- https://docs.wiclax.com/es/otras-caracteristicas/campeonatos
- https://docs.wiclax.com/es/otras-caracteristicas/clasificaciones-adicionales
- https://docs.wiclax.com/es/otras-caracteristicas/penalizaciones-y-bonificaciones
- https://docs.wiclax.com/es/otras-caracteristicas/prize-money
- https://docs.wiclax.com/es/otras-caracteristicas/maillots
- https://docs.wiclax.com/es/otras-caracteristicas/variables-de-evento
- https://docs.wiclax.com/es/otras-caracteristicas/variables-de-exportacion
- https://docs.wiclax.com/es/otras-caracteristicas/campos-calculados
- https://docs.wiclax.com/es/otras-caracteristicas/diplomas

Documentación de Wiclax (inglés y francés, donde no había versión en español):
- https://docs.wiclax.com/en/getting-started/glossary
- https://docs.wiclax.com/en/use-wiclax/dealing-with-starts
- https://docs.wiclax.com/en/use-wiclax/acquisition-of-timing-data/the-different-systems
- https://docs.wiclax.com/en/use-wiclax/acquisition-of-timing-data/the-different-systems/race-result
- https://docs.wiclax.com/en/use-wiclax/acquisition-of-timing-data/the-different-systems/rfid-timing
- https://docs.wiclax.com/en/use-wiclax/acquisition-of-timing-data/the-different-systems/chronelec
- https://docs.wiclax.com/en/use-wiclax/acquisition-of-timing-data/the-different-systems/ipico
- https://docs.wiclax.com/en/use-wiclax/acquisition-of-timing-data/the-different-systems/mylaps
- https://docs.wiclax.com/en/use-wiclax/acquisition-of-timing-data/the-different-systems/chronotrack
- https://docs.wiclax.com/en/use-wiclax/acquisition-of-timing-data/the-different-systems/feibot
- https://docs.wiclax.com/en/use-wiclax/acquisition-of-timing-data/the-different-systems/macsha-rufus
- https://docs.wiclax.com/en/use-wiclax/acquisition-of-timing-data/the-different-systems/j-chip
- https://docs.wiclax.com/en/use-wiclax/acquisition-of-timing-data/the-different-systems/dag-system
- https://docs.wiclax.com/en/use-wiclax/acquisition-of-timing-data/the-different-systems/urtime
- https://docs.wiclax.com/en/use-wiclax/acquisition-of-timing-data/basic-network-principles
- https://docs.wiclax.com/en/use-wiclax/acquisition-of-timing-data/manual-timekeeping
- https://docs.wiclax.com/en/use-wiclax/acquisition-of-timing-data/bib-chip-correspondence
- https://docs.wiclax.com/en/use-wiclax/entering-importing-participants/importing-participants
- https://docs.wiclax.com/en/use-wiclax/entering-importing-participants/assignment-of-bib-number
- https://docs.wiclax.com/en/use-wiclax/live-results-broadcast/g-live-app/local-g-live
- https://docs.wiclax.com/en/use-wiclax/live-results-broadcast/g-live-app/kiosk-and-tv-modes
- https://docs.wiclax.com/en/use-wiclax/live-results-broadcast/g-live-app/photos-and-videos
- https://docs.wiclax.com/en/use-wiclax/live-results-broadcast/live-screens
- https://docs.wiclax.com/en/integrations-third-party-services/generic-interfaces
- https://docs.wiclax.com/en/integrations-third-party-services/our-partners
- https://docs.wiclax.com/en/all-competition-types/backyard
- https://docs.wiclax.com/en/all-competition-types/relay-races
- https://docs.wiclax.com/en/all-competition-types/stage-race
- https://docs.wiclax.com/en/all-competition-types/uci-stage-race
- https://docs.wiclax.com/en/all-competition-types/tournaments
- https://docs.wiclax.com/en/all-competition-types/individual-time-trial
- https://docs.wiclax.com/en/all-competition-types/multisport-raid
- https://docs.wiclax.com/en/all-competition-types/rally
- https://docs.wiclax.com/en/other-features/export-variables
- https://docs.wiclax.com/utiliser-wiclax/acquisition-de-donnees-de-chronometrage/le-principe-des-acquisitions
- https://docs.wiclax.com/utiliser-wiclax/saisie-et-import-de-concurrents/import-de-participants
- https://docs.wiclax.com/utiliser-wiclax/diffusion-des-classements-en-temps-reel/lappli-g-live/presentation
- https://docs.wiclax.com/utiliser-wiclax/diffusion-des-classements-en-temps-reel/lappli-g-live/autres-adresses-utiles
- https://docs.wiclax.com/autres-fonctionnalites/envoi-de-sms
- https://docs.wiclax.com/autres-fonctionnalites/les-categories
- https://docs.wiclax.com/autres-fonctionnalites/trophees-et-championnats

Blog y web de Wiclax:
- https://wiclax.com/
- https://www.wiclax.com/blog/novedades-de-la-versi%C3%B3n-10
- https://www.wiclax.com/blog/new-version-10
- https://www.wiclax.com/blog/nouvelle-version-10-0
- https://www.wiclax.com/blog/nouvelle-version-10-1
- https://www.wiclax.com/blog/nouvelle-version-9-1
- https://www.wiclax.com/blog/version-82
- https://www.wiclax.com/blog/tag/fr
- https://www.wiclax.com/blog/tag/etapes
- https://www.wiclax.com/blog/tag/versi%C3%B3n
- https://www.wiclax.com/blog/how-to-set-up-your-local-network-for-a-good-use-of-wiclax

Fuente no oficial (por confirmar):
- https://github.com/csutorasa/wiclax4j/blob/master/docs/protocol.md

Camberas (repo, `main` `eaa8426` y rama `origin/claude/cronometraje-automatico`):
- `CLAUDE.md`, `GUIA_CRONOMETRAJE.md`, `receptor-ultra/README.md`, `receptor-ultra/receptor.py`, `receptor-ultra/pc/`
- `supabase/migrations/20261014220000_lecturas_ultra.sql`, `20261014233000_receptor_ultra_destinos.sql`, `20260804140000_cronometrador_blindaje.sql`, `20260925150000_duplicar_carrera.sql`, `20251218205624_21c8fd3a-c326-428e-8336-55600413b760.sql` (`bib_chips`), `20251203081527_b4e238f0-1e5b-4fd8-bbb4-b2b4ffd979f2.sql` (`race_results_status`), `20251202193619_e3199e85-acd5-454a-8e1b-da693191fdef.sql` (`timing_readings`), `20251207214105_0b5ef752-f24b-4398-9d2e-f9286fbe3588.sql` (`calculate_split_times`), `20260123091354_b41b7f0f-fedf-495d-ab94-dca727678d67.sql`, `20260106224158_eb0465d1-96db-4a0c-9d5c-c4b499eb0519.sql`, `20260928090000_hora_prevista.sql`
- `src/pages/TimingApp.tsx`, `src/pages/LiveResults.tsx`, `src/pages/RaceResults.tsx`, `src/components/admin/ResultsManagement.tsx`, `src/components/admin/RFIDImportDialog.tsx`, `src/components/admin/SplitTimesManagement.tsx`, `src/components/admin/TimingReadingsManagement.tsx`, `src/components/admin/TimingPointsManagement.tsx`, `src/components/admin/CheckpointsManagement.tsx`, `src/components/admin/WavesManagement.tsx`, `src/components/admin/DistanceManagement.tsx`, `src/components/admin/RegistrationManagement.tsx`, `src/components/admin/ReceptorUltraManagement.tsx`, `src/pages/StartControl.tsx`, `src/hooks/useStartControlSync.ts`, `src/lib/timezoneUtils.ts`, `src/integrations/supabase/types.ts`, `src/AppCamberas.tsx`
- Rama PR #11: `supabase/migrations/20261013180000_cronometraje_automatico.sql`, `docs/cronometraje-automatico.md`
