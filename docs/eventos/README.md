# Camberas · eventos y plantilla multi-tenant

- `evento.schema.json` — esquema único de evento (JSON Schema 2020-12). Validado contra 9 carreras reales.
- `eventos/*.json` — las carreras, en el esquema:
  - **A hacer**: guardia-civil-la-rioja-2025 (popular solidaria), loiu-500-trail-2026 (trail + marcha), san-silvestre-corraliega-la-garita-2026 (trail + marcha, 31 dic), trail-san-felices-2026 (esqueleto, 15 dic)
  - **Referencia**: marcha-ademco-2026 (marcha no competitiva), pena-prieta-skyrace-2026 (3 recorridos, ya en Camberas), gurriana-trail-2027 (plantilla base)
  - **Casos de prueba del esquema**: las-arenas-bilbao-2027 (7 periodos de precio), entre-vinedos-2026 (equipos de 10 + infantil con tutor)
- `api.md` — contrato de API y widget `<camberas-inscripcion>`, con el mapeo desde los formularios de uno.es (Joomla Events Booking).
- `plantilla.md` — qué sección de la web se pinta con qué dato; menú autogenerado.
- `reglamentos/` — PDFs y texto extraído de Loiu 2026 y La Garita 2025.
- `resumen.json` — matriz de mecánicas y secciones por evento.

Cada evento lleva `fuente.pendiente` con lo que falta confirmar con el organizador.

## Camberas ya existe como plataforma
camberas.com (React/Vite + Supabase) ya tiene fichas públicas de evento (`/race/{slug}`) con recorridos, precios, plazas, GPX, rutómetro y GPS en vivo, y sus tablas son:
`races`, `race_distances`, `race_distance_prices`, `race_categories`, `race_waves`, `race_checkpoints`, `race_documents`, `race_regulations(+_sections)`, `registration_form_fields`, `registrations`, `registration_responses`, `coupons`, `teams`, `team_members`, `roadbooks`, `race_results`, `gps_tracking`…
El siguiente paso es alinear `evento.schema.json` con esas tablas (ver el repo `camberas`, carpeta `supabase/`) para que la plantilla lea directamente de Supabase.
