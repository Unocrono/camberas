# GPS Organización (antiguas "Motos GPS")

Documento de arranque para el hilo de **camberas-overlays**: comprobar que el
grafismo lee `gps_positions` en vez de `moto_positions`.

## Qué son

Dispositivos GPS de la **organización**: moto cámara, ambulancia, cierre de
carrera, coche escoba… Solo cambió el **nombre visible** (4-ago): las tablas y
RPCs conservan la nomenclatura `moto` (`race_motos`, `generar_token_moto`…) —
**no renombrar nada en BD**, el usuario sabe de dónde viene.

## Cómo funcionan (desde el 4-ago)

- Catálogo: `race_motos` (name, color, moto_order, race_distance_id, `token_id`).
- Cada dispositivo tiene su **token** (`gps_tokens`), dorsal `M<orden>` (M1, M2…)
  y nombre = `race_motos.name`. QR en Admin → GPS Organización.
- La app (repo camberas-motos, "GPS ORGANIZACIÓN") se vincula por QR y emite
  **cada 1 segundo a `gps_positions`** (token_id, lat, lng, speed, heading,
  altitude, battery, timestamp). Upsert idempotente `token_id,timestamp`.
- **Exentos de la ventana de captura**: emiten siempre que su token esté activo
  (migración `20260804090000_motos_exentas_ventana.sql`).
- `get_live_gps_positions(p_race_id)` los devuelve con `source = 'moto'` y
  dorsal `M#` — para el grafismo, **el GPS Organización se selecciona por su
  dorsal (MOTO1 = M1)**.
- Realtime: `gps_positions` está en la publicación — se puede escuchar INSERT.

## Estado de las tablas viejas

| Tabla | Estado |
|---|---|
| `gps_positions` | ✅ **La fuente.** La app escribe aquí desde `839d43c` |
| `moto_positions` | ⚠️ **MUERTA para escritura** — la app ya NO escribe. Se retirará. Cualquier lector se queda sin datos |
| `moto_gps_tracking` | ✅ Viva pero SOLO para **rastreadores de hardware** vía webhook (`gps-webhook` → `process-moto-gps` calcula `distance_from_start`). La app de móvil nunca escribió aquí |

## Misión del hilo de overlays

Auditar y migrar los lectores de `moto_positions` → `gps_positions`:

1. `camberas-motos/public/operator.html` — **el más delicado**: lee
   `moto_positions` y ESCRIBE `distance_to_finish` allí, que la app lee para
   "DIST META" y el gap (`App.tsx` hace polling de `moto_positions` cada 5 s —
   ⚠️ ese circuito está ROTO desde que la app no escribe: hay que redefinirlo,
   p. ej. operator lee `gps_positions` y publica la distancia en
   `overlay_control` o similar, y la app la lee de ahí).
2. `camberas-motos/public/control-ciclismo.html` y overlays de atletismo
   (`gps-overlay.html`, `control.html`).
3. `camberas-overlays/racetec/` — lo que lea de motos.
4. En camberas web: `MotoOverlay`, `ElevationOverlay`, `RouteMapOverlay` leen
   `moto_gps_tracking` (hardware). Decidir si además leen `gps_positions` para
   funcionar con la app de móvil (el `MotoMapViewer` del panel ya lo hace:
   casa por token **y por dorsal/nombre** para sobrevivir a QR regenerados).

## Cómo leer un GPS Organización (receta)

```sql
-- Última posición de cada dispositivo de una carrera (con su color):
SELECT m.name, m.color, m.moto_order, p.*
FROM race_motos m
JOIN gps_tokens t ON t.id = m.token_id
JOIN LATERAL (
  SELECT * FROM gps_positions gp WHERE gp.token_id = t.id
  ORDER BY gp."timestamp" DESC LIMIT 1
) p ON true
WHERE m.race_id = :race_id AND m.is_active;
```
O por RPC público: `get_live_gps_positions(p_race_id)` filtrando
`source = 'moto'` (robusto ante QR regenerados, casa por dorsal `M#`).

## Lecciones (no repetir)

- Regenerar QR revoca el token anterior → casar por dorsal además de por token.
- `GRANT EXECUTE ... TO authenticated` en toda RPC nueva.
- Buscar TODOS los lectores antes de tocar una tabla.
- Lectura de tokens: módulo unificado `camberasToken.ts` (docs/tokens-camberas.md).
