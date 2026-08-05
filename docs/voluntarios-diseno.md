# Diseño: Voluntariado (alta y asignación)

Documento para validar antes de tocar código. Fecha: 4-ago-2026.
Decisiones del usuario incorporadas en la revisión del mismo día.

**Alcance acordado**: dar de alta voluntarios y asignarlos a un puesto de la
carrera. **Fuera de alcance por ahora** (con el gancho previsto abajo):
fichaje/presencia en vivo, GPS del voluntario en el mapa, incidencias y avisos.

## La idea en una frase

**El voluntario no es un usuario: es una fila.** Igual que el cronometrador
dejó de necesitar cuenta (la identidad es el puesto, no la persona), aquí no
hay altas de usuario, ni contraseñas, ni invitaciones por email. Alta y
asignación son trabajo de despacho del organizador; el voluntario recibe un
papel o un WhatsApp con **dónde (con enlace al mapa), cuándo y a quién llamar**.

## Decisiones cerradas

| Cuestión | Decisión |
|---|---|
| Nombre | **Voluntariado** (menú, pantalla y textos). "Bolsa" solo como concepto interno. |
| Ámbito de la bolsa | **Del organizador**, reutilizable entre carreras y ediciones. |
| Turnos | **No**. El voluntario cubre todo el evento; sin `shift_start`/`shift_end`. |
| Puestos | **Catálogo propio** (`race_posts`), no texto libre. |
| Rol "jefe de voluntarios" | **No**. Asigna el organizador (o el admin). |
| Ubicación | **Del puesto**, no de la persona. Ver apartado propio. |
| Datos del voluntario | Nombre, **DNI**, **carnet de conducir**, **teléfono**. Ver apartado propio. |

## Lo que ya existe y se reutiliza

| Pieza | Qué aporta |
|---|---|
| `roadbook_items` (rutómetro) | Los cruces y avituallamientos **ya están cargados**, con `item_type`, `km_total`, `latitude`/`longitude`. De ahí salen los puestos con un botón, sin teclear ni recolocar en el mapa. |
| `timing_points` | Los puestos de cronometraje también necesitan gente: se enlazan, no se duplican. |
| Panel + `RaceSelectorHeader` | Patrón de pantalla por carrera ya montado (ver `TimingPointsManagement.tsx`). |
| `menu_items` (`menu_type` admin/organizer) | El menú del panel y el de la PWA `/org` leen la misma tabla: una fila y aparece en los dos. |
| Patrón token (`generar_token_*` → `gps_tokens`) | Si algún día el voluntario usa móvil (fichar, GPS), el QR por puesto encaja sin rehacer el modelo. |

## Modelo de datos: tres tablas

Convención del repo: tablas en inglés, RPCs nuevas en español (como
`generar_token_cronometrador`).

### 1. `volunteers` — el voluntariado del organizador

```
id                 uuid pk
organizer_id       uuid not null   -- dueño de la bolsa
full_name          text not null
phone              text not null   -- imprescindible: es el canal del día de carrera
dni                text            -- normalizado en mayúsculas y sin espacios
driving_license    text            -- clases: 'B', 'A2', 'B, A2'…  vacío = no conduce
email              text
notes              text            -- "tiene coche", "solo mañanas", talla…
active             bool default true
created_at / updated_at
unique (organizer_id, phone)   -- deduplica al importar
unique (organizer_id, dni) where dni is not null
```

**La bolsa es del organizador, no de la carrera.** Los mismos vecinos, el mismo
club y la misma familia repiten cada edición: alta una vez, reasignación cada
año. Si colgara de la carrera habría que teclearlo todo otra vez en junio.

Sobre los tres datos nuevos:

- **Teléfono**: obligatorio. Es lo único que se usa de verdad el día de carrera
  y la clave de deduplicación al importar de una hoja de Excel.
- **DNI**: su finalidad es **asegurar al voluntario en caso de accidente** — es
  el dato con el que la póliza lo identifica, y sin él la persona no está
  cubierta. Se guarda el número, nunca una foto ni un escaneo. Consecuencia en
  la pantalla: **un voluntario asignado sin DNI se marca en rojo**, porque un
  puesto cubierto por alguien sin asegurar no está cubierto. La cuenta que
  interesa la víspera son dos: puestos sin gente y gente sin DNI.
- **Carnet de conducir**: lo que hace falta saber es **si puede conducir y de
  qué clase** (escoba, coche de apoyo, moto abre-carrera), no el número del
  documento. Se guarda por tanto la **clase** (`B`, `A2`…), campo de texto
  corto, y el sistema lo usa para filtrar candidatos en los puestos de tipo
  `escoba` y `movil`. Si alguna aseguradora acaba pidiendo el número, se añade
  columna entonces — pedirlo "por si acaso" es guardar un documento de más.

### 2. `race_posts` — el catálogo de puestos (hoy no existe)

```
id                uuid pk
race_id           uuid not null → races(id) on delete cascade
name              text not null            -- "Cruce de la ermita"
kind              text not null            -- cruce | avituallamiento | salida |
                                           -- meta | guardarropa | parking |
                                           -- escoba | movil | otro
needed            int not null default 1   -- cuántas personas hacen falta
latitude          numeric
longitude         numeric
location_hint     text                     -- "junto al panel de madera, lado río"
notes             text                     -- "llevar cinta y chaleco"
post_order        int
roadbook_item_id  uuid null → roadbook_items(id)   -- hereda km y coordenadas
timing_point_id   uuid null → timing_points(id)    -- puesto que además cronometra
```

**Tabla nueva, no reutilizar `timing_points`.** Solo dos o tres puestos son de
cronometraje; los quince restantes (cruces, avituallamientos, guardarropa,
parking) no pintan nada en el catálogo de crono y lo ensuciarían. El reuso se
hace por enlace: botón **"generar puestos desde el rutómetro"** que crea un
`race_posts` por cada cruce y avituallamiento del roadbook, con nombre, km y
coordenadas ya puestos.

### 3. `volunteer_assignments` — quién va a qué puesto

```
id            uuid pk
race_id       uuid not null → races(id) on delete cascade
post_id       uuid not null → race_posts(id) on delete cascade
volunteer_id  uuid not null → volunteers(id)
role          text default 'apoyo'      -- responsable | apoyo
status        text default 'propuesto'  -- propuesto | confirmado | no_disponible
notes         text                      -- "va con el coche", "llega a las 8"
assigned_by   uuid
assigned_at   timestamptz default now()
unique (post_id, volunteer_id)
índices por (race_id) y por (volunteer_id)
```

Sin horas de turno: el voluntario cubre todo el evento (decisión). Si una
carrera necesitara relevos, se resuelve con dos puestos o con la nota, y si se
vuelve habitual se añaden las columnas entonces.

**Cobertura** = `needed` frente al número de asignaciones `confirmado` del
puesto. Es la única cuenta que importa la víspera: qué puestos están al
descubierto. RPC `voluntariado_cobertura(p_race_id)`.

## La ubicación: en el puesto

La ubicación va en **`race_posts`**, no en la asignación. El sitio es del
puesto: dos voluntarios en el mismo cruce están en el mismo cruce. Lo que sí
cambia de una persona a otra —"tú en la esquina de arriba"— es un matiz, y para
eso está `volunteer_assignments.notes`. Meter coordenadas por persona obligaría
a colocar en el mapa a cada uno, veinte veces en vez de una.

De dónde salen las coordenadas, por orden de comodidad:

1. **Del rutómetro**, al generar los puestos: cruces y avituallamientos ya las
   tienen. Es el camino normal y no cuesta nada.
2. **Del mapa**, pinchando: para los puestos que no están en el roadbook
   (parking, guardarropa, salida).
3. **A mano**, pegando coordenadas.

Y para qué sirven, que es lo importante:

- **Enlace "cómo llegar"** (`https://www.google.com/maps/search/?api=1&query=lat,lng`)
  en la hoja impresa, en el WhatsApp y en el propio panel. Esto es la mitad del
  valor del módulo: el voluntario que no es del pueblo encuentra su cruce solo.
- **Vista de mapa de la carrera** con todos los puestos y su cobertura: de un
  vistazo se ve el tramo que ha quedado sin cubrir.
- Cuando llegue el fichaje o el GPS, ya está puesto lo necesario.

## Datos personales: lo que hay que hacer bien

Con DNI y carnet, esta tabla pasa a ser **el dato más sensible del panel**, por
encima de las inscripciones. Tres consecuencias de diseño, no burocracia:

1. **RLS estricta**: admin o el organizador de la carrera. La bolsa, solo su
   dueño. **Nada a `anon`**, y ninguna RPC que devuelva `dni` sin sesión.
   Recordatorio de la lección de julio: todo `REVOKE ... FROM PUBLIC` con
   `GRANT` explícito a `authenticated`, o se rompe el panel.
2. **El DNI no se imprime.** Las hojas de puesto y los mensajes de WhatsApp
   circulan por muchas manos: llevan nombre, teléfono y ubicación. El DNI solo
   se ve en la ficha del voluntario dentro del panel, y se exporta únicamente
   en el listado que se manda a la aseguradora.
3. **Base legal y conservación.** La política de privacidad de hoy habla de
   participantes, no de voluntarios; hace falta un texto que diga qué se guarda
   y para qué — y la finalidad es concreta y defendible: **cubrir al voluntario
   con el seguro de accidentes de la prueba**. Ojo con el plazo: el DNI **no se
   borra al acabar la carrera**, porque un parte de accidente puede abrirse
   después; se conserva mientras la póliza admita reclamación y se borra
   entonces. El plazo exacto lo marca la aseguradora — es el único dato que
   falta para cerrar este apartado. No bloquea el desarrollo, sí el uso en una
   carrera real.

## Panel

Pantalla `src/components/admin/VoluntariadoManagement.tsx`, con
`RaceSelectorHeader` y fila nueva en `menu_items` para `admin` y `organizer`
(deep-link `/organizer?view=voluntariado`). Dos pestañas:

**1. Voluntariado** — tabla con buscador, alta rápida en una línea (nombre +
teléfono, el resto luego), ficha con DNI y carnet, importar pegando de
Excel/CSV, y marcar inactivo en vez de borrar (el que un año no puede, al
siguiente sí).

**2. Puestos y asignación** — lista de puestos con su cobertura (`2/3`, en rojo
si falta gente) y su ubicación, asignar desde un selector que busca en la bolsa
(y que en puestos `escoba`/`movil` propone primero a quien tiene carnet), más
los dos botones que ahorran la tarde entera:
- **Generar puestos desde el rutómetro** (cruces y avituallamientos del roadbook).
- **Copiar de la edición anterior** (puestos y asignaciones de otra carrera del
  mismo organizador; lo normal es que cambie poco).

**Salida** — lo que de verdad se usa el día de la carrera:
- Hoja por puesto para imprimir: nombre del puesto, km, ubicación con enlace,
  voluntarios con teléfono, y el contacto de organización. **Sin DNI.**
- Texto por voluntario listo para pegar en WhatsApp, con su enlace de mapa.
- **Listado para la aseguradora**: nombre y DNI de los asignados a la carrera,
  exportación aparte y explícita, que además avisa de quién falta por DNI antes
  de mandarlo.
- CSV del listado general, sin DNI.

## Ganchos para después (no se implementan ahora)

| Siguiente paso | Qué haría falta |
|---|---|
| Fichaje / presencia | `volunteer_assignments.checked_in_at` + token por puesto con el patrón `generar_token_*`; el QR del puesto ya encaja. |
| GPS del voluntario (escoba, moto, control móvil) | Ya resuelto en camberas-motos y Track: colgar un `token_id` del `race_posts` y aparece en el mapa. |
| Incidencias / avisos | Tabla aparte colgando de `post_id`; no obliga a cambiar nada de lo de arriba. |

## Orden de implementación sugerido

1. Migración: tres tablas, RLS y `voluntariado_cobertura`.
2. Pestaña **Voluntariado** (alta, ficha, importar) — utilizable ya sola.
3. `race_posts` + generación desde rutómetro + ubicación en mapa.
4. Asignación y cobertura.
5. Impresión, WhatsApp y exportación.

Los pasos 1–2 son media sesión; el conjunto, una sesión larga.

## Nota sobre dónde vive esto

En el repo `camberas` (panel del organizador), no en `camberas-track`: los
voluntarios son organización de carrera, no seguimiento. Si más adelante Track
se independiza ([[project-track-independiente]]), `race_posts` es el equivalente
de los puestos de un `track_event` y se importaría igual que los participantes.
