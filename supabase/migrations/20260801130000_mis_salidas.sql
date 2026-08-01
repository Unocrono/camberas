-- ============================================================
-- MIS SALIDAS — Opción B de retención (decisión 1-ago):
-- Quien se une con SESIÓN y marca "guardar mi ruta" queda vinculado al
-- token (gps_tokens.user_id) y sus tracks SE CONSERVAN en su cuenta.
-- Los anónimos siguen como siempre: se purgan a los ~30 días.
-- (La futura purga automática debe respetar: WHERE user_id IS NULL.)
-- ============================================================

-- 1. Vínculo opcional token → usuario (solo con consentimiento)
ALTER TABLE gps_tokens ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS idx_gps_tokens_user ON gps_tokens(user_id) WHERE user_id IS NOT NULL;

-- 2. unirse_grupetta con consentimiento de guardado
DROP FUNCTION IF EXISTS unirse_grupetta(text, text, boolean);

CREATE OR REPLACE FUNCTION unirse_grupetta(
  p_code text,
  p_nombre text,
  p_acepta boolean DEFAULT false,
  p_guardar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_race races%ROWTYPE;
  v_dist_id uuid;
  v_count int;
  v_bib int;
  v_token uuid := gen_random_uuid();
  v_user uuid;
BEGIN
  IF NOT COALESCE(p_acepta, false) THEN
    RAISE EXCEPTION 'Debes aceptar el descargo de responsabilidad para unirte';
  END IF;
  IF length(trim(p_nombre)) < 2 THEN
    RAISE EXCEPTION 'Dinos tu nombre (mínimo 2 caracteres)';
  END IF;

  SELECT * INTO v_race FROM races
   WHERE join_code = upper(trim(p_code))
     AND group_type = 'grupetta';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código no válido';
  END IF;
  IF NOT v_race.is_visible THEN
    RAISE EXCEPTION 'El capo aún no ha publicado esta grupetta';
  END IF;
  IF v_race.date < current_date - 1 THEN
    RAISE EXCEPTION 'Esta grupetta ya ha pasado';
  END IF;

  SELECT id INTO v_dist_id FROM race_distances
   WHERE race_id = v_race.id ORDER BY created_at LIMIT 1;

  SELECT count(*) INTO v_count FROM gps_tokens WHERE event_id = v_dist_id;
  IF v_count >= 20 THEN
    RAISE EXCEPTION 'Grupo completo (máximo 20 participantes)';
  END IF;

  -- Opción B: solo se vincula al usuario si tiene sesión Y da consentimiento
  IF COALESCE(p_guardar, false) AND auth.uid() IS NOT NULL THEN
    v_user := auth.uid();
  END IF;

  v_bib := v_count + 1;
  INSERT INTO gps_tokens (active, bib_number, event_id, participant_name, token, user_id)
  VALUES (true, v_bib::text, v_dist_id, left(trim(p_nombre), 40), v_token, v_user);

  RETURN jsonb_build_object(
    'token', v_token,
    'bib', v_bib,
    'nombre_grupo', v_race.name,
    'slug', v_race.slug,
    'guardada', v_user IS NOT NULL
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION unirse_grupetta(text, text, boolean, boolean) TO anon, authenticated;

-- 3. Mis salidas: el historial del usuario (sus tokens con ruta)
CREATE OR REPLACE FUNCTION mis_salidas()
RETURNS TABLE(
  token_id uuid, nombre_grupo text, fecha date, slug text,
  dorsal text, posiciones bigint
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT t.id, r.name, r.date, r.slug, t.bib_number,
         (SELECT count(*) FROM gps_positions p WHERE p.token_id = t.id)
  FROM gps_tokens t
  JOIN race_distances d ON d.id = t.event_id
  JOIN races r ON r.id = d.race_id
  WHERE t.user_id = auth.uid()
  ORDER BY r.date DESC;
$fn$;

REVOKE EXECUTE ON FUNCTION mis_salidas() FROM anon;
GRANT EXECUTE ON FUNCTION mis_salidas() TO authenticated;
