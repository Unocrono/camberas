# Mapeo `evento.schema.json` ↔ tablas reales de Camberas

Fuente: `src/integrations/supabase/types.ts` (generado), migraciones y `RaceDetail.tsx` del repo `camberas` (24 sept 2026). La web pública ya lee `races`, `race_distances`, `race_waves`, `race_distance_prices` y `race_faqs` con la clave anónima (RLS de lectura para carreras visibles).

## 1. Lo que ya existe en Camberas (se lee tal cual)

| Esquema | Tabla · columna | Notas |
|---|---|---|
| `slug`, `nombre`, `subtitulo`, `descripcion` | `races.slug`, `name`, `subtitle`, `description` | `additional_info` es texto libre (hoy "Información adicional" con viñetas) |
| `fecha` | `races.date` (+ `utc_offset`) | |
| `lugar.nombre/municipio` | `races.location` | Un solo campo de texto; no hay municipio/provincia separados |
| `organizador` | `races.organizer_id` (usuario) + `organizer_email` | No hay tabla de organizadores/tenants con nombre, web, logo |
| `estado` | derivado de `registration_opens/closes`, `is_visible`, `date` | No hay columna de estado; "agotada" se deduce de `max_participants` vs inscritos |
| `inscripcion.apertura/cierre` | `races.registration_opens/closes` y por recorrido `race_distances.registration_opens/closes` | |
| `inscripcion.limiteDorsales` | `races.max_participants` | |
| `pruebas[]` | `race_distances` | `name`, `distance_km`, `elevation_gain`, `cutoff_time` (= `limite`), `start_location`, `finish_location`, `max_participants` (= `plazas`), `gpx_file_url` (= `track.gpx`), `image_url`, `display_order`, `is_visible`, rango de dorsales |
| `pruebas[].salida` | `race_waves.start_time` (por `race_distance_id`) + RPC `hora_salida_recorrido` | Varias oleadas por recorrido posibles |
| `pruebas[].tipo` (carrera/marcha/infantil) | **no existe** | Hoy se distingue por el nombre ("MARCHA", "MARTXA") |
| `pruebas[].competitiva`, `chip` | **no existe** | |
| `pruebas[].desnivelNeg`, `altMax/altMin`, `terreno`, `marcaje`, `color` | **no existe** | El perfil se puede calcular del GPX |
| `pruebas[].avituallamientos[]` / cortes | `race_checkpoints` (`distance_km`, `name`, `lugar`, `checkpoint_type` START/FINISH/STANDARD, `max_time`) y `roadbook_items` (`item_type` aid_station/poi/checkpoint) | El rutómetro ya es el avituallamiento "rico" |
| `tarifas[].periodos[]` | `race_distances.price` (base) + `race_distance_prices` (`start_datetime`, `end_datetime`, `price`) | Una tarifa por recorrido; `redsys-init-payment` resuelve el tramo vigente en servidor |
| `tarifas[].condicion.federado/residente/edad` | **no existe como tarifa**; se hace con **campos con importe** (`registration_form_fields.field_options.fee_enabled`, `fees[]`, `fee_amount`, negativos = descuento) | Gurriana federado −4 € = opción con fee −4 |
| `extras[]` (talla, camiseta +7 €, autobús) | `registration_form_fields` con `field_options.fee_enabled` (ver `src/lib/fieldFees.ts`) | `tshirt_size` también es columna de `registrations` |
| `extras[].limite` (camiseta a los 400 primeros) | **no existe** | |
| `campos[]` | `registration_form_fields` (`field_name`, `field_label`, `field_type`, `field_options`, `is_required`, `depends_on_field_id/value`, `profile_field`, por carrera o por recorrido) | Condicionales ya soportados (`20260923120000_campos_condicionales.sql`) |
| `menores.tutor` | campos condicionales por edad (a configurar) | No hay flag explícito |
| `modalidades ∋ equipo`, `equipo.tamano` | `teams`, `team_members`, `race_team_discount_tiers` (`min_members`, descuento), `team-register`, `team-init-payment` | Equipo = descuento por nº de miembros, no "grupo de 10 a precio cerrado" |
| `modalidades ∋ solidario` (dorsal solidario 13/50/100) | **no existe** | Se puede simular como recorrido "Dorsal solidario" + campo number con `fee_amount` |
| `descuentos[] cupon` | `coupons` (`code`, `discount_type` percent/fixed, `applies_to` base/total, `valid_from/until`, `max_uses`), `coupon_redemptions`, función `validate-coupon` | |
| `descuentos[] online/residente` | campo con fee negativo | |
| `devolucion` | `race_cancellation_tiers` (`days_before`, `refund_percent`) y `race_cesion_config` (cesión de dorsal con tasa) | Más completo que el esquema |
| `reglamento` | `race_regulations` (`published`, `version`) + `race_regulation_sections` (`title`, `content`, `section_type`) | Reglamento estructurado por secciones |
| `infoPractica.faq[]` | `race_faqs` | |
| `dorsales` (recogida) | `mesas_recogida`, `entregas_dorsal` (operativa), sin texto público de horarios | Falta el "dónde y cuándo" para la web |
| `clasificaciones` | `race_results`, `race_leaderboard`, `/:slug/live` | |
| `imagenes` | `races.logo_url`, `poster_url`, `cover_image_url`, `image_url` | |
| `fotos` | `finish_photos` (fotos de meta por dorsal) | No hay enlace a galería externa |
| `contacto` | `races.organizer_email`, función `contact-organizer`, `contact_settings` (global) | |
| `deporte` | `races.race_type` **solo admite `trail`, `mtb`, `both`** (CHECK) | Popular, ruta y marcha no caben hoy |
| `pasarela` | Redsys por **secretos globales** (`REDSYS_MERCHANT_CODE/TERMINAL/SECRET_KEY` en `redsys-init-payment`) | Un único TPV para toda la plataforma |
| Sincronía con uno.es | `eventbooking_sync` + función `eventbooking-sync` (importa inscritos de Events Booking por `external_id`) | Ya conecta las dos plataformas |

## 2. Lo que la plantilla web necesita y Camberas no tiene

| Hueco | Lo usan | Propuesta mínima |
|---|---|---|
| Patrocinadores con logo y nivel | Guardia Civil (41), Gurriana (6 apoyos) | Tabla `race_sponsors` (race_id, name, logo_url, website, level, display_order) |
| Servicios al corredor (lista con icono) | Las Arenas, Guardia Civil, Loiu | Hoy `additional_info` texto libre. Mejor JSON en `race_web` (abajo) |
| Programa / horarios y recogida de dorsales (texto público) | Gurriana, Loiu, La Garita | `race_web.programa`, `race_web.dorsales` |
| Premios | Guardia Civil, Loiu, La Garita | `race_web.premios` |
| Camiseta (incluida, hasta, límite, imagen) | Ademco, Loiu, Gurriana | `race_web.camiseta` + `limite` |
| Sanitario, medioambiente, material obligatorio | Gurriana | `race_web` o secciones del reglamento (`section_type`) |
| Beneficiario (carrera solidaria) | Guardia Civil | `race_web.beneficiario` |
| Marca por tenant (colores, tipografía, textura del logo) | todas | `race_web.marca` o tabla `organizers` |
| `deporte` popular/ruta/marcha, `pruebas[].tipo`, `competitiva` | Guardia Civil, Las Arenas, Ademco, Loiu | Ampliar CHECK de `race_type`; añadir `race_distances.kind` (carrera/marcha/infantil) y `competitive boolean` |
| Tarifa por condición (federado/no federado como precio, no como fee) | Gurriana | Se resuelve con fees negativos; no hace falta cambiar |
| Extra con límite de unidades | Ademco (400 camisetas) | `field_options.max_units` + control en `guest-register` |
| Dorsal solidario con importe libre | Guardia Civil | Recorrido "Dorsal solidario" + campo number con fee; o `race_web.solidario` y pago manual |
| Organizador como entidad (nombre, web, logo, TPV) | todas | Tabla `organizers` — y es lo que necesita el TPV por tenant |
| Enlaces públicos (reglamento PDF, galería externa, clasificaciones históricas) | Loiu, La Garita, Guardia Civil | `race_web.documentos[]`, `race_web.fotos` |

## 3. Propuesta: una tabla `race_web` + una RPC `evento_publico(slug)`

- `race_web (race_id PK, contenido JSONB, updated_at)`: guarda las secciones que solo sirven a la web (patrocinadores, servicios, programa, dorsales, premios, camiseta, sanitario, medioambiente, beneficiario, marca, documentos, fotos, seo). Se edita desde el panel del organizador como un formulario por secciones. Validación contra `evento.schema.json` en el cliente.
- `evento_publico(p_slug text) RETURNS jsonb` — `SECURITY DEFINER SET search_path = public`, `GRANT EXECUTE TO anon, authenticated`: monta el JSON del esquema uniendo `races` + `race_distances` + `race_waves` + `race_distance_prices` + `race_categories` + `race_checkpoints` + `registration_form_fields` + `race_regulations` + `race_faqs` + `coupons` (solo existencia) + `race_web`. Devuelve `estado` y `plazasDisponibles` calculados. Solo carreras `is_visible`.
- La plantilla Lovable hace **una llamada**: `supabase.rpc('evento_publico', { p_slug })` (o `GET /rest/v1/rpc/evento_publico`) y pinta. Con copia estática de respaldo en el repo para build.
- El widget `<camberas-inscripcion>` reutiliza `guest-register`, `validate-coupon`, `redsys-init-payment` y `redsys-webhook` tal cual: **no hay que escribir backend de inscripción nuevo**, solo el componente.

## 4. TPV por organizador ("el gancho")

Hoy `redsys-init-payment` y `redsys-webhook` leen un único comercio de los secretos de la función. Para cobrar en el TPV del organizador:

1. Tabla `organizers (id, name, website, logo_url, contact_email, redsys_merchant_code, redsys_terminal, redsys_secret_ref, redsys_env)`; `races.organizer_org_id` FK. La clave SHA-256 **no va en la tabla**: va en Supabase Vault y la fila guarda el nombre del secreto (`redsys_secret_ref`).
2. `redsys-init-payment`: resuelve la carrera → organizador → credenciales; si el organizador no tiene TPV, usa el de UNO (secretos actuales). Misma lógica en `team-init-payment`.
3. `redsys-webhook`: la firma se verifica con la clave del comercio que corresponde al `Ds_Order`; guardar `organizer_org_id` en `payment_intents` al crear el intent para no tener que adivinar.
4. Devoluciones (`send-cancellation-confirmation` y política de `race_cancellation_tiers`): la API de devoluciones de Redsys se llama con el comercio del organizador.
5. Panel: pantalla "Mi TPV" en `/org` para meter FUC, terminal y clave (prueba y producción) con un botón "pago de prueba de 1 €".

Riesgo a vigilar: el `Ds_MerchantParameters` lleva `DS_MERCHANT_MERCHANTCODE`; si un intent se crea con un comercio y el webhook llega mientras el organizador cambia de credenciales, la firma falla. Guardar las credenciales usadas en el intent lo resuelve.

## 5. Orden de trabajo sugerido

1. Migración: ampliar `race_type`, añadir `race_distances.kind` y `competitive`, crear `race_web` y `race_sponsors`, RPC `evento_publico`. (Se aplica a mano en el panel de Supabase, como todas.)
2. Plantilla Lovable: `useEvento()` → `evento_publico`; secciones condicionales.
3. Cargar Loiu y Peña Prieta (ya en Camberas) y probar la plantilla contra datos reales.
4. `organizers` + TPV por tenant.
5. Widget.
