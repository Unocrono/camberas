-- ============================================================
-- CANAL DE MÉTRICAS DE MOTO (hilo overlays, 5-ago)
-- El circuito viejo (operator.html escribía distance_to_finish en
-- moto_positions y la app lo leía de allí) murió cuando la app pasó
-- a emitir por la tubería común gps_positions (token_id).
--
-- Circuito nuevo:
--   operator.html (anon) lee gps_positions → calcula distancia con
--   el GPX → publica en overlay_control:
--     · moto_dist_M1..M3  → JSON {dist_km, speed, battery, ts}
--     · race_order        → "2,1,3" (ya existía)
--     · moto_race_id      → uuid de la carrera activa (los overlays
--       resuelven moto ↔ token sin llevar ?race= en cada URL de vMix)
--   La app GPS Organización lee esas claves para DIST META y gap.
--
-- ADEMÁS (añadido 10-ago tras comprobar los 401 en producción):
-- el endurecimiento del 15-jul dejó las escrituras de overlay_control
-- y racetec_* solo-admin, pero TODA la cadena de paneles de vMix
-- (reloj, comentario, clasificas, leaderboard, importador RaceTec,
-- operador de motos) es anónima y escribe ahí — llevaba rota desde
-- entonces (42501 → HTTP 401). Se restaura la escritura anon de esas
-- tablas operacionales del grafismo. DELETE sigue solo-admin.
-- Riesgo asumido: son datos de grafismo/resultados públicos, como
-- antes del 15-jul; autenticar los paneles queda para otro hilo.
-- ============================================================

-- Mapeo público moto ↔ token para overlays y paneles anon.
-- (get_live_gps_positions también lo da, pero escanea gps_positions
-- entera y en frío agota el statement timeout; esto es una consulta
-- ligera e indexada, y además mapea motos que aún no han emitido.)
CREATE OR REPLACE FUNCTION public.tokens_motos_publico(p_race_id uuid)
RETURNS TABLE(bib_number text, token_id uuid, moto_name text, color text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT 'M' || m.moto_order, m.token_id, m.name, m.color
  FROM race_motos m
  JOIN gps_tokens t ON t.id = m.token_id AND t.active IS TRUE
  WHERE m.race_id = p_race_id AND m.is_active
$fn$;

GRANT EXECUTE ON FUNCTION public.tokens_motos_publico(uuid) TO anon, authenticated;

-- Los paneles de vMix escriben claves de familias distintas
-- (clock_*, man_*, atl_*, gps_*, vuelta_*, active_eid, race_order,
-- moto_dist_M#, moto_race_id…) y cada panel nuevo estrena claves:
-- una lista blanca por clave volvería a romperse en silencio.
DROP POLICY IF EXISTS "anon publica metricas moto" ON public.overlay_control;
DROP POLICY IF EXISTS "anon actualiza metricas moto" ON public.overlay_control;
DROP POLICY IF EXISTS "paneles anon escriben overlay_control" ON public.overlay_control;
CREATE POLICY "paneles anon escriben overlay_control"
  ON public.overlay_control FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "paneles anon actualizan overlay_control" ON public.overlay_control;
CREATE POLICY "paneles anon actualizan overlay_control"
  ON public.overlay_control FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Importador RaceTec (racetec/control.html): sube eventos, atletas,
-- categorías, resultados y leaderboard en vivo con la clave anon, y
-- BORRA esas tablas al reimportar ("Limpiar todo" antes de la carrera).
--
-- Se recrean las políticas desde cero: en racetec_athletes había alguna
-- política previa que seguía bloqueando el INSERT anon (42501) aunque
-- las hermanas ya funcionaban. Partir de tabla rasa deja las cinco en
-- el mismo estado conocido.
--
-- ⚠️ El DELETE anon es necesario: sin él PostgREST devuelve 204 y RLS
-- filtra las filas en silencio — el panel canta "Todo limpiado" sin
-- haber borrado nada y la carrera nueva arranca con datos de la vieja.
DO $$
DECLARE t text; pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'racetec_events','racetec_athletes','racetec_categories',
    'racetec_results','racetec_leaderboard'
  ] LOOP
    FOR pol IN SELECT policyname FROM pg_policies
                WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true)',
                   'lectura publica '||t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true)',
                   'panel anon inserta '||t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)',
                   'panel anon actualiza '||t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO anon, authenticated USING (true)',
                   'panel anon borra '||t, t);
  END LOOP;
END $$;

-- Bucket gpx-files: el operador sube ahí el recorrido de la carrera.
-- También cayó con el endurecimiento de julio (403 AccessDenied) — y
-- el panel lo silenciaba: el GPX se veía en pantalla pero nunca subía,
-- así que los overlays seguían pintando el recorrido anterior.
DROP POLICY IF EXISTS "panel anon sube gpx" ON storage.objects;
CREATE POLICY "panel anon sube gpx"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'gpx-files');

DROP POLICY IF EXISTS "panel anon reemplaza gpx" ON storage.objects;
CREATE POLICY "panel anon reemplaza gpx"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'gpx-files')
  WITH CHECK (bucket_id = 'gpx-files');

DROP POLICY IF EXISTS "lectura publica gpx" ON storage.objects;
CREATE POLICY "lectura publica gpx"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'gpx-files');

-- El operador también guarda su config (GPX cargado, suma de kms,
-- nombre de carrera) en moto_race_config id=1 — misma restricción
-- del 15-jul, mismo arreglo (fila única operacional, sin PII).
DROP POLICY IF EXISTS "anon escribe config motos" ON public.moto_race_config;
CREATE POLICY "anon escribe config motos"
  ON public.moto_race_config FOR INSERT
  TO anon, authenticated
  WITH CHECK (id = 1);

DROP POLICY IF EXISTS "anon actualiza config motos" ON public.moto_race_config;
CREATE POLICY "anon actualiza config motos"
  ON public.moto_race_config FOR UPDATE
  TO anon, authenticated
  USING (id = 1)
  WITH CHECK (id = 1);
