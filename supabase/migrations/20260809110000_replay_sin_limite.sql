-- ============================================================
-- REPLAY SIN CORTES (9-ago) — la ruta entera, punto por punto.
--
-- El API (PostgREST) corta cualquier consulta en 1.000 FILAS. Como
-- get_token_track devuelve una fila por posición, en una ruta de 1.846
-- puntos se veían las 1.000 primeras y desaparecía la última hora y
-- media. A 15 s de cadencia eso son solo 4 h: casi cualquier marcha.
--
-- El truco: devolver UNA fila con todos los puntos dentro (jsonb). El
-- límite cuenta filas, así que no hay nada que cortar y no hace falta
-- tocar el ajuste global "Max rows" del proyecto.
--
-- Se mantiene el filtro de precisión (fijos de antena >100 m fuera) y
-- una red de seguridad: por encima de 20.000 puntos se reparte 1 de
-- cada N para que la respuesta no se dispare (una ultra de 24 h a 15 s
-- son 5.760: cabe entera).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_token_track_full(p_token_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_total int;
  v_paso  int;
  v_out   jsonb;
BEGIN
  SELECT count(*) INTO v_total
    FROM gps_positions gp
   WHERE gp.token_id = p_token_id
     AND (gp.accuracy IS NULL OR gp.accuracy <= 100);

  v_paso := GREATEST(1, ceil(v_total::numeric / 20000)::int);

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('lat', d.lat, 'lng', d.lng,
                              'ts', d.ts, 'speed', d.speed)
           ORDER BY d.ts
         ), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT gp.lat::numeric AS lat, gp.lng::numeric AS lng,
             gp."timestamp"::timestamptz AS ts, gp.speed::numeric AS speed,
             row_number() OVER (ORDER BY gp."timestamp") AS n
        FROM gps_positions gp
       WHERE gp.token_id = p_token_id
         AND (gp.accuracy IS NULL OR gp.accuracy <= 100)
    ) d
   WHERE v_paso = 1 OR d.n % v_paso = 0 OR d.n = 1 OR d.n = v_total;

  RETURN v_out;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_token_track_full(uuid) TO anon, authenticated;

-- Mismo problema en el pipeline del rastreador web (gps_tracking):
-- una fila por posición y el mismo corte a las 1.000.
CREATE OR REPLACE FUNCTION public.get_registration_track_full(
  p_registration_id uuid,
  p_race_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_total int;
  v_paso  int;
  v_out   jsonb;
BEGIN
  SELECT count(*) INTO v_total
    FROM gps_tracking g
   WHERE g.registration_id = p_registration_id
     AND (p_race_id IS NULL OR g.race_id = p_race_id);

  v_paso := GREATEST(1, ceil(v_total::numeric / 20000)::int);

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('lat', d.latitude, 'lng', d.longitude,
                              'ts', d.ts, 'speed', d.speed,
                              'altitude', d.altitude)
           ORDER BY d.ts
         ), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT g.latitude::numeric AS latitude, g.longitude::numeric AS longitude,
             g."timestamp"::timestamptz AS ts, g.speed::numeric AS speed,
             g.altitude::numeric AS altitude,
             row_number() OVER (ORDER BY g."timestamp") AS n
        FROM gps_tracking g
       WHERE g.registration_id = p_registration_id
         AND (p_race_id IS NULL OR g.race_id = p_race_id)
    ) d
   WHERE v_paso = 1 OR d.n % v_paso = 0 OR d.n = 1 OR d.n = v_total;

  RETURN v_out;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_registration_track_full(uuid, uuid) TO anon, authenticated;
