-- ============================================================
-- SUBIDA DE POSICIONES MÁS BARATA (27-sep, tras la marcha ADEMCO)
--
-- La base se cayó dos veces en plena marcha (reinicio de Postgres a las
-- 11:58:05). Lo que se midió en producción, con el reinicio como origen
-- de los contadores:
--
--   · 28.873 subidas de posiciones para 8.960 posiciones nuevas: los
--     móviles mandan cada posición ~3,2 veces (varias subidas en vuelo a
--     la vez sin cerrojo, cogiendo las mismas filas de la cola). Eso se
--     arregla en la app, no aquí.
--   · Cada subida paga, por fila, la política de INSERT y cuatro índices,
--     dos de ellos idénticos (idx_gps_positions_token e
--     idx_gps_positions_token_ts, los dos sobre token_id, timestamp DESC,
--     que además repiten el UNIQUE uq_token_timestamp).
--
-- Medido como anon en producción (lotes reales de 40, 6 rondas, dentro de
-- una transacción deshecha): 23,4 ms → 12,5 ms en caliente, y el primer
-- lote en frío 45,8 → 15,0 ms.
--
-- LO QUE NO SE HACE, Y POR QUÉ (también medido): sacar la comprobación a
-- una función SECURITY DEFINER aparte resultó TRES veces más lenta (0,63
-- frente a 0,22 ms por fila): Postgres deja de poder calcular una vez por
-- sentencia las partes comunes. La política se queda en línea.
--
-- Sin cambio de semántica práctico: comparado para los 559 tokens de
-- producción, ninguno gana permiso; dos (dorsales 101 y 210, recorridos
-- ocultos, sin lecturas en 7 días) lo pierden, porque la política vieja
-- trataba un recorrido que anon no ve como "sin evento" — un efecto
-- colateral de la RLS, no una regla. Las 34 ventanas de captura dan
-- exactamente lo mismo.
-- Revisado por un atacante de seguridad independiente: no abre nada que
-- estuviera cerrado. De su revisión salen lock_timeout, pg_temp en el
-- search_path y la comprobación final. La rama demo-% de la ventana ya
-- estaba en producción (leída con pg_get_functiondef el 27-sep) y se
-- conserva tal cual.
-- ============================================================

SET client_encoding = 'UTF8';

BEGIN;
-- Si una lectura larga retiene gps_positions, mejor abortar y reintentar
-- que dejar las subidas de los móviles en cola detrás de este cambio.
SET LOCAL lock_timeout = '2s';

-- 1. Índice que faltaba (la política busca motos por token)
CREATE INDEX IF NOT EXISTS idx_race_motos_token ON public.race_motos (token_id);

-- 2. Ventana de captura: la clave primaria en vez de ::text sobre la
--    columna. Misma firma (text); un texto que no sea uuid devuelve la
--    fila de NULLs de siempre, en vez de error.
CREATE OR REPLACE FUNCTION public.gps_capture_window(p_distance_id text,
  OUT t_ini timestamptz, OUT t_fin timestamptz)
RETURNS record
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT
    CASE WHEN r.slug LIKE 'demo-%' THEN '-infinity'::timestamptz
      ELSE COALESCE(s.salida,
             (r.date::text || ' 00:00')::timestamp AT TIME ZONE 'Europe/Madrid')
           - interval '24 hours' END,
    CASE WHEN r.slug LIKE 'demo-%' THEN 'infinity'::timestamptz
      WHEN s.salida IS NOT NULL THEN
        s.salida + gps_cutoff_interval(d.cutoff_time, r.group_type) + interval '2 hours'
      ELSE
        (r.date::text || ' 23:59')::timestamp AT TIME ZONE 'Europe/Madrid' + interval '2 hours'
    END
  FROM race_distances d
  JOIN races r ON r.id = d.race_id
  LEFT JOIN race_waves w ON w.race_distance_id = d.id
  CROSS JOIN LATERAL (
    SELECT CASE WHEN w.start_time IS NULL THEN NULL
      ELSE (r.date::text || ' ' ||
            to_char(w.start_time AT TIME ZONE 'Europe/Madrid', 'HH24:MI')
           )::timestamp AT TIME ZONE 'Europe/Madrid'
    END AS salida
  ) s
  WHERE d.id = CASE
      WHEN p_distance_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN p_distance_id::uuid
    END
$function$;

-- 3. La política, en línea (para que Postgres reutilice por sentencia),
--    comparando uuid con uuid. DROP + CREATE en la misma transacción: no
--    hay ningún instante sin política.
DROP POLICY IF EXISTS "App inserts gps_positions (token válido)" ON public.gps_positions;
CREATE POLICY "App inserts gps_positions (token válido)"
  ON public.gps_positions FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    token_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM gps_tokens t
       WHERE t.id = gps_positions.token_id
         AND t.active IS TRUE
         AND (
               t.es_organizacion IS TRUE
            OR EXISTS (SELECT 1 FROM race_motos m WHERE m.token_id = t.id)
            OR NOT EXISTS (SELECT 1 FROM race_distances d WHERE d.id = t.event_id)
            OR EXISTS (SELECT 1 FROM gps_capture_window(t.event_id::text) cw
                        WHERE now() >= cw.t_ini AND now() <= cw.t_fin)
         )
    )
  );

-- 4. Fuera los dos índices repetidos. uq_token_timestamp (token_id,
--    timestamp) se queda: lo necesita el ON CONFLICT y sirve igual para
--    "la última posición de un dorsal" (se recorre al revés).
DROP INDEX IF EXISTS public.idx_gps_positions_token;
DROP INDEX IF EXISTS public.idx_gps_positions_token_ts;

-- 5. Comprobación: exactamente UNA política de INSERT para anon, y es la
--    nueva (sin ::text). Si no, se deshace todo y la vieja sigue en pie.
DO $$
DECLARE n int; def text;
BEGIN
  SELECT count(*), max(with_check) INTO n, def
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'gps_positions'
     AND cmd = 'INSERT' AND 'anon' = ANY (roles);
  IF n <> 1 THEN
    RAISE EXCEPTION 'Esperaba 1 política de INSERT para anon en gps_positions y hay %', n;
  END IF;
  IF def LIKE '%::text = (t.event_id)::text%' THEN
    RAISE EXCEPTION 'La política de INSERT sigue siendo la vieja (con ::text)';
  END IF;
END $$;

COMMIT;
