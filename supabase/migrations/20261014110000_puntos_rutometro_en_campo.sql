-- ============================================================
-- PUNTOS DEL RUTÓMETRO MARCADOS EN CAMPO (14-oct-2026)
--
-- El organizador recorre la carrera con Camberas Track grabando (dorsal 999)
-- y, desde Camberas Org en el mismo móvil, marca «aquí hay un
-- avituallamiento líquido», «aquí un control», etc. La pantalla manda la
-- posición del GPS del móvil y el tipo; el servidor lo mete en el rutómetro
-- del recorrido, con su km, ordenado entre los demás puntos.
--
-- 1. roadbook_items.origen: de dónde salió cada punto —
--      'gpx'   generado desde el GPX («Regenerar desde el GPX»)
--      'panel' añadido a mano en el panel
--      'campo' marcado en campo desde Camberas Org
--    Desde ahora «Regenerar desde el GPX» borra SOLO los 'gpx'. Los puntos
--    que ya existen se marcan todos 'gpx' para que regenerar los trate
--    como hasta hoy (no hay manera de distinguir cuáles se tocaron a mano).
--
-- 2. marcar_punto_rutometro(): SECURITY INVOKER a propósito — corre con los
--    permisos del organizador que ha iniciado sesión, así que la RLS de
--    roadbooks/roadbook_items decide (solo sus carreras, o admin). No abre
--    nada a anon. Hace lo que el cliente no puede: proyectar la posición
--    sobre el trazado, calcular el km y renumerar item_order.
--    Idempotente por p_id: la pantalla guarda las marcas sin cobertura y
--    las reintenta; un reintento no duplica.
--
-- Horas: p_marcado_en es un instante real (reloj del móvil), como el GPS;
-- se pasa a hora de Madrid solo para escribirlo en la nota.
--
-- APLICADA en producción el 14-oct-2026 tras ensayarla con ROLLBACK (marca
-- sobre el GT20 de la Gurriana: km 3,331 del trazado, a 13 m, orden sin
-- huecos, reintento sin duplicar). Comprobado: 28.761 puntos en 'gpx',
-- anon NO puede ejecutar la función, authenticated sí, guardia 0 FALLO.
-- ============================================================

SET client_encoding = 'UTF8';

BEGIN;
SET LOCAL lock_timeout = '2s';

-- 1. Origen de cada punto ---------------------------------------------
ALTER TABLE public.roadbook_items ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'panel';
ALTER TABLE public.roadbook_items DROP CONSTRAINT IF EXISTS roadbook_items_origen_check;
ALTER TABLE public.roadbook_items ADD CONSTRAINT roadbook_items_origen_check CHECK (origen IN ('gpx', 'panel', 'campo'));
COMMENT ON COLUMN public.roadbook_items.origen IS
  'gpx = generado desde el GPX (lo borra «Regenerar»); panel = añadido a mano; campo = marcado en campo desde Camberas Org. Los dos últimos sobreviven a «Regenerar».';

-- Lo que ya existe se trata como hasta hoy: regenerar lo renueva todo
UPDATE public.roadbook_items SET origen = 'gpx';

-- 2. Marcar un punto en campo ------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_punto_rutometro(
  p_distance_id uuid,
  p_tipo text,
  p_lat double precision,
  p_lng double precision,
  p_altitud double precision DEFAULT NULL,
  p_precision_m double precision DEFAULT NULL,
  p_nota text DEFAULT NULL,
  p_km double precision DEFAULT NULL,
  p_marcado_en timestamptz DEFAULT now(),
  p_id uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo_id uuid;
  v_label text;
  v_rb uuid;
  v_km double precision;
  v_km_de text;
  v_alt double precision := p_altitud;
  v_fuera_m double precision;
  v_total double precision;
  v_order int;
  v_nota text;
  v_ya jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Hay que iniciar sesión' USING ERRCODE = '42501';
  END IF;

  SELECT t.id, t.label INTO v_tipo_id, v_label
    FROM roadbook_item_types t
   WHERE t.name = p_tipo AND t.is_active IS TRUE AND t.name <> 'point';
  IF v_tipo_id IS NULL THEN
    RAISE EXCEPTION 'Tipo de punto desconocido: %', p_tipo;
  END IF;

  -- Reintento de una marca ya guardada: se devuelve la que hay
  SELECT jsonb_build_object('id', i.id, 'roadbook_id', i.roadbook_id, 'km', i.km_total,
                            'descripcion', i.description, 'repetida', true)
    INTO v_ya
    FROM roadbook_items i WHERE i.id = p_id;
  IF v_ya IS NOT NULL THEN
    RETURN v_ya;
  END IF;

  -- El rutómetro del recorrido; si no existe, nace aquí (la RLS de roadbooks
  -- solo lo permite al organizador de la carrera o a un admin)
  SELECT r.id INTO v_rb FROM roadbooks r
   WHERE r.race_distance_id = p_distance_id
   ORDER BY r.created_at LIMIT 1;
  IF v_rb IS NULL THEN
    INSERT INTO roadbooks (race_distance_id, name)
    SELECT d.id, 'Rutómetro ' || d.name FROM race_distances d WHERE d.id = p_distance_id
    RETURNING id INTO v_rb;
  END IF;
  IF v_rb IS NULL THEN
    RAISE EXCEPTION 'No puedes marcar puntos en este recorrido' USING ERRCODE = '42501';
  END IF;

  -- Km: el punto del trazado más cercano, si el rutómetro tiene trazado y
  -- la posición está a menos de 300 m de él (el mismo margen que los
  -- waypoints del GPX). Si no, el km que calculó el móvil sobre el GPX.
  SELECT x.km_total, x.altitude, x.dist
    INTO v_km, v_alt, v_fuera_m
    FROM (
      SELECT i.km_total::double precision AS km_total,
             COALESCE(p_altitud, i.altitude::double precision) AS altitude,
             2 * 6371000 * asin(sqrt(
               power(sin(radians(i.latitude::double precision - p_lat) / 2), 2) +
               cos(radians(p_lat)) * cos(radians(i.latitude::double precision)) *
               power(sin(radians(i.longitude::double precision - p_lng) / 2), 2))) AS dist
        FROM roadbook_items i
       WHERE i.roadbook_id = v_rb AND i.item_type = 'point'
         AND i.latitude IS NOT NULL AND i.longitude IS NOT NULL
    ) x
   ORDER BY x.dist
   LIMIT 1;

  IF v_km IS NOT NULL AND v_fuera_m <= 300 THEN
    v_km_de := 'trazado';
  ELSIF p_km IS NOT NULL THEN
    v_km := p_km;
    v_km_de := 'gpx';
    v_alt := p_altitud;
  ELSE
    v_km := 0;
    v_km_de := NULL;
    v_alt := p_altitud;
  END IF;

  SELECT max(i.km_total)::double precision INTO v_total FROM roadbook_items i WHERE i.roadbook_id = v_rb;

  -- Colocado por km entre los demás: los que van detrás se corren uno
  SELECT count(*) INTO v_order FROM roadbook_items i WHERE i.roadbook_id = v_rb AND i.km_total <= v_km;
  UPDATE roadbook_items SET item_order = item_order + 1
   WHERE roadbook_id = v_rb AND item_order >= v_order;

  v_nota := 'Marcado en campo el ' || to_char(p_marcado_en AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY HH24:MI')
    || CASE WHEN p_precision_m IS NOT NULL THEN ' (±' || round(p_precision_m) || ' m)' ELSE '' END
    || CASE WHEN v_km_de = 'trazado' AND v_fuera_m > 50 THEN ' · a ' || round(v_fuera_m) || ' m del trazado' ELSE '' END
    || CASE WHEN v_km_de IS NULL THEN ' · KM SIN CALCULAR: corrígelo' ELSE '' END
    || CASE WHEN nullif(btrim(p_nota), '') IS NOT NULL THEN ' · ' || btrim(p_nota) ELSE '' END;

  INSERT INTO roadbook_items (id, roadbook_id, item_order, item_type, item_type_id, description,
                              km_total, km_remaining, altitude, latitude, longitude,
                              is_highlighted, is_checkpoint, notes, origen)
  VALUES (p_id, v_rb, v_order, p_tipo, v_tipo_id, v_label,
          round(v_km::numeric, 3),
          CASE WHEN v_total IS NOT NULL THEN round(greatest(0, v_total - v_km)::numeric, 3) END,
          CASE WHEN v_alt IS NOT NULL THEN round(v_alt) END,
          round(p_lat::numeric, 6), round(p_lng::numeric, 6),
          true, p_tipo = 'checkpoint', v_nota, 'campo')
  ON CONFLICT (id) DO NOTHING;

  RETURN jsonb_build_object('id', p_id, 'roadbook_id', v_rb, 'km', round(v_km::numeric, 3),
                            'descripcion', v_label, 'km_de', v_km_de,
                            'fuera_trazado_m', CASE WHEN v_km_de = 'trazado' THEN round(v_fuera_m) END);
END;
$function$;

-- Solo con sesión (la RLS hace el resto); nunca anon
REVOKE EXECUTE ON FUNCTION public.marcar_punto_rutometro(uuid, text, double precision, double precision, double precision, double precision, text, double precision, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_punto_rutometro(uuid, text, double precision, double precision, double precision, double precision, text, double precision, timestamptz, uuid) TO authenticated;

-- Guardia de horas (CLAUDE.md): ningún FALLO
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel = 'FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
