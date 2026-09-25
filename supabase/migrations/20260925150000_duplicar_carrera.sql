-- =============================================================================
-- Duplicar carrera: copia una carrera entera como nueva edición.
--
-- duplicar_carrera(p_race_id, p_nombre, p_fecha, p_slug, p_copiar_web)
--   → uuid de la carrera nueva.
--
-- Copia: races, race_distances (dorsales reiniciados), race_distance_prices,
-- race_waves, race_categories, registration_form_fields (con dependencias
-- entre campos reasignadas), race_checkpoints (sin punto de cronometraje),
-- race_regulations + secciones, race_faqs, race_cancellation_tiers,
-- race_team_discount_tiers, race_cesion_config, race_document_requirements,
-- bib_designs, race_sponsors y race_web (desactivada).
-- Todas las fechas se desplazan los mismos días que la fecha de la carrera
-- (apertura y cierre de inscripciones, tramos de precios, cesiones, cálculo
-- de edad). La copia nace OCULTA (is_visible = false) y sin destacar.
--
-- No copia: inscripciones, pagos, cupones, resultados, lecturas, tokens
-- (cronometraje, GPS, mesas, pantallas), voluntariado, overlays, blog,
-- documentos subidos ni la sincronización con uno.es. Los ficheros (GPX,
-- cartel, logos) se comparten por URL, no se duplican en Storage.
--
-- Las filas se copian con to_jsonb/jsonb_populate_record para no tener que
-- enumerar columnas: cuando una tabla gane columnas, se copian solas.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.duplicar_carrera(
  p_race_id    uuid,
  p_nombre     text,
  p_fecha      date,
  p_slug       text    DEFAULT NULL,
  p_copiar_web boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_origen   public.races%ROWTYPE;
  v_nuevo    uuid := gen_random_uuid();
  v_delta    integer;
  v_slug     text;
  v_dist     record;
  v_dist_map jsonb := '{}'::jsonb;   -- id distancia vieja → nueva
  v_campo    record;
  v_campo_map jsonb := '{}'::jsonb;  -- id campo viejo → nuevo
  v_reg_old  uuid;
  v_reg_new  uuid;
  v_fila     jsonb;
  v_id       uuid;
BEGIN
  -- Desde el editor SQL del panel (session_user postgres) o con la clave de
  -- servicio no hay sesión de usuario: se permite. Desde la app, solo el
  -- organizador de la carrera o un admin.
  IF session_user <> 'postgres' AND auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Hay que iniciar sesión' USING ERRCODE = '42501';
    END IF;
    IF NOT (public.puede_gestionar_carrera(p_race_id) OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
      RAISE EXCEPTION 'No puedes duplicar esta carrera' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_nombre IS NULL OR btrim(p_nombre) = '' THEN
    RAISE EXCEPTION 'La carrera nueva necesita nombre';
  END IF;

  SELECT * INTO v_origen FROM public.races WHERE id = p_race_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Carrera no encontrada';
  END IF;

  v_delta := p_fecha - v_origen.date;
  v_slug  := NULLIF(btrim(p_slug), '');
  IF v_slug IS NOT NULL AND EXISTS (SELECT 1 FROM public.races WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'Ya existe una carrera con el slug %', v_slug;
  END IF;

  -- ---------------------------------------------------------------- carrera
  -- Ojo: jsonb_populate_record pone NULL en las claves que faltan y un NULL
  -- explícito NO dispara el DEFAULT, así que id y fechas se dan siempre.
  v_fila := to_jsonb(v_origen)
    || jsonb_build_object(
         'id', v_nuevo, 'created_at', now(), 'updated_at', now(),
         'name', btrim(p_nombre),
         'slug', v_slug,                       -- NULL: lo genera el trigger desde el nombre
         'date', p_fecha,
         'is_visible', false,
         'is_featured', false,
         'join_code', NULL,
         'registration_opens',  v_origen.registration_opens  + make_interval(days => v_delta),
         'registration_closes', v_origen.registration_closes + make_interval(days => v_delta)
       );
  INSERT INTO public.races SELECT * FROM jsonb_populate_record(NULL::public.races, v_fila);

  -- ------------------------------------------------------------- distancias
  FOR v_dist IN SELECT * FROM public.race_distances WHERE race_id = p_race_id ORDER BY display_order, created_at LOOP
    v_id := gen_random_uuid();
    v_dist_map := v_dist_map || jsonb_build_object(v_dist.id::text, v_id);
    v_fila := to_jsonb(v_dist)
      || jsonb_build_object(
           'id', v_id, 'race_id', v_nuevo, 'created_at', now(), 'updated_at', now(),
           'next_bib', v_dist.bib_start,
           'registration_opens',  v_dist.registration_opens  + make_interval(days => v_delta),
           'registration_closes', v_dist.registration_closes + make_interval(days => v_delta)
         );
    INSERT INTO public.race_distances SELECT * FROM jsonb_populate_record(NULL::public.race_distances, v_fila);

    -- El trigger de race_distances siembra los campos de sistema; se quitan
    -- para copiar el formulario tal cual estaba (orden, visibilidad, extras).
    -- Si la distancia original no tenía formulario, se dejan los sembrados.
    IF EXISTS (SELECT 1 FROM public.registration_form_fields WHERE race_distance_id = v_dist.id) THEN
      DELETE FROM public.registration_form_fields WHERE race_distance_id = v_id;
    END IF;

    INSERT INTO public.race_distance_prices (race_distance_id, price, start_datetime, end_datetime)
    SELECT v_id, price, start_datetime + make_interval(days => v_delta), end_datetime + make_interval(days => v_delta)
    FROM public.race_distance_prices WHERE race_distance_id = v_dist.id;

    -- El trigger auto_create_wave_after_distance ya creó la oleada de la
    -- distancia nueva (race_distance_id es UNIQUE): se le copian nombre y
    -- hora de la original, desplazada los mismos días que la carrera
    INSERT INTO public.race_waves (race_id, race_distance_id, wave_name, start_time)
    SELECT v_nuevo, v_id, wave_name, start_time + make_interval(days => v_delta)
    FROM public.race_waves WHERE race_distance_id = v_dist.id
    ON CONFLICT (race_distance_id) DO UPDATE SET wave_name = EXCLUDED.wave_name, start_time = EXCLUDED.start_time;
  END LOOP;

  -- Categorías (con o sin distancia)
  FOR v_fila IN
    SELECT to_jsonb(c)
      || jsonb_build_object(
           'id', gen_random_uuid(), 'created_at', now(), 'updated_at', now(),
           'race_id', v_nuevo,
           'race_distance_id', CASE WHEN c.race_distance_id IS NULL THEN NULL ELSE (v_dist_map->>c.race_distance_id::text)::uuid END,
           'age_calculation_date', c.age_calculation_date + v_delta
         )
    FROM public.race_categories c WHERE c.race_id = p_race_id
  LOOP
    INSERT INTO public.race_categories SELECT * FROM jsonb_populate_record(NULL::public.race_categories, v_fila);
  END LOOP;

  -- Formulario: campos por carrera y por distancia, en dos pasadas para
  -- reasignar depends_on_field_id (un campo puede depender de otro)
  FOR v_campo IN
    SELECT * FROM public.registration_form_fields
    WHERE race_id = p_race_id OR race_distance_id IN (SELECT id FROM public.race_distances WHERE race_id = p_race_id)
    ORDER BY field_order
  LOOP
    v_id := gen_random_uuid();
    v_campo_map := v_campo_map || jsonb_build_object(v_campo.id::text, v_id);
    v_fila := to_jsonb(v_campo)
      || jsonb_build_object(
           'id', v_id, 'created_at', now(), 'updated_at', now(),
           'race_id', CASE WHEN v_campo.race_id IS NULL THEN NULL ELSE v_nuevo END,
           'race_distance_id', CASE WHEN v_campo.race_distance_id IS NULL THEN NULL ELSE (v_dist_map->>v_campo.race_distance_id::text)::uuid END
         );
    INSERT INTO public.registration_form_fields SELECT * FROM jsonb_populate_record(NULL::public.registration_form_fields, v_fila);
  END LOOP;
  UPDATE public.registration_form_fields f
     SET depends_on_field_id = (v_campo_map->>f.depends_on_field_id::text)::uuid
   WHERE f.depends_on_field_id IS NOT NULL
     AND (f.race_id = v_nuevo OR f.race_distance_id IN (SELECT id FROM public.race_distances WHERE race_id = v_nuevo))
     AND v_campo_map ? f.depends_on_field_id::text;

  -- Puntos de control (sin punto de cronometraje: los tokens no se copian)
  FOR v_fila IN
    SELECT to_jsonb(k)
      || jsonb_build_object(
           'id', gen_random_uuid(), 'created_at', now(), 'updated_at', now(),
           'race_id', v_nuevo,
           'race_distance_id', CASE WHEN k.race_distance_id IS NULL THEN NULL ELSE (v_dist_map->>k.race_distance_id::text)::uuid END,
           'timing_point_id', NULL
         )
    FROM public.race_checkpoints k WHERE k.race_id = p_race_id
  LOOP
    INSERT INTO public.race_checkpoints SELECT * FROM jsonb_populate_record(NULL::public.race_checkpoints, v_fila);
  END LOOP;

  -- Reglamento (versión 1, sin publicar hasta revisarlo)
  SELECT id INTO v_reg_old FROM public.race_regulations WHERE race_id = p_race_id ORDER BY version DESC LIMIT 1;
  IF v_reg_old IS NOT NULL THEN
    INSERT INTO public.race_regulations (race_id, published, version) VALUES (v_nuevo, false, 1) RETURNING id INTO v_reg_new;
    INSERT INTO public.race_regulation_sections (regulation_id, section_type, title, content, is_required, section_order)
    SELECT v_reg_new, section_type, title, content, is_required, section_order
    FROM public.race_regulation_sections WHERE regulation_id = v_reg_old;
  END IF;

  INSERT INTO public.race_faqs (race_id, question, answer, display_order)
  SELECT v_nuevo, question, answer, display_order FROM public.race_faqs WHERE race_id = p_race_id;

  INSERT INTO public.race_cancellation_tiers (race_id, days_before, refund_percent)
  SELECT v_nuevo, days_before, refund_percent FROM public.race_cancellation_tiers WHERE race_id = p_race_id;

  INSERT INTO public.race_team_discount_tiers (race_id, min_members, discount_type, discount_value)
  SELECT v_nuevo, min_members, discount_type, discount_value FROM public.race_team_discount_tiers WHERE race_id = p_race_id;

  FOR v_fila IN
    SELECT to_jsonb(c)
      || jsonb_build_object('race_id', v_nuevo, 'created_at', now(), 'updated_at', now(), 'fecha_limite', c.fecha_limite + make_interval(days => v_delta))
    FROM public.race_cesion_config c WHERE c.race_id = p_race_id
  LOOP
    INSERT INTO public.race_cesion_config SELECT * FROM jsonb_populate_record(NULL::public.race_cesion_config, v_fila);
  END LOOP;

  INSERT INTO public.race_document_requirements (race_id, title, description, category, is_required, days_before_race, display_order)
  SELECT v_nuevo, title, description, category, is_required, days_before_race, display_order
  FROM public.race_document_requirements WHERE race_id = p_race_id;

  FOR v_fila IN
    SELECT to_jsonb(b) || jsonb_build_object('id', gen_random_uuid(), 'created_at', now(), 'updated_at', now(), 'race_id', v_nuevo)
    FROM public.bib_designs b WHERE b.race_id = p_race_id
  LOOP
    INSERT INTO public.bib_designs SELECT * FROM jsonb_populate_record(NULL::public.bib_designs, v_fila);
  END LOOP;

  -- Web propia: patrocinadores y contenido, desactivada hasta revisarla
  IF p_copiar_web THEN
    INSERT INTO public.race_sponsors (race_id, name, logo_url, website, level, display_order)
    SELECT v_nuevo, name, logo_url, website, level, display_order FROM public.race_sponsors WHERE race_id = p_race_id;

    INSERT INTO public.race_web (race_id, contenido, plantilla, tema, activa)
    SELECT v_nuevo, contenido, plantilla, tema, false FROM public.race_web WHERE race_id = p_race_id;
  END IF;

  RETURN v_nuevo;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.duplicar_carrera(uuid, text, date, text, boolean) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.duplicar_carrera(uuid, text, date, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.duplicar_carrera(uuid, text, date, text, boolean) IS
  'Copia una carrera como nueva edición (oculta), desplazando todas las fechas. Solo organizador de la carrera o admin.';

-- =============================================================================
-- Comprobaciones
-- =============================================================================
SELECT has_function_privilege('anon', 'public.duplicar_carrera(uuid, text, date, text, boolean)', 'EXECUTE') AS anon_debe_ser_false;
SELECT has_function_privilege('authenticated', 'public.duplicar_carrera(uuid, text, date, text, boolean)', 'EXECUTE') AS authenticated_debe_ser_true;
