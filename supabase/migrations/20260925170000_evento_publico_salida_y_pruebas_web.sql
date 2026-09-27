-- =============================================================================
-- evento_publico: hora de salida sin desfase y pruebas enriquecidas desde race_web
--
-- 1. race_waves.start_time guarda la hora de pared "como si fuera UTC" (así la
--    escribe DistanceManagement y así la pinta RaceDetail con formatLocalTime).
--    La RPC la convertía a Europe/Madrid y daba una hora de más (Sarrio salía
--    a las 11:30 en vez de a las 10:30). Ahora se lee sin convertir.
-- 2. race_web.contenido.pruebas[] (por id de race_distance o por nombre)
--    aporta a cada prueba lo que Camberas no modela: descripcion, relato,
--    avituallamientos (si no hay race_checkpoints), terreno, marcaje, color…
--    Lo calculado manda; la web rellena lo que falta.
-- Sustituye la función de 20260924180000 (mismos permisos: anon y authenticated).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.evento_publico(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH ra AS (
    SELECT r.*
    FROM races r
    -- Públicas para todos; las ocultas solo para quien las gestiona o un admin
    -- (así el panel puede previsualizar la web antes de publicar la carrera)
    WHERE (r.is_visible = true
           OR (auth.uid() IS NOT NULL
               AND (public.puede_gestionar_carrera(r.id) OR public.has_role(auth.uid(), 'admin'::app_role))))
      AND (r.slug = p_slug OR r.id::text = lower(p_slug))
    LIMIT 1
  ),
  web AS (
    -- Sub-objetos saneados: si el organizador guardó "inscripcion": null (o un
    -- texto) en race_web, el || de abajo reventaría. Solo se fusiona lo que es objeto.
    SELECT c, plantilla, tema, activa,
           CASE WHEN jsonb_typeof(c->'inscripcion') = 'object' THEN c->'inscripcion' ELSE '{}'::jsonb END AS ins,
           CASE WHEN jsonb_typeof(c->'lugar')       = 'object' THEN c->'lugar'       ELSE '{}'::jsonb END AS lug,
           CASE WHEN jsonb_typeof(c->'organizador') = 'object' THEN c->'organizador' ELSE '{}'::jsonb END AS org,
           CASE WHEN jsonb_typeof(c->'contacto')    = 'object' THEN c->'contacto'    ELSE '{}'::jsonb END AS con,
           CASE WHEN jsonb_typeof(c->'imagenes')    = 'object' THEN c->'imagenes'    ELSE '{}'::jsonb END AS img,
           CASE WHEN jsonb_typeof(c->'reglamento')  = 'object' THEN c->'reglamento'  ELSE '{}'::jsonb END AS reg,
           CASE WHEN jsonb_typeof(c->'infoPractica') = 'object' THEN c->'infoPractica' ELSE '{}'::jsonb END AS inf,
           CASE WHEN jsonb_typeof(c->'camiseta')    = 'object' THEN c->'camiseta'    ELSE '{}'::jsonb END AS cam,
           CASE WHEN jsonb_typeof(c->'sanitario')   = 'object' THEN c->'sanitario'   ELSE '{}'::jsonb END AS san,
           CASE WHEN jsonb_typeof(c->'pruebas')     = 'array'  THEN c->'pruebas'     ELSE '[]'::jsonb END AS pru
    FROM (
      SELECT COALESCE(w.contenido, '{}'::jsonb) AS c,
             COALESCE(w.plantilla, 'gurriana')  AS plantilla,
             COALESCE(w.tema, '{}'::jsonb)      AS tema,
             COALESCE(w.activa, false)          AS activa
      FROM ra LEFT JOIN race_web w ON w.race_id = ra.id
    ) s
  ),
  dist AS (
    SELECT d.*,
           public.plazas_libres(d.id) AS libres,
           -- start_time guarda la hora de pared como si fuera UTC (así la escribe el
           -- panel y así la pinta RaceDetail): se lee igual, sin convertir
           (SELECT to_char(min(w.start_time) AT TIME ZONE 'UTC', 'HH24:MI')
              FROM race_waves w WHERE w.race_distance_id = d.id AND w.start_time IS NOT NULL) AS salida,
           COALESCE((
             SELECT p.price FROM race_distance_prices p
             WHERE p.race_distance_id = d.id
               AND now() BETWEEN p.start_datetime AND p.end_datetime
             ORDER BY p.start_datetime LIMIT 1
           ), d.price) AS precio_vigente,
           CASE
             WHEN ra.date < current_date THEN 'celebrada'
             WHEN d.registration_opens IS NOT NULL AND now() < d.registration_opens THEN 'proximamente'
             WHEN d.registration_closes IS NOT NULL AND now() > d.registration_closes THEN 'cerrada'
             WHEN d.max_participants IS NOT NULL AND public.plazas_libres(d.id) <= 0 THEN 'agotada'
             ELSE 'abierta'
           END AS estado
    FROM race_distances d, ra
    WHERE d.race_id = ra.id AND d.is_visible = true
  ),
  calculado AS (
    SELECT jsonb_build_object(
      'id',          ra.id,
      'slug',        ra.slug,
      'tenant',      ra.organizer_id,
      'nombre',      ra.name,
      'subtitulo',   ra.subtitle,
      'descripcion', ra.description,
      'deporte',     ra.race_type,
      'fecha',       ra.date,
      'lugar',       jsonb_build_object('nombre', ra.location),
      'organizador', jsonb_build_object('email', ra.organizer_email, 'web', ra.official_website_url),
      'estado',      CASE
                       WHEN ra.date < current_date THEN 'celebrada'
                       WHEN EXISTS (SELECT 1 FROM dist WHERE dist.estado = 'abierta') THEN 'abierta'
                       WHEN EXISTS (SELECT 1 FROM dist WHERE dist.estado = 'proximamente') THEN 'proximamente'
                       WHEN EXISTS (SELECT 1 FROM dist WHERE dist.estado = 'agotada') THEN 'agotada'
                       ELSE 'cerrada'
                     END,
      'imagenes',    jsonb_strip_nulls(jsonb_build_object(
                       'logo', ra.logo_url, 'cartel', ra.poster_url,
                       'hero', ra.cover_image_url, 'imagen', ra.image_url)),
      'web',         jsonb_build_object(
                       'plantilla', web.plantilla,
                       'activa',    web.activa,
                       'dominio',   (SELECT dm.hostname FROM race_domains dm
                                     WHERE dm.race_id = ra.id AND dm.principal AND dm.verificado LIMIT 1),
                       'tpvPropio', EXISTS (SELECT 1 FROM race_tpv t WHERE t.race_id = ra.id AND t.activo)),
      'marca',       COALESCE(NULLIF(web.tema, '{}'::jsonb), web.c->'marca'),
      'inscripcion', jsonb_build_object(
        'apertura',          ra.registration_opens,
        'cierre',            ra.registration_closes,
        'limiteDorsales',    ra.max_participants,
        'plazasDisponibles', CASE WHEN ra.show_available_places
                               THEN (SELECT CASE WHEN bool_and(libres IS NULL) THEN NULL ELSE sum(libres) END FROM dist)
                             END,
        'mostrarPlazas',     ra.show_available_places,
        'modalidades',       (SELECT jsonb_agg(m) FROM (
                                SELECT 'individual' AS m
                                UNION ALL
                                SELECT 'equipo' WHERE EXISTS (SELECT 1 FROM race_team_discount_tiers t WHERE t.race_id = ra.id)
                              ) x),
        'tarifas', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',       d.id,
                   'nombre',   d.name,
                   'pruebas',  jsonb_build_array(d.id),
                   'precio',   d.precio_vigente,
                   'periodos', COALESCE((
                     SELECT jsonb_agg(jsonb_build_object(
                              'desde', p.start_datetime, 'hasta', p.end_datetime, 'precio', p.price,
                              'vigente', now() BETWEEN p.start_datetime AND p.end_datetime)
                            ORDER BY p.start_datetime)
                     FROM race_distance_prices p WHERE p.race_distance_id = d.id
                   ), jsonb_build_array(jsonb_build_object('precio', d.price, 'vigente', true)))
                 ) ORDER BY d.display_order NULLS LAST, d.distance_km)
          FROM dist d
        ), '[]'::jsonb),
        'equipo', (SELECT jsonb_agg(jsonb_build_object(
                            'minMiembros', t.min_members, 'tipo', t.discount_type, 'valor', t.discount_value)
                          ORDER BY t.min_members)
                   FROM race_team_discount_tiers t WHERE t.race_id = ra.id),
        'devolucion', (SELECT jsonb_agg(jsonb_build_object(
                                'diasAntes', c.days_before, 'porcentaje', c.refund_percent)
                              ORDER BY c.days_before DESC)
                       FROM race_cancellation_tiers c WHERE c.race_id = ra.id),
        'cupones', EXISTS (SELECT 1 FROM coupons c WHERE c.race_id = ra.id AND c.active = true
                             AND (c.valid_until IS NULL OR c.valid_until > now())),
        'campos', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',           f.id,
                   'nombre',       f.field_name,
                   'etiqueta',     f.field_label,
                   'tipo',         f.field_type,
                   'opciones',     f.field_options,
                   'obligatorio',  f.is_required,
                   'sistema',      f.is_system_field,
                   'ayuda',        f.help_text,
                   'placeholder',  f.placeholder,
                   'prueba',       f.race_distance_id,
                   'dependeDe',    f.depends_on_field_id,
                   'dependeValor', f.depends_on_value)
                 ORDER BY f.field_order)
          FROM registration_form_fields f
          WHERE f.is_visible = true
            AND (f.race_id = ra.id OR f.race_distance_id IN (SELECT id FROM dist))
        ), '[]'::jsonb),
        'pasarela', jsonb_build_object('proveedor', 'camberas',
                                       'url', 'https://camberas.com/race/' || COALESCE(ra.slug, ra.id::text))
      ),
      'pruebas', COALESCE((
        SELECT jsonb_agg(
               -- race_web.contenido.pruebas[] (por id de race_distance o por
               -- nombre) aporta descripcion, relato, avituallamientos, terreno…
               -- Lo calculado manda; la web rellena lo que falta.
               COALESCE((SELECT e - 'id' FROM jsonb_array_elements(web.pru) e
                          WHERE jsonb_typeof(e) = 'object'
                            AND (e->>'id' = d.id::text OR lower(e->>'nombre') = lower(d.name))
                          LIMIT 1), '{}'::jsonb)
               || jsonb_strip_nulls(jsonb_build_object(
                 'id',             d.id,
                 'nombre',         d.name,
                 'tipo',           d.kind,
                 'competitiva',    d.competitive,
                 'chip',           d.chip,
                 'distancia',      round(d.distance_km * 1000),
                 -- "12,2 km", "6 km", "10 km": dos decimales, sin ceros de relleno
                 'distanciaTexto', replace(rtrim(rtrim(to_char(d.distance_km, 'FM999990.00'), '0'), '.'), '.', ',') || ' km',
                 'desnivelPos',    d.elevation_gain,
                 'desnivelNeg',    d.elevation_loss,
                 'altMax',         d.alt_max,
                 'altMin',         d.alt_min,
                 'salida',         d.salida,
                 'limite',         d.cutoff_time,
                 'lugarSalida',    d.start_location,
                 'lugarMeta',      d.finish_location,
                 'plazas',         CASE WHEN ra.show_available_places THEN d.max_participants END,
                 'plazasLibres',   CASE WHEN ra.show_available_places THEN d.libres END,
                 'estado',         d.estado,
                 'precio',         d.precio_vigente,
                 'apertura',       d.registration_opens,
                 'cierre',         d.registration_closes,
                 'imagen',         d.image_url,
                 'rutometro',      (SELECT jsonb_strip_nulls(jsonb_build_object(
                                      'id', r.id, 'nombre', r.name, 'descripcion', r.description,
                                      'puntos', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                                                   'km', i.km_total, 'kmParcial', i.km_partial, 'tipo', i.item_type,
                                                   'lat', i.latitude, 'lon', i.longitude,
                                                   'etiqueta', t.label, 'icono', t.icon, 'descripcion', i.description,
                                                   'notas', i.notes, 'via', i.via, 'altitud', i.altitude,
                                                   'control', i.is_checkpoint, 'destacado', i.is_highlighted,
                                                   'foto', COALESCE(i.photo_16_9_url, i.photo_9_16_url)))
                                                 ORDER BY i.item_order, i.km_total)
                                         FROM roadbook_items i LEFT JOIN roadbook_item_types t ON t.id = i.item_type_id
                                         -- Solo los puntos con sentido: el rutómetro generado desde el GPX
                                         -- guarda además cada punto del track (item_type 'point', miles)
                                         WHERE i.roadbook_id = r.id
                                           AND (i.is_highlighted OR i.is_checkpoint OR i.item_type <> 'point'))))
                                    FROM roadbooks r WHERE r.race_distance_id = d.id ORDER BY r.created_at LIMIT 1),
                 'track',          CASE WHEN d.gpx_file_url IS NULL THEN NULL
                                        ELSE jsonb_build_object('gpx', d.gpx_file_url) END,
                 'categorias',     (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                                             'id', c.id, 'nombre', c.name, 'corto', c.short_name,
                                             'sexo', c.gender, 'edadMin', c.min_age, 'edadMax', c.max_age))
                                           ORDER BY c.display_order)
                                    FROM race_categories c
                                    WHERE c.race_distance_id = d.id),
                 'avituallamientos', COALESCE(
                                      (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                                               'km', k.distance_km, 'nombre', k.name, 'lugar', k.lugar,
                                               'lat', k.latitude, 'lon', k.longitude,
                                               'tipo', lower(k.checkpoint_type), 'corte', k.max_time))
                                             ORDER BY k.checkpoint_order)
                                      FROM race_checkpoints k
                                      WHERE k.race_distance_id = d.id),
                                      (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                                               'km', i.km_total, 'nombre', i.description, 'lugar', i.via,
                                               'lat', i.latitude, 'lon', i.longitude,
                                               'icono', (SELECT t.icon FROM roadbook_item_types t WHERE t.id = i.item_type_id),
                                               'tipo', CASE i.item_type WHEN 'aid_station' THEN 'completo'
                                                                        WHEN 'refreshment' THEN 'liquido'
                                                                        WHEN 'finish' THEN 'finish'
                                                                        WHEN 'start' THEN 'salida'
                                                                        WHEN 'medical' THEN 'sanitario'
                                                                        ELSE 'control' END))
                                             ORDER BY i.item_order, i.km_total)
                                      FROM roadbook_items i JOIN roadbooks r ON r.id = i.roadbook_id
                                      WHERE r.race_distance_id = d.id
                                        AND (i.item_type IN ('aid_station', 'refreshment', 'checkpoint', 'start', 'finish', 'medical') OR i.is_checkpoint)))
               )) ORDER BY d.display_order NULLS LAST, d.distance_km)
        FROM dist d, ra, web
      ), '[]'::jsonb),
      'categorias', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                              'id', c.id, 'nombre', c.name, 'corto', c.short_name,
                              'sexo', c.gender, 'edadMin', c.min_age, 'edadMax', c.max_age,
                              'criterio', ra.category_age_reference))
                            ORDER BY c.display_order)
                     FROM race_categories c
                     WHERE c.race_id = ra.id AND c.race_distance_id IS NULL),
      'reglamento', (SELECT jsonb_build_object(
                              'version', g.version,
                              -- Líneas con viñeta de la sección de material obligatorio
                              'materialObligatorio', (SELECT jsonb_agg(l ORDER BY n) FROM (
                                  SELECT btrim(regexp_replace(x, '^\s*[•\-\*·]\s*', '')) AS l, n
                                  FROM race_regulation_sections s2, regexp_split_to_table(s2.content, E'\n') WITH ORDINALITY AS t(x, n)
                                  WHERE s2.regulation_id = g.id AND s2.section_type = 'mandatory_gear' AND btrim(x) ~ '^[•\-\*·]') m),
                              'normas', (SELECT jsonb_agg(l ORDER BY n) FROM (
                                  SELECT btrim(regexp_replace(x, '^\s*[•\-\*·]\s*', '')) AS l, n
                                  FROM race_regulation_sections s2, regexp_split_to_table(s2.content, E'\n') WITH ORDINALITY AS t(x, n)
                                  WHERE s2.regulation_id = g.id AND s2.section_type = 'disqualifications' AND btrim(x) ~ '^[•\-\*·]') m),
                              'reclamaciones', (SELECT btrim(s2.content) FROM race_regulation_sections s2
                                                WHERE s2.regulation_id = g.id AND s2.title ILIKE '%reclamac%' AND s2.section_type <> 'classifications'
                                                ORDER BY s2.section_order LIMIT 1),
                              'secciones', (SELECT jsonb_agg(jsonb_build_object(
                                                     'titulo', s.title, 'tipo', s.section_type, 'texto', s.content)
                                                   ORDER BY s.section_order)
                                            FROM race_regulation_sections s WHERE s.regulation_id = g.id))
                     FROM race_regulations g
                     WHERE g.race_id = ra.id AND g.published = true
                     ORDER BY g.version DESC LIMIT 1),
      'infoPractica', jsonb_strip_nulls(jsonb_build_object(
                        'faq', (SELECT jsonb_agg(jsonb_build_object('p', q.question, 'r', q.answer)
                                               ORDER BY q.display_order)
                                FROM race_faqs q WHERE q.race_id = ra.id))),
      'patrocinadores', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                                  'nombre', s.name, 'logo', s.logo_url, 'web', s.website, 'nivel', s.level))
                                ORDER BY s.display_order, s.name)
                         FROM race_sponsors s WHERE s.race_id = ra.id),
      'clasificaciones', jsonb_build_object(
                           'url', 'https://camberas.com/' || COALESCE(ra.slug, ra.id::text) || '/live',
                           'tiempoReal', true),
      'gps', jsonb_build_object('activo', COALESCE(ra.gps_tracking_enabled, false),
                                'url', 'https://camberas.com/' || COALESCE(ra.slug, ra.id::text) || '/gps'),
      -- Camiseta: si el formulario tiene el campo de talla, va incluida (tallas = sus opciones)
      'camiseta', (SELECT jsonb_strip_nulls(jsonb_build_object(
                     'incluida', true,
                     'tallas', CASE WHEN jsonb_typeof(f.field_options) = 'array' THEN f.field_options
                                    WHEN jsonb_typeof(f.field_options->'options') = 'array' THEN f.field_options->'options' END))
                   FROM registration_form_fields f
                   WHERE f.field_name = 'tshirt_size' AND f.is_visible = true
                     AND (f.race_id = ra.id OR f.race_distance_id IN (SELECT id FROM dist))
                   LIMIT 1),
      -- Dispositivo sanitario: puestos de voluntariado de tipo sanitario
      'sanitario', (SELECT jsonb_build_object('medios', jsonb_agg(jsonb_build_array(COALESCE(p.needed, 1)::text, p.name) ORDER BY p.post_order NULLS LAST, p.name))
                    FROM race_posts p JOIN race_post_types t ON t.id = p.post_type_id
                    WHERE p.race_id = ra.id AND t.name = 'sanitario'
                    HAVING count(*) > 0),
      'contacto', jsonb_strip_nulls(jsonb_build_object('email', ra.organizer_email)),
      'fuente', jsonb_build_object('origen', 'camberas', 'generado', now())
    ) AS j
    FROM ra, web
  )
  -- race_web pisa lo calculado clave a clave; inscripcion, lugar, organizador,
  -- contacto, imagenes, reglamento e infoPractica se fusionan un nivel más adentro para no perder lo
  -- calculado; pruebas/tarifas/campos/web siempre son los de las tablas.
  SELECT jsonb_strip_nulls(
           calculado.j
           -- subtitulo y descripcion son de races: la web no los pisa
           || (web.c - 'pruebas' - 'inscripcion' - 'lugar' - 'organizador' - 'contacto' - 'imagenes' - 'web' - 'marca'
                     - 'reglamento' - 'infoPractica' - 'subtitulo' - 'descripcion' - 'camiseta' - 'sanitario')
           || jsonb_build_object(
                'inscripcion', (calculado.j->'inscripcion') || web.ins
                                 || jsonb_build_object('tarifas', calculado.j->'inscripcion'->'tarifas',
                                                       'campos',  calculado.j->'inscripcion'->'campos'),
                'lugar',       (calculado.j->'lugar')       || web.lug,
                'organizador', (calculado.j->'organizador') || (web.org - 'web'),
                'contacto',    (calculado.j->'contacto')    || (web.con - 'email'),
                'imagenes',    (calculado.j->'imagenes')    || web.img,
                -- NULLIF: sin reglamento ni info en ningún lado, la clave no sale
                -- Tablas primero: lo de la web solo rellena lo que el reglamento por secciones no dé
                'reglamento',  NULLIF(web.reg || jsonb_strip_nulls(COALESCE(calculado.j->'reglamento', '{}'::jsonb)), '{}'::jsonb),
                'camiseta',    NULLIF(web.cam || jsonb_strip_nulls(COALESCE(calculado.j->'camiseta', '{}'::jsonb)), '{}'::jsonb),
                'sanitario',   NULLIF(web.san || jsonb_strip_nulls(COALESCE(calculado.j->'sanitario', '{}'::jsonb)), '{}'::jsonb),
                'infoPractica', NULLIF(COALESCE(calculado.j->'infoPractica', '{}'::jsonb) || (web.inf - 'faq'), '{}'::jsonb)
              )
         )
  FROM calculado, web;
$fn$;

GRANT EXECUTE ON FUNCTION public.evento_publico(text) TO anon, authenticated;

-- =============================================================================
-- Comprobaciones
-- =============================================================================
-- Salidas: deben coincidir con lo que enseña la ficha (Sarrio 10:30 / 11:30 / 10:31)
SELECT p->>'nombre' AS prueba, p->>'salida' AS salida
  FROM jsonb_array_elements(public.evento_publico('desafio-sarrio')->'pruebas') p;
SELECT has_function_privilege('anon', 'public.evento_publico(text)', 'EXECUTE') AS anon_debe_ser_true;
