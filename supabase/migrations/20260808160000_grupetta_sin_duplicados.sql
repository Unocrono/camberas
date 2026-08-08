-- ============================================================
-- GRUPETTAS SIN DUPLICADOS (8-ago). Hasta hoy, unirse dos veces con
-- el mismo nombre creaba un dorsal nuevo cada vez: la grupetta del
-- Bike Shop acabó con TRES "Quique" (dorsales 1, 2 y 3) y el capo
-- sin saber cuál mirar en el mapa.
--
-- Regla: el nombre identifica a la persona dentro de la grupetta.
--   · Mismo nombre → es él que vuelve (móvil nuevo, app reinstalada,
--     enlace perdido): recupera SU dorsal y SU ruta, con token nuevo.
--     El token viejo deja de valer, así que el móvil anterior queda
--     fuera — que es justo lo que se quiere al cambiar de teléfono.
--   · ¿Y si es un homónimo de verdad? Se une con p_forzar_nuevo=true
--     y entra como "Quique (2)", sin pisarle el dorsal al primero.
--
-- Se compara el nombre normalizado (sin mayúsculas, tildes ni espacios
-- de más): "quique", "Quique" y "QUIQUE " son la misma persona.
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

CREATE OR REPLACE FUNCTION unirse_grupetta(
  p_code text,
  p_nombre text,
  p_acepta boolean DEFAULT false,
  p_guardar boolean DEFAULT false,
  p_forzar_nuevo boolean DEFAULT false
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
  v_existente gps_tokens%ROWTYPE;
  v_nombre text;
  v_homonimos int;
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

  -- Opción B: solo se vincula al usuario si tiene sesión Y da consentimiento
  IF COALESCE(p_guardar, false) AND auth.uid() IS NOT NULL THEN
    v_user := auth.uid();
  END IF;

  -- ¿Ya está ese nombre en la grupetta? Entonces es él que vuelve.
  IF NOT COALESCE(p_forzar_nuevo, false) THEN
    SELECT * INTO v_existente FROM gps_tokens
     WHERE event_id = v_dist_id
       AND nombre_normalizado(participant_name) = nombre_normalizado(v_nombre)
     ORDER BY created_at
     LIMIT 1;

    IF FOUND THEN
      -- Token nuevo en la MISMA fila: conserva dorsal y ruta, y el
      -- móvil viejo (o el enlace reenviado) deja de valer.
      UPDATE gps_tokens
         SET token = v_token,
             active = true,
             device_id = NULL,
             user_id = COALESCE(v_user, user_id)
       WHERE id = v_existente.id;

      RETURN jsonb_build_object(
        'token', v_token,
        'bib', v_existente.bib_number::int,
        'nombre_grupo', v_race.name,
        'slug', v_race.slug,
        'guardada', COALESCE(v_user, v_existente.user_id) IS NOT NULL,
        'reingreso', true
      );
    END IF;
  END IF;

  SELECT count(*) INTO v_count FROM gps_tokens WHERE event_id = v_dist_id;
  IF v_count >= 20 THEN
    RAISE EXCEPTION 'Grupo completo (máximo 20 participantes)';
  END IF;

  -- Homónimo declarado: entra como "Quique (2)" para que el capo
  -- los distinga en el mapa y la próxima vez cada uno recupere el suyo.
  IF COALESCE(p_forzar_nuevo, false) THEN
    SELECT count(*) INTO v_homonimos FROM gps_tokens
     WHERE event_id = v_dist_id
       AND nombre_normalizado(participant_name) LIKE nombre_normalizado(v_nombre) || '%';
    IF v_homonimos > 0 THEN
      v_nombre := left(v_nombre || ' (' || (v_homonimos + 1)::text || ')', 40);
    END IF;
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

GRANT EXECUTE ON FUNCTION unirse_grupetta(text, text, boolean, boolean, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nombre_normalizado(text) TO anon, authenticated;

-- La firma vieja (4 argumentos) se queda para no romper a nadie con la
-- página cacheada: delega en la nueva.
CREATE OR REPLACE FUNCTION unirse_grupetta(
  p_code text, p_nombre text, p_acepta boolean, p_guardar boolean
)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT unirse_grupetta(p_code, p_nombre, p_acepta, p_guardar, false);
$fn$;

GRANT EXECUTE ON FUNCTION unirse_grupetta(text, text, boolean, boolean) TO anon, authenticated;
