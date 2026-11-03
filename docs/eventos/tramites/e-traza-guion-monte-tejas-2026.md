# e-TRAZA · guion para el II Trail Navideño Monte Tejas 2026

Guion para rellenar la solicitud en TRAZA (sede de la DGT) siguiendo la guía
rápida «Servicios GIS de TRAZA para subida de track» (Subdirección General de
Gestión de Movilidad y Tecnología). TRAZA no funciona con Internet Explorer: usar
Chrome o Edge. Plazo: al menos 30 días antes de la prueba (tope 13-nov-2026).

## 0. Qué tener a mano

- GPX del recorrido: `public/gpx/trail-navideno-monte-tejas-2026.gpx` (también en
  https://camberas.com/gpx/trail-navideno-monte-tejas-2026.gpx). 16,65 km, 5.809 puntos,
  formato track (`trkpt`), que es el que lee TRAZA (admite .gpx, .kmx y .kml).
- Trazado en PDF: `docs/eventos/trazados/trail-navideno-monte-tejas-2026.html`
  impreso a PDF (plano, perfil, horarios de paso y tramos por vía pública).
- Reglamento de la prueba (secciones en Camberas › Reglamento).
- Solicitud al Ayuntamiento: `docs/eventos/tramites/solicitud-ley-3-2017-monte-tejas-2026.docx`.
- Certificado digital o Cl@ve de Jonatan Corona Miguel (representante del club).

## 1. Crear el expediente

Expediente ya creado el 2-nov-2026: **EDSO261102/007187**. Entrar por el icono de expediente de la lista; no crear otro.
Si ya existe una SIMU, entrar por el icono de expediente de la lista.

### Datos generales

| Campo | Valor |
|---|---|
| Denominación del evento | II Trail Navideño Monte Tejas |
| Tipo de evento | Prueba deportiva · carrera a pie (trail / carrera por montaña) |
| Fecha de inicio y fin | 13/12/2026 (un solo día) |
| Hora de inicio | 10:30 |
| Hora de fin | 14:00 |
| Provincia / municipio | Cantabria · San Felices de Buelna |
| Ámbito | Provincial (Jefatura Provincial de Tráfico de Cantabria) |
| Organizador | Club Deportivo Elemental KM Vertical Torrelavega · CIF G39861828 · Barrio El Llano 57A, San Felices de Buelna |
| Representante | Jonatan Corona Miguel (presidente) · DNI 72128421F. Tramita por autorización de representación (3-nov-2026): UNO Cronometraje SL, CIF B39801097, C/ Guevara 28 bajo, 39001 Santander, 609 131 130, 2026@uno.es; actúa Bernardo Mazón Blanco, DNI 13750056N |
| Teléfono / correo | 679 602 812 · Kmverticaltorrelavega@gmail.com |
| Coorganizador | Grupo de Montaña Tejas4run |
| Colabora | Ayuntamiento de San Felices de Buelna |
| Participantes previstos | 200 |
| Vehículos de la organización | 0 en el recorrido (ambulancia en punto fijo) |

### Memoria

Texto para la descripción:

> Carrera por montaña (trail) de 16 km y 860 m de desnivel positivo, circular, con
> salida y llegada en la plaza del Ayuntamiento de San Felices de Buelna a las
> 10:30 h del domingo 13 de diciembre de 2026. Prácticamente todo el recorrido
> discurre por sendas y caminos del Monte Tejas. Solo 1,6 km de ida y 1,6 km de
> vuelta transitan por carretera (CA-736), zonas asfaltadas y zona de pueblo, más
> 500 m por el parque de la Lama. No se solicita corte de tráfico: los
> participantes circulan por acera o arcén respetando las normas generales de
> circulación y las indicaciones de la organización, con voluntarios en los
> cruces. Máximo 200 participantes mayores de 16 años, con dorsal y chip. Cierre
> de control a las 14:00 h. Ambulancia de soporte vital básico con médico y dos
> técnicos desde las 10:00 hasta las 14:15 h.

## 2. Itinerario (pestaña Itinerario)

1. **Añadir etapa**: fecha de inicio `13/12/2026`, denominación
   `Trail Navideño 16 km` › Aceptar.
2. En la fila de la etapa, icono **subir track** (el de la flecha sobre la bandeja) ›
   Examinar › `trail-navideno-monte-tejas-2026.gpx` › Adjuntar. Aparece «Ruta
   adjuntada correctamente en la solicitud, comienza su proceso en servidor GIS».
3. Esperar unos minutos. En la página principal, **Alertas › Tiene avisos
   pendientes**: «Ha sido procesado correctamente el fichero de ruta».
4. Volver al expediente › Itinerario. Aparecen los tramos de carretera detectados,
   desordenados y sin horarios. Lo esperable para este recorrido:
   - **CA-736** (tramo principal de paso: salida y llegada por el pueblo).
   - Posibles «tramos de cruce» o «tramos libres» por caminos que la base de datos
     de carreteras de la DGT no reconoce: se pueden **borrar** sin afectar al track.
   - Si aparece la CA-170 o la CA-701 por error de precisión del GPS, borrarlas:
     el recorrido no las pisa.

### Icono violeta: horarios sobre el mapa

Abrir el itinerario (icono violeta) y esperar a que a la derecha salgan las
carreteras detectadas. Pasar el ratón por el recorrido hasta que reconozca la
CA-736 y pinchar con el **botón izquierdo** sobre el punto de la salida y sobre el
de la meta para que calcule los PK. Rellenar:

**Tramo CA-736**

| Campo | Valor |
|---|---|
| Hora inicio (primer participante en PK inicio) | 10:30 |
| Hora fin (último participante en PK fin) | 14:00 |
| Nombre | CA-736 (el que proponga el combo) |
| Sentido de los carriles ocupados | Ambos |
| Grado de ocupación | Solo arcén (los corredores no ocupan la calzada) |
| Tramo abierto a la circulación | SÍ |
| Ocupación calzada | Circulación (no es cruce) |
| Descripción | Ida y vuelta por el mismo tramo: pueblo y parque de la Lama, 1,6 km en cada sentido, sin corte de tráfico. Voluntarios en los cruces. |

Como el recorrido pasa dos veces por el mismo tramo (ida y vuelta), **el tramo se
añade una sola vez** con los horarios de la primera pasada del primero y de la
última pasada del último (guía, página 9).

**Puntos de interés** (parte inferior de la ventana, uno por uno › Guardar)

| Punto | Tipo | PK | Hora inicio (1.º) | Hora fin (último) |
|---|---|---|---|---|
| Salida · plaza del Ayuntamiento | Salida | el calculado | 10:30 | 10:30 |
| Fin del tramo urbano (ida) · entrada a pistas del monte | Paso | el calculado | 10:38 | 11:00 |
| Inicio del tramo urbano (vuelta) · salida de pistas | Paso | el calculado | 11:42 | 13:30 |
| Meta · plaza del Ayuntamiento | Meta | el calculado | 11:54 | 14:00 |

Horarios con el ritmo del ganador de 2025 (5:03 min/km) y el ritmo de corte
(12:37 min/km, cierre a las 14:00). Recursos humanos por punto: `Auxiliar
habilitado`, 1 o 2 por cruce (voluntarios del club), a confirmar con el club.

Los avituallamientos (km 5,5 y 12,1) y el techo (km 7,8) están en monte, fuera de
la red de carreteras: no van en TRAZA.

### Detalle del tramo (pinchar en el tramo, pestaña Itinerario)

Corregir los PK de inicio y fin a mano si no coinciden con los calculados en el
mapa. Hora de corte inicio `10:30`, hora de corte fin `14:00`. Ocupación
`Circulación`, grado `Solo arcén`, tramo abierto `SÍ`.

Botones **Jefaturas afectadas** (Cantabria) y **Guardar**.

## 3. Personal y seguridad

| Campo | Valor |
|---|---|
| Responsable de la prueba | Jonatan Corona Miguel · 72128421F · 679 602 812 (confirmar) |
| Responsable de seguridad vial | PENDIENTE: nombre, DNI y teléfono |
| Personal auxiliar (voluntarios) | PENDIENTE: número; se sitúan en los cruces del tramo urbano, controles y avituallamientos |
| Vehículo de apertura / cierre | No hay vehículos en el recorrido; cierre con corredores escoba |
| Servicio sanitario | 1 ambulancia clase B (SVB) con médico y 2 técnicos, de 10:00 a 14:15 h, en punto con acceso rápido a las vías |
| Señalización | Cintas y banderines naranjas; se retira todo al terminar |
| Seguros | RC y accidentes de la entidad organizadora: PENDIENTE compañía, nº de póliza y cobertura |

## 4. Documentos y observaciones

Adjuntar: reglamento (PDF), trazado (PDF), solicitud/permiso del Ayuntamiento
cuando lo emita, pólizas de RC y accidentes (antes de la prueba) y, si procede,
permiso federativo.

Observaciones:

> Prueba por montaña con solo 3,2 km por vía pública (1,6 km de ida y 1,6 de
> vuelta por la CA-736 y viales municipales de San Felices de Buelna, sin corte de
> tráfico). El Ayuntamiento de San Felices de Buelna colabora y ha incluido la
> prueba en su traslado de eventos en vía pública.

## 5. Antes de enviar

- Las cinco pestañas en verde (Datos generales, Memoria, Itinerario, Personal y
  seguridad, Documentos).
- Guardar la SIMU y pasarla a solicitud; firmar con el certificado.
- Anotar el número de expediente en Camberas › Carreras › Documentación › trámite
  «Autorización de tráfico (ETRAZA / DGT)».
