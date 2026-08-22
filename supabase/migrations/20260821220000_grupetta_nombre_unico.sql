-- ============================================================
-- GRUPETTA: EL NOMBRE NO SE REPITE (21-ago)
--
-- La grupetta del Bike Shop acabó hoy con dos "Cambero" porque la
-- función antiduplicados del 8-ago se escribió pero NUNCA se aplicó a
-- producción: el servidor seguía con la versión vieja, que crea un
-- dorsal nuevo cada vez que alguien pone su nombre.
--
-- Decisión del capo: si el nombre ya está en el grupo, SE RECHAZA.
-- Que el segundo se ponga algo que lo distinga (apellido, apodo).
-- Así el capo mira el mapa y sabe quién es cada dorsal sin dudar.
--
-- Se compara el nombre normalizado (sin mayúsculas, tildes ni espacios
-- de más): "cambero", "Cambero" y "CAMBERO " son el mismo.
--
-- ⚠ Consecuencia a tener presente: quien se una y luego reinstale la
-- app o pierda el enlace NO puede volver a entrar con su nombre — el
-- capo tendrá que borrarle el dorsal para que se una otra vez.
-- ============================================================

-- Normalizador de nombres: minúsculas, sin tildes, sin espacios dobles
CREATE OR REPLACE FUNCTION public.nombre_normalizado(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT regexp_replace(
           lower(trim(translate(COALESCE(p, ''),
             'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
             'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'))),
           '\s+', ' ', 'g');
$fn$;

GRANT EXECUTE ON FUNCTION public.nombre_normalizado(text) TO anon, authenticated;

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
  v_nombre text;
BEGIN
  IF NOT COALESCE(p_acepta, false) THEN
    RAISE EXCEPTION 'Debes aceptar el descargo de responsabilidad para unirte';
  END IF;
  IF length(trim(p_nombre)) < 2 THEN
    RAISE EXCEPTION 'Dinos tu nombre (mínimo 2 caracteres)';
  END IF;
  v_nombre := left(trim(p_nombre), 40);

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

  -- ── EL NOMBRE ES ÚNICO DENTRO DE LA GRUPETTA ──────────────────
  IF EXISTS (
    SELECT 1 FROM gps_tokens
     WHERE event_id = v_dist_id
       AND nombre_normalizado(participant_name) = nombre_normalizado(v_nombre)
  ) THEN
    RAISE EXCEPTION 'Ya hay alguien en el grupo con el nombre "%". Añade tu apellido o un apodo para que el capo os distinga en el mapa.', v_nombre;
  END IF;

  -- Opción B: solo se vincula al usuario si tiene sesión Y da consentimiento
  IF COALESCE(p_guardar, false) AND auth.uid() IS NOT NULL THEN
    v_user := auth.uid();
  END IF;

  SELECT count(*) INTO v_count FROM gps_tokens WHERE event_id = v_dist_id;
  IF v_count >= 20 THEN
    RAISE EXCEPTION 'Grupo completo (máximo 20 participantes)';
  END IF;

  -- Dorsal siguiente por el MÁXIMO, no por el total: con count(*) se
  -- repetía número en cuanto el capo borraba a alguien.
  SELECT COALESCE(max(NULLIF(regexp_replace(bib_number, '\D', '', 'g'), '')::int), 0) + 1
    INTO v_bib
    FROM gps_tokens WHERE event_id = v_dist_id;

  INSERT INTO gps_tokens (active, bib_number, event_id, participant_name, token, user_id)
  VALUES (true, v_bib::text, v_dist_id, v_nombre, v_token, v_user);

  RETURN jsonb_build_object(
    'token', v_token,
    'bib', v_bib,
    'nombre', v_nombre,
    'nombre_grupo', v_race.name,
    'slug', v_race.slug,
    'guardada', v_user IS NOT NULL,
    'reingreso', false
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION unirse_grupetta(text, text, boolean, boolean) TO anon, authenticated;

-- La firma de 5 argumentos del intento del 8-ago no llegó a existir en
-- producción; si alguna vez se aplica, que no conviva con esta.
DROP FUNCTION IF EXISTS unirse_grupetta(text, text, boolean, boolean, boolean);
