-- ============================================================
-- TRACKER FÍSICO PARA PARTICIPANTES (15-ago) — la rama que faltaba.
--
-- gps-webhook solo miraba race_moto_id: un Queclink asignado a un
-- corredor respondía 200 "Device not assigned to any moto" y TIRABA
-- el punto en silencio. Ahora gps_devices puede apuntar al TOKEN del
-- corredor (la identidad de toda la tubería) y el webhook escribe en
-- gps_positions: tracker y móvil son intercambiables — mapas, overlays
-- y replay no distinguen de dónde vino el punto.
--
-- La asignación es al token (no a registration_id): así el gallo
-- conserva su dorsal real, su ventana de captura y su cruce con el
-- cronometraje, que es lo que lo hace valioso en pantalla.
-- ============================================================

ALTER TABLE gps_devices
  ADD COLUMN IF NOT EXISTS token_id uuid REFERENCES gps_tokens(id) ON DELETE SET NULL;

COMMENT ON COLUMN gps_devices.token_id IS
  'Token del corredor al que emite este tracker físico (rama participante '
  'de gps-webhook). Excluyente en la práctica con race_moto_id: si ambos '
  'están, la moto gana. update_frequency documenta la cadencia configurada '
  'en el aparato (p. ej. 5 s para un gallo).';

-- Índice para el panel (listar trackers por token / detectar sin asignar)
CREATE INDEX IF NOT EXISTS idx_gps_devices_token ON gps_devices (token_id)
  WHERE token_id IS NOT NULL;
