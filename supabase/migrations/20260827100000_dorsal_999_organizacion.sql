-- ============================================================
-- DORSAL 999: EL VOLUNTARIO DE ORGANIZACIÓN DE CADA EVENTO (27-ago)
--
-- El organizador necesita probar la app en su propio evento sin pelearse
-- con la ventana de captura (que solo acepta lecturas desde 24 h antes de
-- la salida hasta 2 h después del cierre). Hasta hoy, la única forma era
-- crearle una carrera demo aparte — algo que no se parece en nada a lo
-- que va a usar el día de la prueba.
--
-- Convención: en CADA evento existe el dorsal 999, "Organizador <evento>".
-- Es un voluntario de la organización, no un participante: no compite, no
-- puntúa, y está exento de la ventana igual que las motos (mismo criterio
-- del 4-ago: el material de organización se monta y prueba días antes).
--
-- ⚠ La exención NO se basa en el número: en una carrera de mil corredores
-- el 999 puede ser un dorsal legítimo. Va marcada en la fila
-- (es_organizacion), y el 999 es solo la convención visible.
-- ============================================================

ALTER TABLE public.gps_tokens
  ADD COLUMN IF NOT EXISTS es_organizacion boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.gps_tokens.es_organizacion IS
  'Voluntario/material de organización: exento de la ventana de captura, '
  'igual que las motos. Por convención lleva el dorsal 999.';

-- ── Crear (o recuperar) el 999 de un evento ─────────────────────
CREATE OR REPLACE FUNCTION public.dorsal_organizacion(p_distance_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
  v_nombre text;
BEGIN
  SELECT id INTO v_id FROM gps_tokens
   WHERE event_id = p_distance_id AND es_organizacion IS TRUE
   ORDER BY created_at LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- Nombre: "Organizador" + el evento, para distinguirlos de un vistazo
  -- cuando el organizador lleva varias distancias a la vez.
  SELECT 'Organizador ' || d.name INTO v_nombre
    FROM race_distances d WHERE d.id = p_distance_id;

  INSERT INTO gps_tokens (token, bib_number, participant_name, event_id,
                          active, es_organizacion)
  VALUES (gen_random_uuid(), '999', COALESCE(v_nombre, 'Organizador'),
          p_distance_id, true, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.dorsal_organizacion(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.dorsal_organizacion(uuid) TO authenticated;

-- ── Cada evento nuevo nace con el suyo ──────────────────────────
CREATE OR REPLACE FUNCTION public.crear_dorsal_organizacion()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  PERFORM public.dorsal_organizacion(NEW.id);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_dorsal_organizacion ON public.race_distances;
CREATE TRIGGER trg_dorsal_organizacion
  AFTER INSERT ON public.race_distances
  FOR EACH ROW EXECUTE FUNCTION public.crear_dorsal_organizacion();

-- ── Y los eventos que ya existen ────────────────────────────────
SELECT public.dorsal_organizacion(d.id)
  FROM race_distances d
  JOIN races r ON r.id = d.race_id
 WHERE r.date >= current_date - 30;   -- los de hace meses no hacen falta

-- ── Exención de la ventana, igual que las motos ─────────────────
DROP POLICY IF EXISTS "App inserts gps_positions (token válido)" ON public.gps_positions;
CREATE POLICY "App inserts gps_positions (token válido)"
  ON public.gps_positions FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    token_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM gps_tokens t
      WHERE t.id = token_id AND t.active IS TRUE
        AND (
          -- Organización: motos y voluntarios (dorsal 999), sin ventana
          t.es_organizacion IS TRUE
          OR EXISTS (SELECT 1 FROM race_motos m WHERE m.token_id = t.id)
          OR NOT EXISTS (SELECT 1 FROM race_distances d
                          WHERE d.id::text = t.event_id::text)
          OR EXISTS (SELECT 1 FROM gps_capture_window(t.event_id::text) cw
                     WHERE now() BETWEEN cw.t_ini AND cw.t_fin)
        )
    )
  );

-- ── Que el mapa en vivo también los pinte fuera de ventana ──────
CREATE OR REPLACE FUNCTION public.get_live_gps_positions(
  p_race_id uuid,
  p_distance_id uuid DEFAULT NULL
)
RETURNS TABLE(
  gps_id uuid, registration_id uuid, latitude numeric, longitude numeric,
  gps_timestamp timestamptz, bib_number text, runner_name text,
  race_distance_id uuid, heading numeric, speed numeric, battery numeric, source text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  (
    SELECT DISTINCT ON (g.registration_id)
      g.id, g.registration_id, g.latitude, g.longitude, g."timestamp",
      r.bib_number::text,
      COALESCE(
        p.first_name || ' ' || COALESCE(p.last_name, ''),
        r.first_name || ' ' || COALESCE(r.last_name, ''),
        'Corredor'
      ),
      r.race_distance_id, g.heading::numeric, g.speed::numeric,
      g.battery_level::numeric, 'device'::text
    FROM gps_tracking g
    JOIN registrations r ON r.id = g.registration_id
    LEFT JOIN profiles p ON p.id = r.user_id
    WHERE g.race_id = p_race_id
      AND (p_distance_id IS NULL OR r.race_distance_id = p_distance_id)
    ORDER BY g.registration_id, g."timestamp" DESC
  )
  UNION ALL
  (
    SELECT DISTINCT ON (gp.token_id)
      gp.id, gp.token_id, gp.lat::numeric, gp.lng::numeric,
      gp."timestamp"::timestamptz, gt.bib_number::text,
      COALESCE(gt.participant_name, 'Corredor'), rd.id,
      gp.heading::numeric, gp.speed::numeric, gp.battery::numeric,
      CASE WHEN EXISTS (SELECT 1 FROM race_motos m WHERE m.token_id = gt.id)
           THEN 'moto'
           WHEN gt.es_organizacion THEN 'organizacion'
           ELSE 'app' END
    FROM gps_positions gp
    JOIN gps_tokens gt ON gt.id = gp.token_id
    JOIN race_distances rd ON rd.id::text = gt.event_id::text
    LEFT JOIN LATERAL gps_capture_window(rd.id::text) cw ON true
    WHERE rd.race_id = p_race_id
      AND (p_distance_id IS NULL OR rd.id = p_distance_id)
      AND (
        (gt.es_organizacion IS TRUE
         OR EXISTS (SELECT 1 FROM race_motos m WHERE m.token_id = gt.id))
          AND gp."timestamp"::timestamptz > now() - interval '24 hours'
        OR (now() <= cw.t_fin
            AND gp."timestamp"::timestamptz BETWEEN cw.t_ini AND cw.t_fin)
      )
    ORDER BY gp.token_id, gp."timestamp" DESC
  )
  ORDER BY bib_number NULLS LAST;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_live_gps_positions(uuid, uuid) TO anon, authenticated;

-- ── Comprobación: un 999 por evento reciente ────────────────────
SELECT r.name AS carrera, d.name AS evento,
       t.bib_number, t.participant_name, t.active, t.es_organizacion
  FROM gps_tokens t
  JOIN race_distances d ON d.id = t.event_id
  JOIN races r ON r.id = d.race_id
 WHERE t.es_organizacion
 ORDER BY r.date DESC, d.name;
