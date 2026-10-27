-- ============================================================
-- GPS PÚBLICO POR RPC — FASE 1 de 2 (27-oct-2026). SOLO AÑADE.
--
-- La revisión de seguridad del 27-oct encontró que cualquiera con la clave
-- anónima lee gps_positions entera (posición, batería y device_id de cada
-- móvil) y que get_live_gps_positions da nombre completo, batería e id del
-- token. Esta fase prepara el cierre sin romper nada de lo que hay hoy:
--
--   mapa_publico          mapa del público: dorsal, «Laura G.», posición.
--                         Sin batería, sin device_id y sin ids internos: la
--                         clave de cada dorsal es opaca (12 cifras de su md5).
--   recorrido_publico     el recorrido de un dorsal, pedido por esa clave.
--   pantalla_posiciones   la carpa (/pantalla/:token): nombre completo y
--                         batería, solo con un token de pantalla activo.
--   posiciones_motos      la última posición de las motos (overlays de TV).
--   get_latest_gps_positions  el panel del organizador, solo sus carreras.
--   recorrido_privado     el recorrido completo para el organizador, el admin
--                         o el dueño del dorsal (GPX de grupetta).
--   monitor_gps           el monitor de pruebas, con token de pantalla.
--
-- Y arregla get_live_gps_positions (mismo resultado): el planificador
-- calculaba la ventana de captura una vez por DORSAL y no por recorrido
-- (878 llamadas en Entre Viñedos, 255-280 ms por petición, cada 15 s y por
-- espectador). Medido en producción con ROLLBACK: 280 ms → 7 ms.
--
-- La fase 2 (20261027210000) cierra la lectura directa cuando la web nueva
-- ya está publicada.
-- ============================================================

-- ── Nombre público: «Laura G.» ───────────────────────────────────────────────
-- Con la inscripción se usa su nombre de pila entero («Jose Ignacio R.»); sin
-- ella, la primera palabra y la inicial de la segunda: nunca más de una inicial
-- del apellido. Los nombres en mayúsculas se pasan a «Claudia».
CREATE OR REPLACE FUNCTION public.nombre_publico(p_completo text, p_nombre text DEFAULT NULL, p_apellidos text DEFAULT NULL)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $f$
  WITH n AS (
    SELECT regexp_replace(trim(coalesce(p_completo, '')), '\s+', ' ', 'g') AS completo,
           regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g') AS nombre,
           regexp_replace(trim(coalesce(p_apellidos, '')), '\s+', ' ', 'g') AS apellidos
  ), partes AS (
    SELECT completo, nombre <> '' AND apellidos <> '' AS con_inscripcion,
           CASE WHEN nombre <> '' AND apellidos <> '' THEN nombre ELSE split_part(completo, ' ', 1) END AS pila,
           CASE WHEN nombre <> '' AND apellidos <> '' THEN apellidos ELSE split_part(completo, ' ', 2) END AS resto
      FROM n
  )
  SELECT CASE
    WHEN pila = '' THEN NULL
    -- Dorsal sin nombre (generar_token_corredor pone «Dorsal 12»): tal cual
    WHEN NOT con_inscripcion AND completo ~* '^dorsal \S+$' THEN completo
    ELSE CASE WHEN pila = upper(pila) THEN initcap(pila) ELSE pila END
         || CASE WHEN resto <> '' THEN ' ' || upper(left(resto, 1)) || '.' ELSE '' END
  END
  FROM partes
$f$;

REVOKE EXECUTE ON FUNCTION public.nombre_publico(text, text, text) FROM anon, authenticated, PUBLIC;

-- ── Núcleo común del mapa (sin GRANT: solo lo llaman las funciones de abajo) ──
-- p_ahora es un parámetro para poder ensayar el día de carrera con ROLLBACK.
-- Corredores: última posición dentro de la ventana de su recorrido, mientras
-- dura; al cerrarse todas las ventanas, «finalizado» deja ver la última
-- posición 7 días. Motos y organización: últimas 24 h.
CREATE OR REPLACE FUNCTION public.mapa_carrera_interno(p_race_id uuid, p_distance_id uuid, p_ahora timestamptz)
RETURNS TABLE(clave text, token_id uuid, dorsal text, nombre text, nombre_corto text, recorrido uuid,
              lat double precision, lng double precision, ts timestamptz, rumbo real,
              velocidad double precision, bateria integer, tipo text, finalizado boolean)
LANGUAGE sql STABLE
SET search_path = public
AS $f$
  WITH ventanas AS MATERIALIZED (
    -- UNA vez por recorrido (no por dorsal)
    SELECT rd.id AS dist_id, cw.t_ini, cw.t_fin
      FROM race_distances rd CROSS JOIN LATERAL gps_capture_window(rd.id::text) cw
     WHERE rd.race_id = p_race_id AND (p_distance_id IS NULL OR rd.id = p_distance_id)
  ), modo AS MATERIALIZED (
    SELECT coalesce(bool_and(p_ahora > v.t_fin), false)
           AND (SELECT r.date FROM races r WHERE r.id = p_race_id) >= hoy_local() - 7 AS finalizado
      FROM ventanas v
  ), inscritos AS MATERIALIZED (
    SELECT DISTINCT ON (reg.race_distance_id, reg.bib_number)
           reg.race_distance_id, reg.bib_number::text AS dorsal, reg.first_name, reg.last_name
      FROM registrations reg
     WHERE reg.race_id = p_race_id AND reg.bib_number IS NOT NULL
     ORDER BY reg.race_distance_id, reg.bib_number, reg.created_at DESC
  ), dorsales AS MATERIALIZED (
    SELECT gt.id AS token_id, gt.bib_number, gt.participant_name, nullif(trim(gt.name_tv), '') AS name_tv,
           v.dist_id, v.t_ini, v.t_fin,
           CASE WHEN EXISTS (SELECT 1 FROM race_motos m WHERE m.token_id = gt.id) THEN 'moto'
                WHEN gt.es_organizacion THEN 'organizacion' ELSE 'corredor' END AS tipo
      FROM ventanas v JOIN gps_tokens gt ON gt.event_id = v.dist_id
  )
  SELECT left(md5(d.token_id::text), 12), d.token_id, d.bib_number,
         coalesce(d.participant_name, d.name_tv),
         CASE WHEN d.tipo <> 'corredor' THEN coalesce(d.name_tv, d.participant_name)
              ELSE coalesce(d.name_tv, nombre_publico(d.participant_name, i.first_name, i.last_name), 'Corredor') END,
         d.dist_id, ult.lat, ult.lng, ult."timestamp", ult.heading, ult.speed, ult.battery, d.tipo, m.finalizado
    FROM dorsales d
    CROSS JOIN modo m
    LEFT JOIN inscritos i ON i.race_distance_id = d.dist_id AND i.dorsal = d.bib_number
    JOIN LATERAL (
      SELECT gp.lat, gp.lng, gp."timestamp", gp.heading, gp.speed, gp.battery
        FROM gps_positions gp
       WHERE gp.token_id = d.token_id
         AND gp."timestamp" >= CASE WHEN d.tipo = 'corredor' THEN d.t_ini ELSE p_ahora - interval '24 hours' END
         AND gp."timestamp" <= CASE WHEN d.tipo = 'corredor' THEN d.t_fin ELSE 'infinity'::timestamptz END
       ORDER BY gp."timestamp" DESC
       LIMIT 1
    ) ult ON true
   -- El filtro va antes del LATERAL: un dorsal fuera de su ventana no se busca
   WHERE d.tipo <> 'corredor' OR p_ahora <= d.t_fin OR m.finalizado
$f$;

REVOKE EXECUTE ON FUNCTION public.mapa_carrera_interno(uuid, uuid, timestamptz) FROM anon, authenticated, PUBLIC;

-- ── Mapa del público ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mapa_publico(p_race_id uuid, p_distance_id uuid DEFAULT NULL)
RETURNS TABLE(clave text, dorsal text, nombre text, recorrido uuid, lat double precision, lng double precision,
              ts timestamptz, rumbo real, velocidad double precision, tipo text, finalizado boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $f$
  SELECT m.clave, m.dorsal, m.nombre_corto, m.recorrido, m.lat, m.lng, m.ts, m.rumbo, m.velocidad,
         m.tipo, m.finalizado
    FROM mapa_carrera_interno(p_race_id, p_distance_id, now()) m
$f$;

REVOKE EXECUTE ON FUNCTION public.mapa_publico(uuid, uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.mapa_publico(uuid, uuid) TO anon, authenticated;

-- ── Pantalla de la carpa: nombre completo y batería, con token de pantalla ────
CREATE OR REPLACE FUNCTION public.pantalla_posiciones(p_token uuid, p_distance_id uuid DEFAULT NULL)
RETURNS TABLE(clave text, dorsal text, nombre text, recorrido uuid, lat double precision, lng double precision,
              ts timestamptz, rumbo real, velocidad double precision, bateria integer, tipo text,
              finalizado boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $f$
  SELECT m.clave, m.dorsal, m.nombre, m.recorrido, m.lat, m.lng, m.ts, m.rumbo, m.velocidad,
         m.bateria, m.tipo, m.finalizado
    FROM pantallas_seguimiento p
    CROSS JOIN LATERAL mapa_carrera_interno(p.race_id, p_distance_id, now()) m
   WHERE p.token = p_token AND p.activa IS TRUE
$f$;

REVOKE EXECUTE ON FUNCTION public.pantalla_posiciones(uuid, uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.pantalla_posiciones(uuid, uuid) TO anon, authenticated;

-- ── Recorrido de un dorsal por su clave pública ──────────────────────────────
-- Mismas reglas que el mapa: corredores dentro de su ventana y hasta 7 días
-- después de la carrera; motos y organización, últimas 24 h. Muestreado a
-- 3.000 puntos como mucho (el API corta en 1.000 filas: va en un jsonb).
CREATE OR REPLACE FUNCTION public.recorrido_publico(p_race_id uuid, p_clave text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $f$
DECLARE
  v_token uuid; v_dist uuid; v_org boolean; v_fecha date;
  v_ini timestamptz; v_fin timestamptz; v_total int; v_paso int; v_out jsonb;
BEGIN
  SELECT gt.id, rd.id, coalesce(gt.es_organizacion, false) OR EXISTS (SELECT 1 FROM race_motos m WHERE m.token_id = gt.id), r.date
    INTO v_token, v_dist, v_org, v_fecha
    FROM race_distances rd
    JOIN races r ON r.id = rd.race_id
    JOIN gps_tokens gt ON gt.event_id = rd.id
   WHERE rd.race_id = p_race_id AND left(md5(gt.id::text), 12) = p_clave
   LIMIT 1;
  IF v_token IS NULL THEN RETURN '[]'::jsonb; END IF;

  IF v_org THEN
    v_ini := now() - interval '24 hours';
    v_fin := now();
  ELSE
    SELECT cw.t_ini, cw.t_fin INTO v_ini, v_fin FROM gps_capture_window(v_dist::text) cw;
    IF NOT (now() <= v_fin OR v_fecha >= hoy_local() - 7) THEN RETURN '[]'::jsonb; END IF;
  END IF;

  SELECT count(*) INTO v_total
    FROM gps_positions gp
   WHERE gp.token_id = v_token AND gp."timestamp" BETWEEN v_ini AND v_fin
     AND (gp.accuracy IS NULL OR gp.accuracy <= 100);
  v_paso := GREATEST(1, ceil(v_total::numeric / 3000)::int);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('lat', d.lat, 'lng', d.lng, 'ts', d.ts, 'speed', d.speed) ORDER BY d.ts), '[]'::jsonb)
    INTO v_out
    FROM (SELECT gp.lat, gp.lng, gp."timestamp" AS ts, gp.speed,
                 row_number() OVER (ORDER BY gp."timestamp") AS n
            FROM gps_positions gp
           WHERE gp.token_id = v_token AND gp."timestamp" BETWEEN v_ini AND v_fin
             AND (gp.accuracy IS NULL OR gp.accuracy <= 100)) d
   WHERE v_paso = 1 OR d.n % v_paso = 0 OR d.n = 1 OR d.n = v_total;
  RETURN v_out;
END
$f$;

REVOKE EXECUTE ON FUNCTION public.recorrido_publico(uuid, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.recorrido_publico(uuid, text) TO anon, authenticated;

-- ── Motos para los overlays de TV ────────────────────────────────────────────
-- Solo responde por tokens que son de una moto (race_motos.token_id).
CREATE OR REPLACE FUNCTION public.posiciones_motos(p_token_ids uuid[])
RETURNS TABLE(token_id uuid, lat double precision, lng double precision, speed double precision,
              battery integer, "timestamp" timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $f$
  SELECT m.token_id, ult.lat, ult.lng, ult.speed, ult.battery, ult."timestamp"
    FROM (SELECT DISTINCT rm.token_id FROM race_motos rm WHERE rm.token_id = ANY(p_token_ids)) m
    JOIN LATERAL (
      SELECT gp.lat, gp.lng, gp.speed, gp.battery, gp."timestamp"
        FROM gps_positions gp
       WHERE gp.token_id = m.token_id
       ORDER BY gp."timestamp" DESC
       LIMIT 1
    ) ult ON true
$f$;

REVOKE EXECUTE ON FUNCTION public.posiciones_motos(uuid[]) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.posiciones_motos(uuid[]) TO anon, authenticated;

-- ── Panel del organizador: última posición de cada dorsal de SUS carreras ────
-- Sustituye a la versión del 5-ago (20260805220000), que nunca se aplicó y
-- se la daba a cualquiera. Sin ella el panel leía gps_positions a pelo y
-- solo veía las 1.000 filas más recientes de todas las carreras.
CREATE OR REPLACE FUNCTION public.get_latest_gps_positions(p_event_ids uuid[] DEFAULT NULL)
RETURNS TABLE(token_id uuid, lat double precision, lng double precision, speed double precision,
              altitude double precision, battery double precision, "timestamp" timestamptz,
              bib_number text, participant_name text, event_id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $f$
  SELECT g.id, ult.lat, ult.lng, ult.speed, ult.altitude, ult.battery::double precision, ult."timestamp",
         g.bib_number, g.participant_name, g.event_id::text
    FROM gps_tokens g
    JOIN race_distances d ON d.id = g.event_id
    JOIN races r ON r.id = d.race_id
    JOIN LATERAL (
      SELECT gp.lat, gp.lng, gp.speed, gp.altitude, gp.battery, gp."timestamp"
        FROM gps_positions gp
       WHERE gp.token_id = g.id
       ORDER BY gp."timestamp" DESC
       LIMIT 1
    ) ult ON true
   WHERE g.active IS TRUE
     AND (p_event_ids IS NULL OR g.event_id = ANY(p_event_ids))
     AND (r.organizer_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
$f$;

REVOKE EXECUTE ON FUNCTION public.get_latest_gps_positions(uuid[]) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_gps_positions(uuid[]) TO authenticated;

-- ── Recorrido completo para quien gestiona la carrera o es dueño del dorsal ──
CREATE OR REPLACE FUNCTION public.recorrido_privado(p_token_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $f$
DECLARE
  v_total int; v_paso int; v_out jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM gps_tokens t
      LEFT JOIN race_distances d ON d.id = t.event_id
      LEFT JOIN races r ON r.id = d.race_id
     WHERE t.id = p_token_id
       AND (t.user_id = auth.uid() OR r.organizer_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT count(*) INTO v_total
    FROM gps_positions gp
   WHERE gp.token_id = p_token_id AND (gp.accuracy IS NULL OR gp.accuracy <= 100);
  v_paso := GREATEST(1, ceil(v_total::numeric / 20000)::int);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('lat', d.lat, 'lng', d.lng, 'ts', d.ts, 'speed', d.speed,
                                               'altitude', d.altitude) ORDER BY d.ts), '[]'::jsonb)
    INTO v_out
    FROM (SELECT gp.lat, gp.lng, gp."timestamp" AS ts, gp.speed, gp.altitude,
                 row_number() OVER (ORDER BY gp."timestamp") AS n
            FROM gps_positions gp
           WHERE gp.token_id = p_token_id AND (gp.accuracy IS NULL OR gp.accuracy <= 100)) d
   WHERE v_paso = 1 OR d.n % v_paso = 0 OR d.n = 1 OR d.n = v_total;
  RETURN v_out;
END
$f$;

REVOKE EXECUTE ON FUNCTION public.recorrido_privado(uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.recorrido_privado(uuid) TO authenticated;

-- ── Monitor de pruebas (public/monitor-gps.html), con token de pantalla ──────
-- Las 20 últimas de cada dorsal en 24 h y, de todas, las 120 que llegaron
-- al servidor más tarde.
CREATE OR REPLACE FUNCTION public.monitor_gps(p_token uuid, p_distance_id uuid DEFAULT NULL, p_dorsales text[] DEFAULT NULL)
RETURNS TABLE(bib_number text, "timestamp" timestamptz, uploaded_at timestamptz, created_at timestamptz,
              battery integer, accuracy double precision)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $f$
  SELECT t.bib_number, x."timestamp", x.uploaded_at, x.created_at, x.battery, x.accuracy
    FROM pantallas_seguimiento p
    JOIN race_distances d ON d.race_id = p.race_id AND (p_distance_id IS NULL OR d.id = p_distance_id)
    JOIN gps_tokens t ON t.event_id = d.id AND (p_dorsales IS NULL OR t.bib_number = ANY(p_dorsales))
    CROSS JOIN LATERAL (
      SELECT gp."timestamp", gp.uploaded_at, gp.created_at, gp.battery, gp.accuracy
        FROM gps_positions gp
       WHERE gp.token_id = t.id AND gp."timestamp" > now() - interval '24 hours'
       ORDER BY gp."timestamp" DESC
       LIMIT 20
    ) x
   WHERE p.token = p_token AND p.activa IS TRUE
   ORDER BY x.uploaded_at DESC NULLS LAST
   LIMIT 120
$f$;

REVOKE EXECUTE ON FUNCTION public.monitor_gps(uuid, uuid, text[]) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.monitor_gps(uuid, uuid, text[]) TO anon, authenticated;

-- ── get_live_gps_positions: la ventana, una vez por recorrido ────────────────
-- Por sustitución sobre la versión viva (CLAUDE.md): cada trozo debe aparecer
-- exactamente una vez; los blancos no cuentan. Mismo resultado, mismos GRANT.
DO $$
DECLARE
  v_def text; v_pat text; v_n int;
  v_viejo text[] := ARRAY[
$v1$WITH dorsales AS (
      SELECT gt.id AS token_id,
             gt.bib_number,
             gt.participant_name,
             rd.id AS dist_id,
             COALESCE(gt.es_organizacion, false) AS es_org,
             EXISTS (SELECT 1 FROM race_motos m WHERE m.token_id = gt.id) AS es_moto,
             cw.t_ini, cw.t_fin
      FROM race_distances rd
      JOIN gps_tokens gt ON gt.event_id = rd.id
      LEFT JOIN LATERAL gps_capture_window(rd.id::text) cw ON true   -- 1 por recorrido
      WHERE rd.race_id = p_race_id
        AND (p_distance_id IS NULL OR rd.id = p_distance_id)
    )$v1$,
$v2$AND (
           ((d.es_org OR d.es_moto)
              AND gp."timestamp"::timestamptz > now() - interval '24 hours')
           OR (now() <= d.t_fin
              AND gp."timestamp"::timestamptz BETWEEN d.t_ini AND d.t_fin)
         )$v2$,
$v3$) ult ON true
  )$v3$];
  v_nuevo text[] := ARRAY[
$n1$WITH ventanas AS MATERIALIZED (
      -- La ventana de captura, UNA vez por recorrido. Dentro de dorsales el
      -- planificador la calculaba una vez por DORSAL (878 en Entre Viñedos:
      -- 255-280 ms por llamada; ahora 7 ms)
      SELECT rd.id AS dist_id, cw.t_ini, cw.t_fin
        FROM race_distances rd
        CROSS JOIN LATERAL gps_capture_window(rd.id::text) cw
       WHERE rd.race_id = p_race_id
         AND (p_distance_id IS NULL OR rd.id = p_distance_id)
    ), dorsales AS MATERIALIZED (
      SELECT gt.id AS token_id,
             gt.bib_number,
             gt.participant_name,
             v.dist_id,
             COALESCE(gt.es_organizacion, false) AS es_org,
             EXISTS (SELECT 1 FROM race_motos m WHERE m.token_id = gt.id) AS es_moto,
             v.t_ini, v.t_fin
      FROM ventanas v
      JOIN gps_tokens gt ON gt.event_id = v.dist_id
    )$n1$,
$n2$AND gp."timestamp" >= CASE WHEN d.es_org OR d.es_moto THEN now() - interval '24 hours' ELSE d.t_ini END
         AND gp."timestamp" <= CASE WHEN d.es_org OR d.es_moto THEN 'infinity'::timestamptz ELSE d.t_fin END$n2$,
$n3$) ult ON true
    -- Fuera de su ventana un corredor ni se busca (antes se recorrían todas
    -- sus posiciones hacia atrás sin encontrar ninguna)
    WHERE d.es_org OR d.es_moto OR now() <= d.t_fin
  )$n3$];
BEGIN
  v_def := pg_get_functiondef('public.get_live_gps_positions(uuid, uuid)'::regprocedure);
  FOR i IN 1 .. array_length(v_viejo, 1) LOOP
    v_pat := regexp_replace(regexp_replace(v_viejo[i], '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '\s+', '\\s+', 'g');
    SELECT count(*) INTO v_n FROM regexp_matches(v_def, v_pat, 'g');
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'get_live_gps_positions: el trozo % aparece % veces (esperado 1)', i, v_n;
    END IF;
    v_def := regexp_replace(v_def, v_pat, replace(v_nuevo[i], '\', '\\'));
  END LOOP;
  EXECUTE v_def;
END $$;

-- ── Comprobaciones ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.mapa_carrera_interno(uuid, uuid, timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_latest_gps_positions(uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.recorrido_privado(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.nombre_publico(text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'una función interna o de gestión quedó abierta a anon';
  END IF;
  IF NOT (has_function_privilege('anon', 'public.mapa_publico(uuid, uuid)', 'EXECUTE')
          AND has_function_privilege('anon', 'public.recorrido_publico(uuid, text)', 'EXECUTE')
          AND has_function_privilege('anon', 'public.pantalla_posiciones(uuid, uuid)', 'EXECUTE')
          AND has_function_privilege('anon', 'public.posiciones_motos(uuid[])', 'EXECUTE')
          AND has_function_privilege('anon', 'public.monitor_gps(uuid, uuid, text[])', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.get_latest_gps_positions(uuid[])', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.recorrido_privado(uuid)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'falta un GRANT';
  END IF;
END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;
