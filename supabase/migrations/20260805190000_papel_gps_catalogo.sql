-- ============================================================
-- PAPEL DE CADA DISPOSITIVO GPS DEL CATÁLOGO (decisión 5-ago)
--
-- race_motos es el catálogo de TODOS los GPS de organización
-- (emiten por la tubería común con dorsal M1, M2…). El papel
-- distingue para qué mapa cuenta cada uno en Camberas Org:
--   moto         → moto de carrera (cámara, escoba…)
--   organizacion → policía, protección civil, médico, logística
--   voluntario   → voluntario con GPS
-- Los corredores no están aquí: son los tokens SIN fila en el
-- catálogo.
-- ============================================================

ALTER TABLE race_motos
  ADD COLUMN IF NOT EXISTS gps_role text NOT NULL DEFAULT 'moto'
  CHECK (gps_role IN ('moto', 'organizacion', 'voluntario'));
