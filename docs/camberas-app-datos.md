# Camberas.app: la estructura de datos

Apuntado el 16-oct-2026. Fuentes: el inventario (`scratchpad/wiclax/inventario.md` y `.json`), `docs/camberas-app.md`, `docs/libro-cronometraje.md`, `docs/analisis-wiclax.md` §7, `CLAUDE.md`, `docs/copias-de-seguridad.md` y la búsqueda de quién lee y escribe cada tabla en `src/`, `supabase/functions/` y `supabase/migrations/`. Nada se ha comprobado contra la base real. Además, el repo no reconstruye la base (§1), así que lo que no sale del código ni de las migraciones está marcado como duda (§11).

**Glosario breve** (para leer el resto):

| Palabra | Qué quiere decir aquí |
|---|---|
| traída | Un robot pide a la otra app la lista entera y la compara con la suya por clave: es un `APPEND FROM` con `SEEK` cada minuto. |
| si existe se actualiza, si no se añade | `SEEK` y luego `REPLACE` o `APPEND` (en SQL, *upsert*). |
| repetirlo no duplica | Se puede volver a lanzar sin que salgan filas de más (en inglés, *idempotente*). |
| copia | Tabla con datos cuyo dueño es otra app. No se edita en el receptor. |
| datos de la inscripción | Nombre, sexo y demás tal como se tecleaban al inscribirse. No se leen de la cuenta. |
| embebido | Consulta del cliente que trae otra tabla colgada por su clave foránea (`registration:registrations(...)`). Si se quita la FK, deja de funcionar. |
| realtime | Aviso en directo de Supabase cuando cambia una fila de una tabla publicada. |
| recorrido | Lo que Camberas llama también «evento» (`race_distances`; `gps_tokens.event_id` = `race_distance_id`; libro §10, decisión 12). En este documento «evento» no significa «mensaje». |

## 1. Punto de partida

Camberas nació como web de inscripciones (`registrations`, nov-2025) y ha crecido alrededor de esa tabla. Hoy es **una sola web**: Vite + React, publicada por Lovable, con dos árboles de rutas (`src/App.tsx` → `AppCamberas.tsx` / `AppWebPropia.tsx`). Funciona sobre **un solo Postgres** de Supabase, con **111 tablas, 130 claves foráneas y 99 funciones** inventariadas, todo en `public`.

Al inventario le falta lo más nuevo:
- `ultra_receptores`, `ultra_destinos` y `ultra_lectores` (15-oct): son 114 tablas en `main`.
- `gps_devices.token_id`.
- Lo del PR #11, sin aplicar (`cronometraje_recorridos`, `cronometraje_marcas`): con él serían 116.

Las únicas tablas creadas en migraciones que no salen en el inventario son cuatro ya borradas: `checkpoint_distance_assignments`, `direct_conversations`, `direct_messages` y `moto_assignments`.

**El repo no reconstruye la base.**
- 24 tablas del inventario no tienen `CREATE TABLE` en `supabase/migrations/`. Entre ellas está el núcleo de Seguimiento (`gps_tokens`, `gps_positions`, `gps_sos_alerts`, `gps_devices`) y también `moto_*`, `overlay_riders/teams/stages`, `overlays_results`, `start_list`, `race_leaderboard`, `microgate_times`, `finish_photos`, `app_settings`, `overlay_control`, los dos respaldos y `racetec_*` (salvo `racetec_leaderboard_split`).
- Las funciones se parchean sustituyendo la definición de producción (`20261002100000`).
- Hay un trigger del repo que nunca se aplicó (`20260306195742`, citado en `20260923200000`).

Cómo ha crecido: cada prestación nueva (cesiones, recogida de dorsales, voluntarios, web propia, receptor Ultra) ha añadido tablas que cuelgan de `races` y funciones que leen de varias áreas a la vez. El resultado:

- **Lo más referenciado.** A `races` la referencian **40 tablas**, a `race_distances` **17** y a `registrations` **12**. `profiles` recibe **10 FK desde 8 tablas** (`blog_posts` y `timer_assignments` llevan dos cada una).
- **Columnas de un área en tablas de otra.** La política de inscripción vive en `race_distances` y `races`: `price`, `registration_opens/closes`, `max_participants`, `bib_start/bib_end/next_bib`. El «nombre de TV» del grafismo (`name_tv`) vive en `gps_tokens` y `race_motos`.
- **Funciones que cruzan áreas sin contrato:**
  - `cesion_crear`, `cesion_info` y `cesion_aceptar` miran `timing_readings` y `race_results` para saber si «ya ha corrido» (`20260826120000_cesion_dorsal.sql`, líneas 404, 526 y 796).
  - `cesion_ejecutar` reescribe `gps_tokens.participant_name`.
  - `assign_next_bib` hace `UPDATE race_distances`.
  - `duplicar_carrera` escribe en seis tablas de inscripción y en las columnas de precio y dorsal de `race_distances`.
  - `admin-delete-user` borra `registrations`, `training_plans` y `chat_*`.
  - `reenviar-comprobantes` lee `gps_tokens` para meter el enlace de activación GPS (líneas 705–709 y 939).
  - `get_live_gps_positions` hace JOIN con `registrations` y lee `gps_tracking`.
  - `LiveResults.tsx` junta en el navegador `race_results` con `registrations`, `registration_responses`, `registration_form_fields` y `profiles`. Por eso el visitante sin sesión ve la clasificación vacía desde la RLS del 15-jul.
- **Triggers de un área que tocan otra:**
  - `asignar_categoria_inscripcion` (sobre `registrations`).
  - `trg_link_registrations_on_dni_update` (de `profiles` a `registrations`).
  - `trigger_auto_seed_registration_fields` (AFTER INSERT en `race_distances`, siembra `registration_form_fields`).
  - `races_borrado_protegido` (cuenta `registrations`).
  - En el PR #11, `cronometraje_marcar_recorrido` (sobre `registrations`).
- **Políticas RLS que cruzan áreas.** Si `registrations` sale de la base, fallan al ejecutarse y con ellas cae la lectura de carreras:
  - `races` «Anyone can view visible races or own races» (`20260112191848`) llama a `user_has_gps_registration_for_race` (lee `registrations` y `auth.users`) y a `user_has_moto_assignment_for_race` (lee `race_motos.user_id`).
  - `race_distances` «View race distances with proper access control» (`20260112222119`) llama a `user_has_gps_registration` y a `user_has_moto_assignment_for_distance`.
  - `profiles` «Organizers can view profiles of their race participants» (`20251125095039`) hace JOIN con `registrations`.
  - `race_results` y `split_times` «Organizers can manage…» (`20251121174802`) hacen JOIN con `registrations`.
- **Realtime y embebidos que necesitan la FK:**
  - `registrations` está en `supabase_realtime` y `OrganizerApp.tsx:401` se suscribe a ella.
  - `LiveGPSMap.tsx` se suscribe a `timing_readings` y a `gps_tracking`.
  - Embebidos `registration:registrations(...)` en `ResultsManagement`, `OrgResults`, `SplitTimesDisplay`, `SplitClassification` y `RaceResults`.
  - Unos 37 embebidos de `races` y `race_distances`, muchos desde pantallas y funciones de inscripción: `Dashboard`, `Profile`, `RegistrationManagement`, `BibChipsManagement`, `LatestRegistrations`, `TshirtSummary`, `MesasRecogidaManagement`, `redsys-init-payment`, `redsys-devolucion`, `rockthesport-sync`, `cesion-solicitar-enlace` y `send-race-reminders`.
- **Tablas que parecen muertas pero aún tienen lectores:**
  - `moto_positions`: la lee `MotoMapViewer.tsx`.
  - `gps_tracking`: la leen `GPSTrackingViewer`, `GPSPositionsDeletion`, `TimingReadingsManagement`, `LiveGPSMap` y el primer camino de `get_live_gps_positions`.
  - `moto_race_config`: el operador del circuito nuevo guarda ahí su GPX (`20260805100000:119-133`).
  - Sin lectores conocidos en este repo: `timer_assignments`, `start_list`, `race_leaderboard`, `microgate_times`, `chat_*`, `training_plans`, dos respaldos manuales y el modelo de ciclismo (`overlay_riders/teams/stages`, `overlays_results`).

El problema para separar no es el número de tablas. **Los límites entre áreas no existen** ni en la base (FK, triggers y políticas cruzados) ni en el código (una pantalla lee cinco áreas). Y `registrations` es a la vez la plaza vendida, la identidad del corredor, el dorsal, el chip y la clave del resultado.

## 2. La decisión: Inscripciones aparte

Decisión del dueño (15-oct): «La web de inscripciones ha de ser independiente de las carreras: su base de datos, su código y su herramienta para conectar con la carrera y con las clasificaciones.» Para la carrera, Inscripciones pasa a ser **una plataforma de inscripción más, como RockTheSport**. El repo ya tiene dos veces esa herramienta: `rockthesport-sync` y `eventbooking-sync`.

| Hoy | Con la decisión |
|---|---|
| `registrations` comparte base con `timing_readings`, `race_results` y `gps_tokens`. Le apuntan 12 FK y salen de ella y de sus tablas otras 26 | **Base propia** de Inscripciones (ver el detalle debajo de la tabla) |
| Pantallas de inscripción repartidas por `src/pages`, `src/components/admin` y `src/components/org`. Edge Functions de pago junto a las de GPS | **Código propio**: un repo (= un proyecto Lovable = un Supabase) con la ficha de inscripción, el panel del organizador para inscritos, Redsys, emails, cesiones, recogida e importadores |
| Cronometraje lee `registrations` con `.from()`, con embebidos y en SQL (`cronometrador_*`, `ultra_registrar_lecturas`, `calculate_race_results`). Seguimiento la lee para tokens y Carreras para recuentos | **Herramienta de conexión** (§5): la base de la carrera *trae* de Inscripciones la lista entera (inscritos, dorsales, chips, categorías, atributos, equipos y parejas). Inscripciones *trae* de la carrera la ficha, las salidas y los enlaces GPS. Los resultados se leen de la clasificación pública |
| La política de inscripción está en tablas de Carreras (`race_distances.price`…) | Esa política nace en la base de Inscripciones. Carreras conserva el recorrido, el tiempo límite y el enlace de resultados |
| Triggers, políticas y RPC cruzan áreas sin aviso | Ninguna app escribe en tablas de otra. Lo que necesita de la otra lo trae, o llama a una RPC suya |

Detalle de la base propia:
- De las 12 FK que entran a `registrations`, ocho salen de tablas que se mudan con ella y no se rompen: `cesiones_dorsal`, `consultas_inscripcion`, `coupon_redemptions`, `entregas_dorsal`, `payment_intents`, `payment_intent_items`, `recuperacion_pagos` y `registration_responses`.
- Cruzan entre apps cuatro:
  - `race_results` (CASCADE).
  - `race_results_abandons` (CASCADE).
  - `timing_readings` (sin ON DELETE: hoy impide borrar una inscripción con lecturas).
  - `gps_tracking` (CASCADE).
- `gps_devices.registration_id` no tiene FK.
- Salen hacia el resto 26: 16 a `races`, 7 a `race_distances`, y `registrations.race_category_id`, `user_id` (→ `profiles`) y `gender_id`. Cuántas de estas acaban dentro de la base de Inscripciones depende de §10.1 y §10.3.
- En total se rompen unas 30, más las que van a `auth.users`, que el inventario no ve.

Lo que cambia de fondo: hoy «inscrito» y «corredor cronometrado» son la misma fila. Con la separación, **la base de la carrera tiene su propia tabla `inscritos`**, copia de la de Inscripciones con el mismo id. La mantiene al día la traída, no una FK.

**El orden.** El párrafo «El orden» de `docs/camberas-app.md` deja «inscripciones y carreras para el final». Este documento adelanta Inscripciones por la decisión del 15-oct. La decisión habla de independencia, no de orden, así que es una elección: separar Inscripciones primero cuesta unas 30 FK y lectores en las cinco áreas. Hay que corregir `camberas-app.md` cuando se acepte.

## 3. El núcleo

Las pocas entidades que todas las apps necesitan, su dueño y la clave estable que viaja entre apps:

| Entidad | Tabla hoy | Dueño propuesto | Clave estable que cruza apps | Quién más la copia |
|---|---|---|---|---|
| Carrera | `races` | **Carreras y organización** | `race_id` (uuid), `slug` | Inscripciones (ficha mínima) |
| Recorrido | `race_distances` (incluidos `cutoff_time` y `results_url`) | **Carreras y organización** | `race_distance_id` | Inscripciones |
| Salida prevista | `race_waves.hora_prevista` | Carreras | — | Inscripciones (emails, ficha) |
| Salida oficial | `race_waves.start_time` | **Cronometraje** (la da `/start`) | — | Inscripciones (cierre de cesiones, como hoy hace `hora_salida_recorrido`) |
| Inscripción / dorsal | `registrations` | **Inscripciones** | `inscrito_id` (= `registrations.id`, el mismo valor) + (`race_id`, `bib_number`) | Base de la carrera (`inscritos`) |
| Categoría (definición y asignación) | `race_categories`, `category_templates*` | **Propuesta: Inscripciones** (§10.3) | `race_category_id` + `short_name` | Base de la carrera (catálogo y asignación, en la traída) |
| Persona | `auth.users` + `profiles` (id, email, nombre, DNI, nacimiento, dirección, club) | **Corredores y `profiles`: Inscripciones** (§10.1) | email | En la base de la carrera solo queda la cuenta del personal (id, email, nombre: `operator_user_id`, autores del blog) |
| Organizador | `races.organizer_id` → `auth.users` | Carreras | **`organizer_email`** (con dos Auth, `organizer_id` no significa nada en Inscripciones) | Inscripciones da el permiso de organizador por ese email |
| Roles | `user_roles` + `has_role` | Cada app los suyos | — | — |
| Token de puesto | Hoy **todos** en `gps_tokens`: dorsal, organización, grupetta y también los puntos de cronometraje (`timing_points.token_id`, sin FK; lo usan `generar_token_cronometrador`, `cronometrador_*`, `ultra_registrar_lecturas` y el `config.json` del VPS) | Formato común (`camberasToken.ts`). Propuesta, no estado actual: registro por app | `token` (uuid) | Inscripciones tiene los suyos (`mesas_recogida`, `token_inscripcion`) |
| Sexo | `genders` (3 filas) | Constante en el código de cada app. Viaja el código `M/F/X` | código | — |

**¿Quién crea la carrera y el recorrido?** Los crea **Carreras y organización**, e Inscripciones los trae como **copia mínima**:
- Carrera: `id, slug, name, date, location, organizer_email, is_visible, es_demo, race_type, category_age_reference, logo_url`.
- Recorridos: `id, race_id, name, distance_km, display_order, is_visible, kind, competitive, chip, gps_tracking_enabled`.

Razones:
1. La carrera existe antes de abrir inscripciones y después de cerrarlas (rutómetro, voluntarios, web, cronometraje), y hay carreras sin inscripción en Camberas (`results_url`, uno.es, RockTheSport).
2. El `race_id` ya es la clave de 40 tablas y de `evento_publico(slug)`.
3. La copia es pequeña, cambia poco y deja inscribir aunque la base de la carrera esté caída.

Hacerlo al revés (que Inscripciones cree la carrera) ataría las otras apps a la que, por decisión, se separa.

**Qué pasa a Inscripciones y qué no:**
- Pasan: `races.registration_opens/closes/max_participants/show_available_places`, `race_distances.price/registration_opens/closes/max_participants/bib_start/bib_end/next_bib`, y las tablas `race_distance_prices`, `race_cancellation_tiers`, `race_cesion_config`, `race_team_discount_tiers` y `race_tpv`.
- Se quedan en el recorrido: `cutoff_time` y `results_url`. El tiempo límite lo leen `gps_capture_window` (en la política que admite cada posición GPS), `cronometraje_window`, `evento_publico`, `RaceDetail` y `RaceRegulationManagement`, y se teclea en Recorridos (PR #16).

## 4. Reparto por app

Cómo se resuelven los solapes:
- `bib_chips` → Inscripciones (§10.2).
- Categorías → Inscripciones (§10.3).
- `race_waves` → `hora_prevista` de Carreras y `start_time` de Cronometraje.
- `race_checkpoints` → Cronometraje.
- `wa_bot_config`/`wa_messages` → Cronometraje (publica resultados, no inscribe).
- `gps_tokens` → Seguimiento.
- Portal camberas.com (`admin_notifications`, `push_subscriptions`, `menu_items`, ayuda, blog, newsletter, soporte, contacto) → Carreras.

### Inscripciones (base y código propios)

| Tabla | De qué va |
|---|---|
| `registrations` | La plaza: datos de la inscripción, recorrido, dorsal, categoría asignada, pago, origen, `external_id`, equipo, `token_inscripcion` |
| `profiles` (datos del corredor) | DNI, nacimiento, dirección y club, que rellenan el formulario (`DynamicRegistrationForm`, `Profile.tsx`). Con ella va `trg_link_registrations_on_dni_update` |
| `registration_form_fields` | Formulario por carrera o recorrido. Aquí nacerá la marca «atributo de clasificación» |
| `registration_responses` | Respuestas del inscrito (talla, autobús, seguro…) |
| `race_categories`, `category_templates`, `category_template_items` | Definición y asignación de categorías (§10.3) |
| `payment_intents`, `payment_intent_items` | Cada intento de cobro Redsys y su reparto en lotes de equipo |
| `recuperacion_pagos` | Carrito abandonado: enlace /retomar-pago y avisos |
| `devoluciones` | Devoluciones Redsys |
| `coupons`, `coupon_redemptions` | Cupones y canjes |
| `cesiones_dorsal`, `race_cesion_config` | Cambio de titular sobre la misma fila y su política por carrera |
| `race_cancellation_tiers`, `race_team_discount_tiers` | Tramos de devolución y descuentos de equipo |
| `race_distance_prices` + tabla nueva de política por recorrido | Tramos de precio, apertura, cierre, aforo, rango de dorsales y siguiente dorsal (hoy en `race_distances`) |
| `teams`, `team_members` | Roster del capitán |
| `bib_chips` | Chip ↔ dorsal por carrera (hasta 5 códigos). Se entrega en lista aparte (§5) |
| `bib_designs` | Plantilla del dorsal impreso |
| `mesas_recogida`, `entregas_dorsal` | Puestos de entrega por token y cada dorsal entregado |
| `consultas_inscripcion` | Límite de intentos de «comprueba tu inscripción» |
| `plantillas_email` | Emails al inscrito |
| `eventbooking_sync`, `rockthesport_sync` | Importadores desde uno.es y RockTheSport |
| `race_tpv` | Comercio Redsys del organizador (clave en Vault) |
| copias: `carreras`, `recorridos`, `salidas` (prevista y oficial), `reglamentos`, `dominios`, `enlaces_gps` | Lo que trae de la base de la carrera (§5). No se edita aquí |
| `conexion_traidas` (nueva) | Cada traída: hora, filas, error. De aquí sale «última traída: hace N min» |

### Carreras y organización (núcleo + portal)

| Tabla | De qué va |
|---|---|
| `races`, `race_distances` (con `cutoff_time`, `results_url`), `race_waves.hora_prevista` | El núcleo |
| `race_regulations`, `race_regulation_sections`, `race_faqs` | Reglamento con versión y FAQ |
| `race_document_requirements`, `race_documents` | Checklist documental y ficheros |
| `roadbooks`, `roadbook_items`, `roadbook_item_types`, `roadbook_paces` | Rutómetro |
| `race_web`, `race_domains`, `race_sponsors`, `evento_publico_cache` | Web propia, dominio, patrocinadores, caché |
| `estado_inscripcion` (nueva, copia) | Estado, plazas, precio vigente, tramos y extras públicos traídos de Inscripciones. Lo lee `evento_publico` |
| `race_posts`, `race_post_types`, `volunteers`, `volunteer_assignments` | Puestos y voluntariado |
| `profiles` (solo personal), `user_roles`, `admin_notifications`, `push_subscriptions` | Cuenta del personal, roles, bandeja del admin, push del organizador |
| `menu_items`, `contact_settings`, `help_sections`, `help_faqs`, `organizer_faqs`, `blog_*`, `newsletter_*`, `support_*` | Portal |

### Cronometraje y resultados

| Tabla | De qué va |
|---|---|
| `timing_points` | El aparato que lee. Su token vive hoy en `gps_tokens` |
| `timing_readings` | La lectura bruta: fuente de verdad, se reprocesa desde aquí |
| `race_checkpoints` | Punto de control lógico del recorrido |
| `race_waves.start_time` | Salida oficial, dada en `/start` |
| `split_times`, `race_results`, `race_results_status`, `race_results_abandons` | Parciales, resultados, catálogo de estados, retiradas |
| `inscritos` (nueva, copia) | Lista de salida traída de Inscripciones, con el mismo id que `registrations`. A ella pasan a apuntar las FK de `timing_readings`, `race_results` y `race_results_abandons` (paso 2). **No se renombra ninguna columna**: `registration_id` se queda como está |
| `chips` (nueva, copia) | Dorsal → chips por carrera, incluidos los dorsales sin vender |
| catálogos (nuevos, copia) | Atributos de la carrera, categorías con su orden y rango de dorsales por recorrido |
| `ultra_receptores`, `ultra_destinos`, `ultra_lectores` | Receptor del VPS |
| `cronometraje_recorridos`, `cronometraje_marcas` (PR #11) | Motor automático y cola de recálculo. `clasificar_por` es de Cronometraje |
| `wa_bot_config`, `wa_messages` | Bot de WhatsApp (hoy lee `racetec_*`) |

### Seguimiento GPS

| Tabla | De qué va |
|---|---|
| `gps_tokens` | Tokens de dorsal, organización (M1…, 999), grupetta y, hoy, los de los puntos de cronometraje |
| `gps_positions` | **La fuente** de posiciones |
| `gps_sos_alerts` | Alertas SOS |
| `race_motos`, `gps_devices`, `moto_gps_tracking` | Dispositivos de organización y trackers de hardware |
| `pantallas_seguimiento` | Pantalla de carpa por token |
| grupettas | Filas de `races`/`race_distances`/`race_waves` con `group_type`: Seguimiento crea filas del núcleo |

Las cuatro tablas centrales de Seguimiento no tienen `CREATE TABLE` en el repo.

### Grafismo

| Tabla | De qué va |
|---|---|
| `overlay_config` | Configuración por carrera (75 columnas). Tiene dos FK a `race_motos` |
| `overlay_control` | Canal clave/valor del operador de vMix (lo lee también la app GPS Organización) |
| `racetec_*` | Espejo de RaceTec, **transitorio** hasta que el grafismo lea `clasificacion_publica` |

Grafismo es un **lector** de la base de la carrera (clasificación, GPS de organización, gallos).

### Transversal

`genders` (constante), `app_settings` (solo `mapbox_token`, duplicado de `get-mapbox-token`), `edge_function_flags` (nadie la lee en servidor), `clave_cron_valida`, `ahora_pared()`, `hoy_local()`, `guardia_horas()` y `handle_updated_at()`. Cada base lleva su copia.

### Legado

La limpieza va a una **lista aparte**. Aquí solo lo que condiciona la separación:

- **Orden obligado antes de borrar nada:**
  - `user_has_*` está dentro de las políticas de lectura de `races` y `race_distances`. `DROP FUNCTION` falla, y con CASCADE se lleva la política y nadie ve carreras.
  - Quitar `race_motos.user_id` rompe `user_has_moto_assignment_for_race` en cada lectura de `races` con sesión.
  - `gps_tracking` la lee `get_live_gps_positions` (plpgsql): el `DROP TABLE` no avisa y el mapa público falla después.
  - Primero se rehacen esas políticas y `get_live_gps_positions`; después se borra.
- **Código que hay que tocar antes de borrar:**
  - `moto_positions` (`MotoMapViewer.tsx`).
  - `gps_tracking` (lectores en §1).
  - `training_plans` y `chat_*` (`admin-delete-user`).
- **Rol `timer`:** Postgres no deja borrar un valor de enum. Se borran las filas y el valor se deja.
- **Preguntar a camberas-overlays y camberas-motos:** `moto_race_config` (escritura anónima restaurada en `20260805100000`), `overlay_riders/teams/stages`, `overlays_results` y `finish_photos`.
- **Columnas:** se mueven **tal cual** a la base nueva y se rediseñan después. Eso incluye `status`/`payment_status`, `UNIQUE(user_id, race_id)`, `profiles.gender` en texto y `registrations.chip_code`. Solo se corrigen al mover las horas y los `REVOKE` (CLAUDE.md).
- **CLAUDE.md** dice que las rutas están en `src/App.tsx`, y están en `src/AppCamberas.tsx`.

## 5. La herramienta de conexión de Inscripciones

### Cómo funciona

Igual que `rockthesport-sync` (`20261010120000`): pg_cron llama a una función edge con la cabecera `x-cron-key`, y la clave se guarda en el Vault.

- **Traída hacia la carrera.** Un robot de la base de la carrera pide a Inscripciones **la lista entera** de cada carrera abierta (RPC `lista_salida(race_id)`) y la compara con su `inscritos` por `inscrito_id`. Si existe se actualiza y si no se añade. **Nunca borra.**
- **Traída hacia Inscripciones.** Inscripciones tiene su propio robot, que trae de la carrera la ficha mínima, los recorridos, la salida prevista y la oficial, el reglamento vigente, el dominio y los enlaces GPS por dorsal (RPC `ficha_carrera(race_id)`).
- **Ritmo:** cada hora mientras las inscripciones están abiertas, y cada minuto desde la víspera hasta el cierre de la ventana de lecturas. En una carrera de cientos o pocos miles de inscritos, pedir la lista entera cuesta poco. Así no hay que numerar cambios ni tocar los unos 15 sitios que escriben `registrations` (algunos desde el navegador por RLS).
- **A la vista.** Cronometraje e Inscripciones tienen un botón «Traer ahora» y enseñan «última traída: 10:42, hace 7 min», con aviso si pasa del doble del ritmo. El robot `recuperar-pagos` estuvo semanas sin programarse sin que nadie lo viera (`20260923210000`, línea 4); esto lo hace visible.
- **Clave.** Hay una sola clave por pareja de apps, en el Vault, como `rockthesport_cron_key` y `clave_cron_valida`. Nunca va en una tabla que lea el formulario público.
- **Las RPC del contrato:**
  - Son `SECURITY DEFINER SET search_path = public`, validan la clave dentro y llevan `GRANT` explícito y cierre completo (`anon, authenticated, PUBLIC`).
  - Corren como `anon`, con 3 s de límite: devuelven **un solo jsonb**, no un conjunto de filas, para no chocar con el corte de 1.000 filas. Si una carrera es grande, paginan dentro (`p_pagina`).

### Qué entrega: el inscrito

**Se entrega toda inscripción con dorsal, o pagada, o gratuita, y también las anuladas. Nunca una pendiente sin dorsal.** Así se respeta lo que hoy cronometra:
- `cronometrador_startlist` toma `bib_number IS NOT NULL`.
- `ultra_registrar_lecturas` toma toda la que no está cancelada.
- El alta manual nace pendiente (`RegistrationManagement.tsx:120-121`) y el cobro en la mesa también.

| Campo | Origen hoy | Nulo | Nota |
|---|---|---|---|
| `inscrito_id` | `registrations.id` | no | El mismo valor. No cambia con dorsal, recorrido ni cesión |
| `race_id`, `race_distance_id` | `registrations` | no | |
| `bib_number` | `bib_number` | sí | Inscripciones garantiza dorsal único por carrera entre no anuladas |
| `nombre`, `apellidos` | `first_name`, `last_name` | no | Datos de la inscripción, no de la cuenta |
| `sexo` | `gender_id` → `M/F/X` | sí | `OrgAddGuest.tsx:89-102` inscribe sin sexo, sin nacimiento y sin categoría. Cronometraje avisa |
| `fecha_nacimiento` | `birth_date` | sí | |
| `categoria_id`, `categoria_corta` | `race_category_id` | sí | `get_race_category` devuelve NULL si no encaja ninguna (`20260928200000`) |
| `club`, `equipo_texto`, `equipo_id`, `equipo_nombre` | `club`, `team`, `team_id` | sí | Clasificación por equipos |
| `pais`, `provincia`, `municipio`, `comunidad` | `country`, `province`, `city`, `autonomous_community` | sí | |
| `atributos[]` | nuevo: marca en `registration_form_fields` + `registration_responses` | sí | De 1 a 3 por carrera (decisión 8 del libro de cronometraje, §10) |
| `participante_2` {nombre, apellidos, sexo, fecha_nacimiento} | nuevo | sí | Parejas: un dorsal, dos nombres (misma decisión 8) |
| `documento`, `licencia` | `registrations` / respuestas | sí | Solo para exportaciones ITRA y federación (decisión 9). Se guardan aparte con acceso restringido |
| `dorsal_recogido` | `entregas_dorsal` | sí | Para que el motor proponga DNS (decisión 7) |
| `estado` | derivado | no | `confirmada` o `anulada`. La cesión no es un estado: la plaza sigue confirmada con otra identidad |
| `pagada` | `payment_status` | no | sí/no |
| `origen`, `external_id` | `source`, `external_id` | sí | |

No viajan a la carrera ni el email ni el teléfono. El email de activación GPS lo manda Inscripciones con el enlace que trae (ver abajo).

**En la misma respuesta**, además de los inscritos:
- `chips[]`: **lista aparte por dorsal**, de todos los dorsales con chip de la carrera, vendidos o no. El Ultra resuelve chip → dorsal por carrera (`bc.race_id`), y el que se inscribe el mismo día o corre «NO REGISTRADO» no puede perder sus lecturas.
- Catálogos: atributos de la carrera (código, nombre, orden), categorías con su orden y rango de dorsales por recorrido. El rango sirve para el aviso de rangos solapados (libro §9, fila 2) y para saber de qué recorrido es un «NO REGISTRADO».
- Estado público por recorrido: abierta/cerrada, plazas libres, precio vigente, tramos y extras. Se guarda en `estado_inscripcion` de la base de la carrera y de ahí lo lee `evento_publico`. Una función SQL no puede llamar a otro proyecto de forma síncrona: `pg_net` es asíncrono y `anon` tiene 3 s, que `evento_publico` ya rozaba (`20260928180000`).

Lo del organizador (últimas inscripciones con nombre, recaudación, tallas) **no viaja**: lo usan pantallas que se van a Inscripciones (`src/components/organizer/dashboard/*`, `OrgStats`).

### Reglas del receptor (base de la carrera)

1. **Que algo no venga en la lista no lo anula.** Solo anula un `anulada` explícito. Si no, una lista vacía por un fallo anularía la carrera entera el día de la prueba.
2. **Una anulada sale de la clasificación pero conserva sus lecturas**, y se puede volver atrás.
3. **Cualquier cambio de dorsal, recorrido o estado marca recálculo** del recorrido viejo y del nuevo. Las lecturas guardan `registration_id` al entrar (`lecturas_ultra.sql:135`). Esto sustituye al trigger `cronometraje_marcar_recorrido` del PR #11 sobre `registrations`.
4. **`(race_id, bib_number)` no es único en la copia de forma inmediata.** Un intercambio de dorsales se aplica fila a fila: se avisa, no se rechaza. El candado vive en Inscripciones.
5. **La traída solo toca filas con `origen = 'inscripciones'`.** Si el cronometrador carga a mano un CSV de respaldo, esas filas no se pisan.

### Reglas en Inscripciones

- **Se prohíbe borrar una inscripción que alguna vez se entregó.** Hoy `RegistrationManagement.tsx:514` y `:1778` hacen `.delete()` en bloque y suelto, y `race_results` cuelga con `ON DELETE CASCADE`: borrar una inscripción borra su resultado. Esos botones pasan a ser «Anular» (RPC `anular_inscripcion`).
- **Anulan también** `devolucion_resolver` (`20260925213000:128`), `rockthesport-sync` y los cambios masivos del panel. Con la lista entera no hace falta tocarlos uno a uno: basta con que dejen la fila en `anulada`.
- **La identidad la manda quien da el alta.** El trigger que hoy copia de `profiles` y `auth.users` (`rellenar_identidad_inscripcion`) se queda dentro de Inscripciones con `profiles`.

### Qué recibe Inscripciones

- **Resultados y parciales: no se copian.** Son públicos: `/mi-dorsal` y `/mi-inscripcion` llaman desde el navegador a `clasificacion_publica` de la base de la carrera. El email «tu resultado» hace una sola consulta al congelar. Se enseña el provisional en vivo con la marca «provisional» y el oficial al congelar.
- **Salidas:** prevista y oficial, con fecha (regla 5 de §8). La cesión y la anulación se cierran **a la salida oficial, como hoy** (`hora_salida_recorrido`, que lee `start_time`), o a la prevista si aún no hay oficial, o a las 00:00 del día de la carrera si no hay ninguna. Con eso sobra `ha_corrido`, y las tres `cesion_*` dejan de mirar `timing_readings` y `race_results`.
- **Enlaces GPS por dorsal:** los crea Seguimiento en la base de la carrera a partir de su copia `inscritos` (§6). Inscripciones los trae y los manda o enseña en `/mi-dorsal` cuando llegan. Hoy los mete `reenviar-comprobantes` leyendo `gps_tokens`.

### Cambio de recorrido con la carrera empezada

El caso real es el cronometrador en meta viendo «dorsal del largo leído solo en el corto» (libro §4 y §9, fila 7). El libro §3.4 pone «cambiar de recorrido» en la vista «no integrados» de Cronometraje. Propuesta, pendiente de §10.4:
1. El botón está en Cronometraje y llama a la RPC `cambiar_recorrido` **de Inscripciones** con la clave de conexión. El dueño del dato sigue siendo Inscripciones (decisión 6).
2. Después hace «Traer ahora» de ese inscrito, que trae de una vez recorrido, categoría nueva y dorsal.
3. Si Inscripciones no responde, lo dice y no cambia nada.

### Lo que no cabe en la traída

| Caso | Cómo queda |
|---|---|
| Recorrido creado (hoy `trigger_auto_seed_registration_fields`) | Inscripciones ve el recorrido nuevo en su traída y siembra su formulario |
| Carrera duplicada (hoy `duplicar_carrera` copia la política de inscripción) | La ficha lleva `copiada_de` (campo nuevo) e Inscripciones copia su política de esa carrera |
| ¿Se puede borrar esta carrera o recorrido? (hoy `races_borrado_protegido`) | Carreras mira su copia local `inscritos`, sin preguntar a nadie |
| Pago confirmado → push al organizador (`redsys-webhook` → `send-push`) | Hueco. Hoy se autentica con el `service_role` del mismo proyecto: `send-push` tendrá que aceptar la clave de conexión (§11) |

## 6. Cómo se relacionan las cinco

Carreras, Cronometraje y Seguimiento comparten base (§7). Dentro de ella, «unidas» significa JOIN, RPC o vista, sin copias. El dibujo queda en dos cajas:

```
  ┌───────────────────────────┐   lista entera: inscritos, chips,      ┌──────────────────────────────────┐
  │  INSCRIPCIONES            │   catálogos, estado público  ────────▶ │  BASE DE LA CARRERA              │
  │  (base y código propios)  │                                        │  Carreras + Cronometraje +       │
  │  plaza, pago, dorsal,     │ ◀────────  ficha, recorridos, salidas, │  Seguimiento                     │
  │  chips, categorías        │            reglamento, enlaces GPS     │  (inscritos = copia)             │
  │                           │ ◀────────  clasificacion_publica       │                                  │
  │                           │            (desde el navegador)        │                                  │
  │                           │ ◀────────  cambiar_recorrido (RPC,     │                                  │
  │                           │            desde Cronometraje)         │                                  │
  └───────────────────────────┘                                        └──────┬────────────────┬──────────┘
                                                                              │ lee            ▲ escribe
                                                                              ▼                │
                                                         ┌──────────────────────────┐   ┌──────┴────────────┐
                                                         │ GRAFISMO (camberas-      │   │ RECEPTOR ULTRA    │
                                                         │ overlays, OBS): lector   │   │ (VPS)             │
                                                         └──────────────────────────┘   └───────────────────┘
```

| De → a | Dato | Vía | Cuándo | Si falla |
|---|---|---|---|---|
| Inscripciones → carrera | inscritos, chips, catálogos, estado público | traída de `lista_salida` | cada hora; cada minuto desde la víspera; «Traer ahora» | se sigue con la última copia y se ve «última traída hace N min» |
| Carrera → Inscripciones | ficha, recorridos, salidas, reglamento, dominio, enlaces GPS | traída de `ficha_carrera` | mismo ritmo | se sigue con la última copia |
| Carrera → Inscripciones | clasificación y parciales | `clasificacion_publica` (anon), desde el navegador | al abrir `/mi-dorsal`; email al congelar | la página dice que no hay resultados aún |
| Cronometraje → Inscripciones | cambio de recorrido | RPC `cambiar_recorrido` | el día de carrera | no se cambia nada y se avisa |
| Dentro de la base de la carrera | salida oficial → ventana GPS; inscritos → tokens GPS; puntos de control → `evento_publico` | JOIN y RPC (`hora_salida_recorrido`, `gps_capture_window`, `get_live_gps_positions`) | en directo | — |
| Carrera → Grafismo, web, bot | clasificación en vivo y por split; GPS de organización y gallos | `clasificacion_publica`, `get_live_gps_positions`, `tokens_motos_publico`; realtime por canal en vez de por tabla | en directo | se repinta con el último dato |
| Receptor Ultra → carrera | lecturas | RPC `ultra_registrar_lecturas` con token | cada 2 s | disco del VPS y reintento (ya existe) |

**Inscripciones caída el día de carrera.** El cronometraje sigue con la última copia, pero no hay inscripción en mesa ni recogida (`mesas_recogida` es de Inscripciones). Plan B escrito:
- La víspera se saca PDF o CSV de recogida y de lista de salida.
- Los chips se cargan antes de la primera lectura (libro §5.1, paso 3), porque si Inscripciones cae, no llegan.

## 7. La estructura propuesta para las otras cuatro

**(A) Un solo Postgres con un esquema por app más `nucleo`.** Sobre el papel da JOIN, una sola Auth y una sola copia. En la práctica:
- **No es accesible hoy.** Los esquemas expuestos se ajustan en el panel de Supabase, y Lovable Cloud no da panel, ni contraseña de Postgres, ni `service_role` a la vista (`docs/copias-de-seguridad.md` §1).
- **`ALTER TABLE … SET SCHEMA` no mueve datos, pero rompe todo lo que nombra la tabla:**
  - las RPC con `SET search_path = public`;
  - `.from()`, que usa `public` por defecto;
  - las apps ya instaladas que insertan en `gps_positions` por REST, cuyas versiones viejas no se actualizan solas;
  - `receptor.py` y `public/monitor-gps.html`;
  - las suscripciones realtime que filtran `schema: 'public'`.
- **Un esquema nuevo pide trabajo de permisos:** necesita `GRANT USAGE` y no hereda el `ALTER DEFAULT PRIVILEGES` de `public`.
- **`types.ts`** sale como un solo fichero con una clave por esquema, y no está comprobado que Lovable lo genere así.
- **Veredicto: no, de momento.** Solo sería barato para tablas nuevas.

**(B) Un proyecto Supabase por app**, relacionadas por identificadores y RPC, sin FK entre ellas. Da separación real, pero cada base tiene su propia Auth:
- La autenticación de terceros de Supabase está documentada para proveedores concretos (Clerk, Firebase, Auth0, Cognito, WorkOS), no para otro proyecto Supabase.
- Aunque funcionara, en la otra base `auth.uid()` no existiría en su `auth.users` (fallarían `get_current_user_email()`, `has_role` y las políticas «por email").
- Las contraseñas no son portables (`copias-de-seguridad.md` §5).

Por eso (B) solo se aplica donde la decisión lo manda, y la identidad se resuelve en §10.1.

**Recomendación.**
1. **Inscripciones: proyecto Supabase y repo propios** (decisión tomada). Es también la que más conviene separar: dinero, datos personales y pico de carga en las aperturas (Gurriana, 1-oct).
2. **Carreras, Cronometraje y Seguimiento comparten la base actual**, con la disciplina de RPC de §8. La ventana GPS, la salida oficial, los controles sobre el rutómetro y la web de la carrera están entrelazados y cambian en segundos el día de carrera.
3. **Grafismo no necesita base**: es un lector con repo propio (`camberas-overlays`). `overlay_config` y `overlay_control` se quedan en la base compartida.
4. **No se propone ahora base propia para Seguimiento.** Lo atan:
   - la ventana de captura (salida oficial) y las grupettas (filas del núcleo);
   - los tokens de puesto de Cronometraje en `gps_tokens`;
   - las FK `moto_gps_tracking.next_checkpoint_id → race_checkpoints`, `overlay_config → race_motos` (dos) y `race_motos` → `races`, `race_distances`, `profiles`;
   - la suscripción de `LiveGPSMap` a `timing_readings`;
   - que sus tablas centrales no tienen `CREATE TABLE` en el repo.

Orden: Inscripciones (contrato → copia en la base de la carrera → código → base) → Grafismo y bot sobre `clasificacion_publica` → limpieza. Esto contradice el párrafo «El orden» de `docs/camberas-app.md` (§2).

## 8. Reglas para que sigan unidas

1. **La identidad es el puesto, no la persona.** Dorsal, dispositivo, punto, mesa y pantalla llevan un token en la URL, validado dentro de la RPC. Entre Inscripciones y la base de la carrera hay una clave por pareja de apps, en el Vault. El formato del token es único (`camberasToken.ts`, copiado a propósito).
2. **Cada app expone funciones, no tablas.** Nada de `.from()`, embebidos ni realtime sobre tablas de otra app. Hoy lo incumplen:
   - `LiveResults`, `ResultsManagement`, `OrgResults`, `SplitTimesDisplay`, `SplitClassification` y `RaceResults` (embebido de `registrations`);
   - `OrganizerApp` (realtime de `registrations`);
   - `GpsTokensManagement`, `GPSTrackingViewer`, `GPSPositionsDeletion`, `motoLiveSource` y los paneles de vMix;
   - los embebidos de `races` y `race_distances` desde pantallas y funciones de inscripción (§1).
3. **Nadie escribe en tablas de otra app**, ni por RPC, ni por trigger, ni por política. Hay que deshacer:
   - `cesion_ejecutar` → `gps_tokens`;
   - `assign_next_bib` y `duplicar_carrera` → `race_distances` y tablas de inscripción;
   - `trigger_auto_seed_registration_fields`;
   - `admin-delete-user` → `registrations`;
   - `cronometraje_marcar_recorrido` sobre `registrations`.
4. **Identificadores estables:** `race_id`, `race_distance_id`, `inscrito_id` (= `registrations.id`), `race_category_id` y `token`. El dorsal puede cambiar; el `inscrito_id` no. El dorsal es único por carrera entre no anuladas, con candado en Inscripciones.
5. **Horas de pared con fecha.** Toda hora de carrera viaja como `AAAA-MM-DD HH:MM:SS[.mmm]` sin zona:
   - Nunca se manda el `timestamptz` tal cual: `to_jsonb` añade «+00:00» y el navegador lo convierte.
   - Solo el GPS y «ahora» son instantes. Las duraciones pueden pasar de 24 h.
   - `guardia_horas()` sin `FALLO` en cada base.
6. **Cómo viaja un dato:** el dueño lo escribe en su tabla, y el otro lo trae entero y lo compara por clave. Si existe se actualiza y si no se añade; lo que no viene no se toca.
7. **Si la otra está caída,** la operación local nunca se bloquea y se sigue con la última copia. La copia dice cuándo se trajo, y lo que necesita respuesta inmediata tiene un valor por defecto declarado: la cesión se cierra a la salida; las plazas se muestran desde la copia.
8. **Las copias dicen quién es su dueño** (`origen`, `traido_en`) y no se editan en el receptor. Lo que haya que cambiar se pide por RPC al dueño (`cambiar_recorrido`).
9. **Lo público, por una RPC `anon` con solo lo publicable** (`clasificacion_publica`, `evento_publico`), nunca abriendo tablas.
10. **Toda RPC nueva con `GRANT` explícito y cierre completo** (CLAUDE.md), comprobada con `has_function_privilege`.

## 9. Camino desde hoy

Pasos ordenados, sin parar la web:

1. **Contrato sobre la base actual.**
   - Se crean `clasificacion_publica` (cierra la clasificación vacía sin sesión), `lista_salida(race_id)` (un jsonb) y `anular_inscripcion`.
   - Los botones de borrar inscripciones pasan a «Anular».
   - Las tres `cesion_*` se cierran a la salida, sin mirar lecturas.
   - `LiveResults` y el bot pasan a `clasificacion_publica`.
   - No son solo funciones nuevas: hay cambios de esquema.
     - Candado de dorsal: primero una consulta de duplicados; después `CREATE UNIQUE INDEX CONCURRENTLY … WHERE status <> 'cancelled' AND bib_number IS NOT NULL`, fuera de transacción y fuera de las aperturas de inscripción.
     - Columnas para atributos de clasificación y parejas.
2. **Cronometraje lee la copia.**
   - Se crean `inscritos`, `chips` y los catálogos en la base actual, rellenados **por el robot de traída real** contra la misma base. Cuando Inscripciones se vaya, solo cambia la URL, y la herramienta se prueba meses antes del corte.
   - Las FK de `timing_readings`, `race_results` y `race_results_abandons` pasan a apuntar a `inscritos` (mismo uuid).
   - Leen la copia:
     - `ultra_registrar_lecturas`, `cronometrador_startlist`, `cronometrador_fichar`, `cronometrador_editar_lectura` y `cronometrador_retirada`;
     - `calculate_race_results` y `process_event_results` (o el motor del PR #11);
     - `ResultsManagement`, `SplitTimesManagement`, `TimingReadingsManagement`, `TimingApp` en modo sesión y `GPSReadingsManagement`;
     - los embebidos de §1 y las políticas de `race_results` y `split_times`.
   - `BibChipsManagement` deja de escribir `registrations.chip_code`.
   - Reversible: se apaga el robot y los lectores vuelven a `registrations`.
3. **Seguimiento y Carreras leen la copia.**
   - Seguimiento crea, renombra y desactiva los tokens de dorsal a partir de `inscritos`. Las RPC actuales son `generar_token_corredor`, `revocar_token_corredor` y `tokens_corredores_carrera`, que hoy llama `RegistrationManagement.tsx:244` comprobando el `auth.uid()` del organizador.
   - `get_live_gps_positions` toma el nombre de la copia por dorsal y `cesion_ejecutar` deja de escribir en `gps_tokens`.
   - Pasan a la copia: `GpsTokensManagement`, `GPSTrackingViewer`, `GPSPositionsDeletion`, `OrganizerApp`, los recuentos de `Index`, `Races` y `RaceManagement`, `UsersManagement`, `races_borrado_protegido` y `evento_publico` (vía `estado_inscripcion`).
   - Se rehacen las políticas de `races`, `race_distances` y `profiles` que leen `registrations` (§1).
   - Sin este paso, el 5 rompe la web pública.
4. **Código aparte: solo pantallas.**
   - Un repo y proyecto Lovable nuevo, «Camberas Inscripciones», con `RaceDetail` de inscripción, `Dashboard`, `RetomarPago`, `CederDorsal`, `MiDorsal`, `RecogidaDorsales`, `RegistrationManagement` y afines, `OrgRegistrations`, `OrgAddGuest`, `OrgStats`, `DistanceManagement` (la parte de precio y dorsales) y `widget.js`.
   - Las Edge Functions se quedan en este repo: un proyecto nuevo de Lovable Cloud trae su propio backend y sus funciones no verían `registrations`.
   - **Antes hay que comprobar** que el cliente del proyecto nuevo puede apuntar a la base actual (§11). Si no se puede, este paso se junta con el 5.
5. **Base aparte.** Bloqueos que hay que resolver antes (§11):
   - **Datos:** no hay `pg_dump` ni `psql`. Se copian con una RPC con clave, de un solo uso, que devuelve jsonb por tabla. El esquema sale de la definición de producción, no de `supabase/migrations/`.
   - **Secretos:** van cifrados por proyecto. Hay que volver a teclear cada clave de TPV (pidiéndosela a cada organizador **antes** del corte), el token de RockTheSport y los secretos de Redsys, Resend y push. Los trabajos de pg_cron y las claves del robot también se crean de nuevo.
   - **Cuentas:** `auth.users` con contraseñas probablemente no se puede mover. Los corredores entran por enlace al email.
   - **Un solo escritor:** se congela la base vieja con un trigger que rechace altas, se copia y se conmuta. Dos bases aceptando altas darían inscritos duplicados y dos `next_bib`.
   - **Pagos abiertos:** la URL de aviso de Redsys es la del proyecto que inició el pago (`redsys-init-payment:204`, `team-init-payment:248`). La base vieja sigue viva hasta que no quede ningún pago pendiente.
   - **Enlaces ya enviados:** correos y QR impresos apuntan a `camberas.com` (`/mi-dorsal/<token>`, `/retomar-pago`, cesión, recogida). Hacen falta redirecciones, no basta un subdominio.
   - La política de inscripción nace aquí. Sus escritores (`DistanceManagement`, `RaceWizard`, `duplicar_carrera`, `assign_next_bib`, que conserva su `UPDATE … RETURNING` atómico) pasan a la tabla nueva. Las columnas viejas de `race_distances` se quedan sin lectores y se borran después.
   - Las Edge Functions de pago, email, cesión e importadores se mudan con la base.
   - Antes de quitar las lecturas de `profiles` como respaldo (`LiveResults`, `ResultsManagement`, `RaceResults`, `SplitClassification`), se comprueba que no queda ninguna inscripción con `user_id` y sin nombre.
6. **Grafismo y bot sobre Camberas.** `camberas-overlays` y `whatsapp-webhook` leen `clasificacion_publica`; se retiran `racetec_*` y su importador, y se decide `name_tv`.
7. **Limpieza** según la lista aparte y el orden de §4. Después se regenera `types.ts` y se corrige CLAUDE.md.
8. **El receptor** ya vive aparte: solo hay que documentar su contrato (`ultra_registrar_lecturas`, `ultra_receptor_sincronizar`) como modelo.

Qué **no** hacer:
- No separar la base antes que el contrato y las copias: se romperían unas 30 FK y los lectores de cinco áreas a la vez.
- No reescribir el motor y la separación en el mismo paso: el PR #11 va antes, y su trigger sobre `registrations` se sustituye en el paso 2.
- No copiar funciones de producción «tal cual» a la base nueva: arrastran las horas malas y los `REVOKE` incompletos.
- No borrar `racetec_*`, `gps_tracking` ni `user_has_*` sin el orden de §4.
- No crear varios logins antes de decidir §10.1.
- No montar tablas de pendientes de enviar ni un bus de mensajes externo: la traída de la lista entera con pg_cron ya es lo que usa el repo.
- No dejar dos bases escribiendo a la vez.

## 10. Decisiones para el dueño

Las que bloquean:

1. **Identidad.** Recomendación:
   - Los corredores y `profiles` van con Inscripciones.
   - El organizador usa el mismo email en las dos apps, con enlace al email, y su permiso en Inscripciones se da por `organizer_email`.
   - Cada app guarda sus roles.

   Que una app se fíe del inicio de sesión de otra no está documentado entre proyectos Supabase, y las contraseñas no se pueden mover.
2. **Chips.** Confirmar que Inscripciones carga los chips y los entrega (la pantalla «Chips RFID» pasa a Inscripciones), y que se cargan antes de la víspera.
3. **Categorías.** Propuesta: definición y asignación en Inscripciones, que entrega catálogo y asignación. Si las definiera Carreras, un arreglo de categorías el día de carrera daría dos vueltas de robot.
4. **Cambios con la carrera empezada.**
   - La bajada de recorrido, desde Cronometraje vía RPC de Inscripciones (§5). ¿«Desde Inscripciones» (decisión 6) incluye la bajada sin pago del día de carrera?
   - La cesión y la anulación, cerradas desde la salida.
5. **Página de inscripción, dominio del club y Redsys.** ¿La sirve Inscripciones en su dominio y la web de la carrera la enlaza, o sigue incrustada (widget) bajo `www.desafio-sarrio.com` con el TPV del organizador? Afecta al retorno de Redsys y a las redirecciones del paso 5. Va unido: ¿la PWA `/org` se parte (inscripciones a Inscripciones, `OrgResults` a la carrera)? Una PWA nueva en este repo obliga a tocar `manifest-selector.js` y `vite.config.ts`.

Las demás tienen respuesta por defecto:
- **Resultado al inscrito:** se enseña el provisional con la marca.
- **Qué se entrega:** toda inscripción con dorsal, o pagada, o gratuita, incluidas las anuladas.
- **Exportaciones ITRA y federación:** en Cronometraje, con `documento` y `licencia` restringidos.
- **Ciclismo, `moto_race_config` y RaceTec:** a la lista de limpieza, preguntando antes a camberas-overlays y camberas-motos.
- **Quitar `race_waves` (decisión 5), entidad `organizers` y esquemas por app:** fuera de este documento.

## 11. Dudas y lo no comprobado

**Correcciones de los revisores que no se han aplicado, y por qué:**
- **La tabla de pendientes de enviar y la versión por inscrito** (DBA D2, D5, D6, C6 y D11). Los mensajes generados por trigger, la guarda por `version`, el token por carrera y app y los dos nombres del mismo mensaje no se aplican: la traída de la lista entera (arquitecto) los hace innecesarios y evita el fallo de versiones confirmadas en desorden. Sí se mantiene de D5 que `(race_id, bib_number)` no puede ser único al instante en la copia.
- **Email y teléfono en una tabla de Seguimiento** (arquitecto §2.14). No se aplica: sigo a DBA D8. El email de activación ya lo manda Inscripciones, y no he encontrado ningún lector del teléfono en Seguimiento (`GpsTokensManagement`, migraciones de GPS y SOS).
- **Cerrar la cesión a la salida prevista** (arquitecto §1.4). No se aplica tal cual. CLAUDE.md dice que las cesiones van con la salida oficial y `hora_salida_recorrido` lee `start_time`, así que se mantiene la oficial, con la prevista como respaldo.
- **Sacar entero «Legado» del documento** (arquitecto §1.7). Se deja reducido: el orden de borrado condiciona los pasos 3 y 7, porque `user_has_*` está dentro de las políticas de `races`.

**Choques con otros documentos:**
- La decisión 6 del libro de cronometraje dice «desde Inscripciones», y la propuesta pone el botón en Cronometraje llamando a Inscripciones. Hay que confirmarlo (§10.4).
- CLAUDE.md dice que las migraciones «se aplican a mano desde el panel de Supabase», y `docs/copias-de-seguridad.md` dice que no hay acceso al panel de supabase.com. El dueño sí las aplica a mano (las del receptor Ultra, el 15-oct), así que hay un editor SQL a su alcance; hay que dejar escrito cuál es en los dos documentos.
- El párrafo «El orden» de `docs/camberas-app.md` contradice el orden de este documento. No lo he tocado.

**Sin verificar, y bloquean pasos:**
- Si el cliente de un proyecto Lovable nuevo puede apuntar a la base actual, o si hace falta la `service_role` de la vieja como secreto (bloquea el paso 4).
- Si `CREATE INDEX CONCURRENTLY` se puede lanzar por las migraciones de Lovable, que pueden ir dentro de una transacción (paso 1).
- Si dos proyectos Supabase pueden fiarse del inicio de sesión del otro; si Lovable Cloud deja exponer esquemas, tocar la publicación realtime y gestionar el Vault de un segundo proyecto.
- Cómo se copian los datos y se recrean los secretos y los trabajos de pg_cron en el paso 5.

**Huecos del diseño:**
- El push al organizador desde Inscripciones: `send-push` exige el `service_role` de su propio proyecto.
- Los tokens GPS van por (`event_id` = recorrido, dorsal): con un cambio de recorrido el token se queda en el viejo.
- El campo `copiada_de` de la ficha es nuevo.

**No comprobado en producción:**
- El repo no reconstruye la base: 24 tablas sin `CREATE TABLE`, funciones parcheadas sobre la definición de producción y un trigger que nunca se aplicó. Toda política citada hay que confirmarla en `pg_policies`; las políticas vivas no se pueden contar desde el repo.
- Filas con roles `timer`, `moto`, `comisario` o `editor`.
- Si entra algo en `gps_tracking` desde jul-2026.
- Qué claves tiene `app_settings` y su RLS.
- Si el WABA del bot está en uso.
- Si hay campañas en `newsletter_*`.
- `finish_photos`, `blog_tags`/`blog_post_tags` y `admin_notifications.new_registration`: nadie los escribe desde el código.

**Repos hermanos:** `camberas-overlays`, `camberas-track` y `camberas-motos` no están en este checkout. Lo que leen y escriben (`overlay_control`, `racetec_*`, `moto_race_config`, `gps_positions` por realtime y REST, `name_tv`) sale de comentarios de migraciones y de `docs/gps-organizacion.md`.

**Propuestas sin datos todavía:**
- El PR #11 (`cronometraje_recorridos`, `cronometraje_marcas`, `tiempo_chip`, `clasificar_por`) no está aplicado: lo dicho de él es propuesta.
- Parejas, atributos de clasificación, `documento`/`licencia` y `dorsal_recogido` en la lista de salida son nuevos. Hay que validarlos con el dueño antes de recoger datos.

**Recuento:** son 111 tablas en el inventario, 114 en `main` con las `ultra_*` y 116 con el PR #11. Las funciones distintas en migraciones son 184, muchas sustituidas por versiones posteriores.
