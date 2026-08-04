# Traspaso: llevar el patrón TOKEN al cronometrador

Documento de arranque para una sesión nueva. Recoge el patrón ya probado en
producción con **corredores** (camberas-track) y **motos** (camberas-motos), y
lo que hay que replicar para el **cronometrador** (`src/pages/TimingApp.tsx`).

## El patrón, en una frase

**La identidad es el PUESTO, no la persona.** En vez de crear usuarios y
asignarlos, el panel genera un **token** por puesto; se reparte como QR o
enlace; el dispositivo lo escanea y queda vinculado. Sin altas, sin
contraseñas, sin asignar personas.

## Cómo está montado hoy (lo que funciona)

| Pieza | Dónde |
|---|---|
| Tokens | `gps_tokens` (columna `token` = credencial UUID, `event_id` = `race_distances.id`, `bib_number`, `participant_name`, `device_id`, `active`) |
| Vincular | RPC `link_gps_token(p_token, p_device_id, p_force)` → devuelve fila + `needs_transfer` si ya estaba en otro dispositivo |
| Desvincular | RPC `unlink_gps_token(p_token_id, p_device_id)` |
| Generar (motos) | RPC `generar_token_moto(p_race_moto_id, p_distance_id)` — crea token con dorsal `M1`, `M2`… y **revoca el anterior** |
| Listar (motos) | RPC `tokens_motos_carrera(p_race_id)` — para pintar QR y estado en el panel |
| QR en el panel | `src/components/admin/MotosManagement.tsx` (librería `qrcode`, se dibuja en local) |
| Escáner en la app | `camberas-motos/src/components/LinkMotoScreen.tsx` + `src/services/link.service.ts` (expo-camera) |
| Migración de referencia | `supabase/migrations/20260803120000_motos_tokens.sql` |

## Qué habría que hacer para el cronometrador

Estado actual: `TimingApp.tsx` (1925 líneas) resuelve el acceso con
`has_role(timer|organizer|admin)` y lee **`timer_assignments`** (race_id +
checkpoint_id) para saber qué puestos puede fichar cada usuario.

Plan equivalente al de motos:

1. **Catálogo de puestos**: ya existe (`race_checkpoints`). Es el análogo de
   `race_motos` — no se toca, es el control del organizador.
2. **`token_id` en el puesto**: `ALTER TABLE race_checkpoints ADD COLUMN
   token_id uuid` + RPC `generar_token_checkpoint(p_checkpoint_id)` calcado de
   `generar_token_moto` (dorsal tipo `CP1`, nombre = nombre del punto).
3. **QR en el panel de checkpoints** (`CheckpointsManagement.tsx`), igual que
   el botón QR de motos.
4. **La app**: pantalla de vinculación por QR; el token sustituye al login. Las
   lecturas (`timing_readings`) se firman con el token en vez de con el usuario.
5. **RLS**: política de INSERT en `timing_readings` con el token como
   credencial, como la de `gps_positions`.
6. **Retirada**: rol `timer` y `timer_assignments` se quedan mientras dure la
   transición; se retiran cuando la app nueva esté probada en un evento real.

## Lecciones aprendidas (evitar tropiezos ya sufridos)

- **La ventana de captura**: `gps_positions` solo acepta datos dentro de
  `[salida − 24 h, salida + límite + 2 h]` (ver `20260803100000` y
  `20260804090000`). Los **dispositivos de organización están exentos** — si el
  cronometrador acaba con ventana, aplícale la misma exención.
- **La ventana la manda `races.date` + la hora de la oleada**: cambiar la fecha
  de la carrera mueve la ventana sin tocar el evento (se corrigió el 4-ago
  porque cambiar solo la fecha dejaba la ventana en el día viejo).
- **Regenerar un QR deja huérfano al dispositivo que tenía el anterior**. El
  panel debe casar por token **y** por identificador (dorsal/nombre), como hace
  `MotoMapViewer` desde el 4-ago.
- **`REVOKE ... FROM PUBLIC` rompe a `authenticated`** si no hay GRANT
  explícito: cada RPC nueva necesita su `GRANT EXECUTE ... TO authenticated`.
- **Upsert idempotente** con `onConflict: 'token_id,timestamp',
  ignoreDuplicates: true` para que los reintentos offline no dupliquen.
- Antes de tocar una tabla, **buscar todos sus lectores**: hay pipelines
  paralelos legítimos (`moto_gps_tracking` = rastreadores de hardware por
  webhook; `moto_positions` = app de móvil; `gps_tracking` = tracker web).

## Paleta y estilo

`docs/paleta-camberas.md`. Las apps van en verde bosque `#143A26`, tarjetas
`#1B4A30`, naranja de acción `#EC7C2B`, crema `#FAF6EC`, lima `#C8E85C`.
Diseño de referencia de las pantallas: `camberas-track/docs/diseno-v23/`.
