-- ============================================================
-- GRUPETTA — grupos autoservicio sobre la infraestructura de carreras
-- Categorías de agrupación: 1 carrera (defecto) · 2 quedada · 3 grupetta
--  · Carrera y Quedada: MISMA estructura (evento de organizador, panel,
--    inscripciones). La quedada es simplemente una carrera de <50.
--  · Grupetta: autoservicio (máx 20), se crea sola con los RPCs de abajo.
-- La app móvil NO cambia: una grupetta es una "carrera" oculta cuyos
-- tokens se crean al unirse. El mapa del grupo es /:slug/gps.
-- OJO editor SQL de Supabase: delimitadores $fn$, no $$.
-- ============================================================

-- 1. Categoría de agrupación en races
ALTER TABLE races ADD COLUMN IF NOT EXISTS group_type text NOT NULL DEFAULT 'carrera';
ALTER TABLE races DROP CONSTRAINT IF EXISTS races_group_type_check;
ALTER TABLE races ADD CONSTRAINT races_group_type_check
  CHECK (group_type IN ('carrera', 'quedada', 'grupetta'));

-- 2. Código de unión (solo grupetta/quedada)
ALTER TABLE races ADD COLUMN IF NOT EXISTS join_code text UNIQUE;

-- 3. Crear una grupetta (autoservicio, máx 20; las quedadas se crean
--    desde el panel como cualquier carrera)
CREATE OR REPLACE FUNCTION crear_grupetta(p_nombre text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_code text;
  v_race_id uuid;
  v_dist_id uuid;
  v_slug text;
  v_intentos int := 0;
BEGIN
  IF length(trim(p_nombre)) < 3 THEN
    RAISE EXCEPTION 'El nombre debe tener al menos 3 caracteres';
  END IF;

  -- Código de 6 caracteres legibles (sin 0/1/O/I/L)
  LOOP
    v_code := upper(substr(regexp_replace(
      md5(random()::text || clock_timestamp()::text), '[01oil]', '', 'gi'), 1, 6));
    EXIT WHEN length(v_code) = 6
      AND NOT EXISTS (SELECT 1 FROM races WHERE join_code = v_code);
    v_intentos := v_intentos + 1;
    IF v_intentos > 10 THEN RAISE EXCEPTION 'No se pudo generar código'; END IF;
  END LOOP;

  v_slug := 'grupetta-' || lower(v_code);

  INSERT INTO races (name, date, location, race_type, group_type, is_visible,
                     gps_tracking_enabled, gps_update_frequency, join_code, slug,
                     description, max_participants)
  VALUES (left(trim(p_nombre), 60), current_date, 'Grupetta', 'btt', 'grupetta', false,
          true, 15, v_code, v_slug,
          'Grupo Grupetta (autoservicio)', 20)
  RETURNING id INTO v_race_id;

  INSERT INTO race_distances (race_id, name, distance_km, gps_tracking_enabled,
                              gps_update_frequency, is_visible)
  VALUES (v_race_id, 'Ruta', 0, true, 15, true)
  RETURNING id INTO v_dist_id;

  RETURN jsonb_build_object(
    'race_id', v_race_id,
    'distance_id', v_dist_id,
    'join_code', v_code,
    'slug', v_slug
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION crear_grupetta(text) TO anon, authenticated;

-- 4. Unirse a una grupetta con el código
CREATE OR REPLACE FUNCTION unirse_grupetta(p_code text, p_nombre text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_race races%ROWTYPE;
  v_dist_id uuid;
  v_count int;
  v_max int;
  v_bib int;
  v_token uuid := gen_random_uuid();
BEGIN
  IF length(trim(p_nombre)) < 2 THEN
    RAISE EXCEPTION 'Dinos tu nombre (mínimo 2 caracteres)';
  END IF;

  SELECT * INTO v_race FROM races
   WHERE join_code = upper(trim(p_code))
     AND group_type = 'grupetta';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código no válido';
  END IF;

  -- Caducidad: 48 h desde la creación para nuevas uniones
  IF v_race.created_at < now() - interval '48 hours' THEN
    RAISE EXCEPTION 'Esta grupetta ha caducado (48 h)';
  END IF;

  SELECT id INTO v_dist_id FROM race_distances
   WHERE race_id = v_race.id ORDER BY created_at LIMIT 1;

  v_max := 20;
  SELECT count(*) INTO v_count FROM gps_tokens WHERE event_id = v_dist_id;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Grupo completo (máximo % participantes)', v_max;
  END IF;

  v_bib := v_count + 1;
  INSERT INTO gps_tokens (active, bib_number, event_id, participant_name, token)
  VALUES (true, v_bib::text, v_dist_id, left(trim(p_nombre), 40), v_token);

  RETURN jsonb_build_object(
    'token', v_token,
    'bib', v_bib,
    'nombre_grupo', v_race.name,
    'slug', v_race.slug
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION unirse_grupetta(text, text) TO anon, authenticated;

-- 5. Quedadas y grupettas: UN solo evento (no se puede crear un segundo)
CREATE OR REPLACE FUNCTION check_single_distance_group()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $fn$
DECLARE
  v_group text;
  v_count int;
BEGIN
  SELECT group_type INTO v_group FROM races WHERE id = NEW.race_id;
  IF v_group IN ('quedada', 'grupetta') THEN
    SELECT count(*) INTO v_count FROM race_distances WHERE race_id = NEW.race_id;
    IF v_count >= 1 THEN
      RAISE EXCEPTION 'Una % solo puede tener un evento', v_group;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_single_distance_group ON race_distances;
CREATE TRIGGER trg_single_distance_group
  BEFORE INSERT ON race_distances
  FOR EACH ROW EXECUTE FUNCTION check_single_distance_group();
