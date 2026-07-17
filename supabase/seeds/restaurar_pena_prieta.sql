-- ═══════════════════════════════════════════════════════════════════
-- RESTAURACIÓN: II Peña Prieta Skyrace - Camberas APP
-- Borrada en cascada al eliminar el usuario organizador (17/07/2026).
-- Reconstruida con los UUIDs ORIGINALES para que los enlaces, GPX e
-- imágenes del Storage sigan funcionando.
-- Las inscripciones no son recuperables.
-- ═══════════════════════════════════════════════════════════════════

-- 0) Arreglar la CAUSA RAÍZ: borrar un usuario no debe borrar sus carreras
ALTER TABLE public.races
  DROP CONSTRAINT IF EXISTS races_organizer_id_fkey;
ALTER TABLE public.races
  ADD CONSTRAINT races_organizer_id_fkey
  FOREIGN KEY (organizer_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Columnas de migraciones pendientes (idempotente)
ALTER TABLE public.races ADD COLUMN IF NOT EXISTS poster_url text;
ALTER TABLE public.races ADD COLUMN IF NOT EXISTS subtitle text;

-- 1) La carrera (UUID original)
INSERT INTO public.races (
  id, name, subtitle, description, location, date, max_participants,
  image_url, cover_image_url, logo_url, poster_url,
  race_type, is_visible, slug, utc_offset
) VALUES (
  '4ba602c8-4445-4170-82bf-e37f79b047b3',
  'II Peña Prieta Skyrace - Camberas APP',
  NULL,
  'II Peña Prieta Skyrace - Camberas APP',
  'Vega de Lliébana',
  '2026-10-03',
  500,
  'https://rsahtxjpisnldxnsmupk.supabase.co/storage/v1/object/public/race-images/2026/ii-pena-prieta-skyrace-camberas-app-2026/ii-pena-prieta-skyrace-camberas-app-2026_race.jpg',
  'https://rsahtxjpisnldxnsmupk.supabase.co/storage/v1/object/public/race-images/2026/ii-pena-prieta-skyrace-camberas-app-2026/ii-pena-prieta-skyrace-camberas-app-2026_cover.jpg',
  'https://rsahtxjpisnldxnsmupk.supabase.co/storage/v1/object/public/race-images/2026/ii-pena-prieta-skyrace-camberas-app-2026/ii-pena-prieta-skyrace-camberas-app-2026_logo.png',
  'https://rsahtxjpisnldxnsmupk.supabase.co/storage/v1/object/public/race-images/2026/ii-pena-prieta-skyrace-camberas-app-2026/ii-pena-prieta-skyrace-camberas-app-2026_poster.jpg',
  'trail',
  true,
  'ii-pena-prieta-skyrace-camberas-app',
  1
)
ON CONFLICT (id) DO NOTHING;

-- Vincular al organizador si ya has recreado su usuario en el panel
UPDATE public.races
SET organizer_id = (SELECT id FROM auth.users WHERE email = 'penaprietaskyrace@gmail.com' LIMIT 1)
WHERE id = '4ba602c8-4445-4170-82bf-e37f79b047b3';

-- 2) Las tres distancias (UUIDs originales)
INSERT INTO public.race_distances (
  id, race_id, name, distance_km, elevation_gain, price, max_participants,
  cutoff_time, start_location, finish_location, gpx_file_url,
  gps_tracking_enabled, gps_update_frequency, show_route_map,
  is_visible, display_order, bib_start, bib_end, next_bib
) VALUES
(
  'b4e5f827-6095-476c-96ec-0d60c6d4fbd2',
  '4ba602c8-4445-4170-82bf-e37f79b047b3',
  'Skyrace', 36, 2600, 40, 300,
  '08:00:00', 'Vega de Liébana', 'Vega de Liébana',
  'https://rsahtxjpisnldxnsmupk.supabase.co/storage/v1/object/public/race-gpx/4ba602c8-4445-4170-82bf-e37f79b047b3/b4e5f827-6095-476c-96ec-0d60c6d4fbd2-1784234505149.gpx',
  true, 30, true,
  true, 1, NULL, NULL, NULL
),
(
  'ad56973b-3010-47d4-90f8-2561789627b9',
  '4ba602c8-4445-4170-82bf-e37f79b047b3',
  'Trail', 8, 560, 15, 100,
  '05:00:00', 'Vega de Liébana', 'Vega de Liébana',
  NULL,
  false, 30, false,
  true, 2, NULL, NULL, NULL
),
(
  '37ed1a28-9d35-42e3-a2c8-5ba65f890648',
  '4ba602c8-4445-4170-82bf-e37f79b047b3',
  'Marcha', 8, 560, 10, 100,
  '05:00:00', 'Vega de Liébana', 'Vega de Liébana',
  NULL,
  false, 30, false,
  true, 3, 501, 600, 501
)
ON CONFLICT (id) DO NOTHING;

-- 3) Horas de salida (oleadas)
INSERT INTO public.race_waves (race_id, race_distance_id, wave_name, start_time)
SELECT '4ba602c8-4445-4170-82bf-e37f79b047b3', d.id, 'Salida ' || d.name, t.start_at
FROM (VALUES
  ('b4e5f827-6095-476c-96ec-0d60c6d4fbd2'::uuid, '2026-10-03T09:00:00'::timestamptz),
  ('ad56973b-3010-47d4-90f8-2561789627b9'::uuid, '2026-10-03T09:30:00'::timestamptz),
  ('37ed1a28-9d35-42e3-a2c8-5ba65f890648'::uuid, '2026-10-03T09:30:00'::timestamptz)
) AS t(distance_id, start_at)
JOIN public.race_distances d ON d.id = t.distance_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.race_waves w WHERE w.race_distance_id = t.distance_id
);

-- 4) Campos del formulario de inscripción (los mismos 14 en las 3 distancias)
DO $$
DECLARE
  v_dist uuid;
BEGIN
  FOREACH v_dist IN ARRAY ARRAY[
    'b4e5f827-6095-476c-96ec-0d60c6d4fbd2'::uuid,
    'ad56973b-3010-47d4-90f8-2561789627b9'::uuid,
    '37ed1a28-9d35-42e3-a2c8-5ba65f890648'::uuid
  ] LOOP
    IF EXISTS (SELECT 1 FROM registration_form_fields WHERE race_distance_id = v_dist) THEN
      CONTINUE;
    END IF;

    INSERT INTO registration_form_fields
      (race_distance_id, field_name, field_label, field_type, field_order, is_required, is_system_field, is_visible, field_options, profile_field)
    VALUES
      (v_dist, 'first_name', 'Nombre', 'text', 1, true, true, true, NULL, 'first_name'),
      (v_dist, 'last_name', 'Apellidos', 'text', 2, true, true, true, NULL, 'last_name'),
      (v_dist, 'email', 'Email', 'email', 3, true, true, true, NULL, NULL),
      (v_dist, 'document_number', 'Nº de Documento', 'text', 4, true, true, true, NULL, 'dni_passport'),
      (v_dist, 'phone', 'Tel. Móvil', 'tel', 5, true, true, true, NULL, 'phone'),
      (v_dist, 'gender', 'Género', 'radio', 6, true, true, true, '{"options":["Masculino","Femenino"]}'::jsonb, NULL),
      (v_dist, 'birth_date', 'Fecha de Nacimiento', 'date', 7, true, true, true, NULL, 'birth_date'),
      (v_dist, 'category', 'Categoría', 'readonly', 8, false, true, true, NULL, NULL),
      (v_dist, 'tshirt_size', 'Talla de Camiseta', 'radio', 9, true, true, true, '{"options":["XS","S","M","L","XL","XXL"]}'::jsonb, NULL),
      (v_dist, 'address', 'Domicilio', 'text', 10, false, false, true, NULL, 'address'),
      (v_dist, 'city', 'Localidad', 'text', 11, false, false, true, NULL, 'city'),
      (v_dist, 'province', 'Provincia', 'text', 12, false, false, true, NULL, 'province'),
      (v_dist, 'autonomous_community', 'Com. Autónoma', 'text', 13, false, false, true, NULL, 'autonomous_community'),
      (v_dist, 'country', 'País', 'text', 14, false, false, true, NULL, NULL);
  END LOOP;
END $$;
