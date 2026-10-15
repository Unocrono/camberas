-- ============================================================
-- LECTURAS DEL ULTRA EN DIRECTO (sin Outreach). Petición del dueño, 14-oct:
-- «Quiero hacer un programa como el Outreach para no depender de ellos».
--
-- El Ultra manda sus lecturas a nuestro servidor (receptor-ultra/, en el
-- VPS del streaming) y el receptor las sube aquí con esta RPC, en lotes.
--
-- Identidad: el TOKEN del punto de cronometraje (el mismo QR de /timing:
-- /timing?t=<token>), como manda el patrón de tokens de Camberas. El
-- receptor se presenta como el dispositivo 'ultra-<lector>': la primera vez
-- vincula el token a ese dispositivo y después solo lo acepta de él (si el
-- token ya está en un móvil, hay que usar otro punto de cronometraje).
--
-- Cada lectura entra UNA vez: la clave es punto + lector + número de lectura
-- del Ultra + hora (si el Ultra borra su memoria y repite números, la hora
-- las distingue). Reenviar un lote o un día entero no duplica nada.
--
-- Chip → dorsal con bib_chips de la carrera (chip_code … chip_code_5, en
-- texto o en número). Un chip sin dorsal no se puede guardar
-- (timing_readings.bib_number es NOT NULL): se cuenta y el receptor lo deja
-- en su fichero para reenviarlo cuando se asigne el chip.
--
-- Solo se aceptan lecturas dentro de la ventana de cronometraje de la
-- carrera (cronometraje_window: salida −24 h … cierre +2 h), mirando la HORA
-- DE LA LECTURA, no el reloj: las pruebas de chips de días antes no se
-- cuelan y un día entero se puede reenviar después de la carrera.
--
-- Horas: la del Ultra es hora de pared (CLAUDE.md); llega como texto
-- 'AAAA-MM-DD HH:MM:SS.mmm' y se guarda tal cual con +00.
--
-- PENDIENTE DE APLICAR en producción (panel de Supabase).
-- ============================================================

SET client_encoding = 'UTF8';

BEGIN;
SET LOCAL lock_timeout = '5s';

-- Una lectura del Ultra, una vez (los reintentos del receptor chocan aquí)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_timing_readings_ultra
  ON public.timing_readings (timing_point_id, reader_no, log_id, timing_timestamp)
  WHERE log_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ultra_registrar_lecturas(
  p_token     uuid,
  p_lector    integer,
  p_lecturas  jsonb      -- [{"num": 14020, "chip": 14371317, "hora": "2026-10-14 22:06:47.115"}, …]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_dispositivo text := 'ultra-' || p_lector;
  v_token       record;
  v_ini         timestamptz;
  v_fin         timestamptz;
  v_recibidas   integer;
  v_insertadas  integer := 0;
  v_sin_dorsal  integer := 0;
  v_fuera       integer := 0;
  v_distintas   integer := 0;
  v_chips       jsonb;
BEGIN
  IF p_lecturas IS NULL OR jsonb_typeof(p_lecturas) <> 'array' THEN
    RAISE EXCEPTION 'Las lecturas tienen que ir en una lista';
  END IF;
  v_recibidas := jsonb_array_length(p_lecturas);
  IF v_recibidas > 1000 THEN
    RAISE EXCEPTION 'Demasiadas lecturas en un lote (% > 1000)', v_recibidas;
  END IF;

  -- Token → punto de cronometraje y carrera
  SELECT t.id AS token_id, t.device_id, tp.id AS timing_point_id, tp.race_id
    INTO v_token
    FROM gps_tokens t
    JOIN timing_points tp ON tp.token_id = t.id
   WHERE t.token = p_token AND t.active IS TRUE
   FOR UPDATE OF t;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token de punto de cronometraje no válido o desactivado';
  END IF;

  -- Vínculo con el dispositivo: el primero que llega se lo queda
  IF v_token.device_id IS NULL THEN
    UPDATE gps_tokens SET device_id = v_dispositivo WHERE id = v_token.token_id;
  ELSIF v_token.device_id <> v_dispositivo THEN
    RAISE EXCEPTION 'Este token ya está vinculado a otro dispositivo (%): usa otro punto de cronometraje para el Ultra',
      v_token.device_id;
  END IF;

  SELECT w.t_ini, w.t_fin INTO v_ini, v_fin FROM cronometraje_window(v_token.race_id) w;

  WITH entrada AS (
    -- Una por número y hora aunque el lote traiga repetidas
    SELECT DISTINCT ON ((e->>'num')::integer, (e->>'hora'))
           (e->>'num')::integer                    AS num,
           (e->>'chip')                            AS chip,
           ((e->>'hora') || '+00')::timestamptz    AS hora
      FROM jsonb_array_elements(p_lecturas) e
  ),
  -- Dentro de la ventana de la carrera (por la hora de la lectura)
  en_ventana AS (
    SELECT * FROM entrada
     WHERE (v_ini IS NULL OR hora >= v_ini) AND (v_fin IS NULL OR hora <= v_fin)
  ),
  -- Chip → dorsal (el primer chip_code que case, en texto o en número)
  resueltas AS (
    SELECT DISTINCT ON (en.num, en.hora)
           en.num, en.chip, en.hora, bc.bib_number, bc.race_distance_id
      FROM en_ventana en
      JOIN bib_chips bc ON bc.race_id = v_token.race_id
       AND en.chip IN (bc.chip_code, bc.chip_code_2, bc.chip_code_3, bc.chip_code_4, bc.chip_code_5)
     ORDER BY en.num, en.hora, bc.bib_number
  ),
  resueltas_num AS (
    SELECT * FROM resueltas
    UNION ALL
    (SELECT DISTINCT ON (en.num, en.hora)
           en.num, en.chip, en.hora, bc.bib_number, bc.race_distance_id
      FROM en_ventana en
      JOIN bib_chips bc ON bc.race_id = v_token.race_id
       AND en.chip ~ '^\d+$'
       AND EXISTS (SELECT 1 FROM unnest(ARRAY[bc.chip_code, bc.chip_code_2, bc.chip_code_3,
                                              bc.chip_code_4, bc.chip_code_5]) c(codigo)
                    WHERE c.codigo ~ '^\s*\d+\s*$' AND trim(c.codigo)::numeric = en.chip::numeric)
     WHERE NOT EXISTS (SELECT 1 FROM resueltas r WHERE r.num = en.num AND r.hora = en.hora)
     ORDER BY en.num, en.hora, bc.bib_number)
  ),
  insertadas AS (
    INSERT INTO timing_readings (race_id, race_distance_id, registration_id, timing_point_id, token_id,
                                 bib_number, chip_code, timing_timestamp, reading_timestamp,
                                 reading_type, reader_device_id, reader_no, log_id, lap_number, is_processed)
    SELECT v_token.race_id, coalesce(reg.race_distance_id, r.race_distance_id), reg.id,
           v_token.timing_point_id, v_token.token_id,
           r.bib_number, r.chip, r.hora, now(),
           'automatic', v_dispositivo, p_lector, r.num, 1, false
      FROM resueltas_num r
      LEFT JOIN LATERAL (
        SELECT g.id, g.race_distance_id FROM registrations g
         WHERE g.race_id = v_token.race_id AND g.bib_number = r.bib_number
           AND g.status IS DISTINCT FROM 'cancelled'
         ORDER BY g.created_at LIMIT 1
      ) reg ON true
    ON CONFLICT (timing_point_id, reader_no, log_id, timing_timestamp) WHERE log_id IS NOT NULL
    DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM insertadas),
         (SELECT count(*) FROM en_ventana) - (SELECT count(*) FROM resueltas_num),
         (SELECT count(*) FROM entrada) - (SELECT count(*) FROM en_ventana),
         (SELECT count(*) FROM entrada),
         (SELECT coalesce(jsonb_agg(DISTINCT en.chip), '[]'::jsonb)
            FROM en_ventana en
           WHERE NOT EXISTS (SELECT 1 FROM resueltas_num r WHERE r.num = en.num AND r.hora = en.hora))
    INTO v_insertadas, v_sin_dorsal, v_fuera, v_distintas, v_chips;

  RETURN jsonb_build_object(
    'recibidas', v_recibidas,
    'insertadas', v_insertadas,
    'repetidas', v_recibidas - v_fuera - v_sin_dorsal - v_insertadas,   -- ya estaban o venían dos veces
    'sin_dorsal', v_sin_dorsal,
    'chips_sin_dorsal', v_chips,
    'fuera_de_ventana', v_fuera);
END
$fn$;

-- El receptor entra con la clave pública: la puerta es el token, que se
-- valida dentro (como las RPC de /timing)
REVOKE EXECUTE ON FUNCTION public.ultra_registrar_lecturas(uuid, integer, jsonb) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ultra_registrar_lecturas(uuid, integer, jsonb) TO anon, authenticated;

-- Comprobaciones: si algo falla, se deshace todo
DO $$
DECLARE malas text;
BEGIN
  IF NOT has_function_privilege('anon', 'public.ultra_registrar_lecturas(uuid,integer,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'El receptor (anon) no podría registrar lecturas';
  END IF;

  -- Guardia de horas (CLAUDE.md): ningún FALLO
  SELECT string_agg(nombre || ' [' || left(regla, 2) || ']', ', ') INTO malas
    FROM public.guardia_horas() WHERE nivel = 'FALLO';
  IF malas IS NOT NULL THEN RAISE EXCEPTION 'Siguen convirtiendo horas: %', malas; END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
