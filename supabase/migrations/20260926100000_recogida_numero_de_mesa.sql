-- ============================================================
-- RECOGIDA DE DORSALES: número de mesa (26-sep-2026)
--
-- La pantalla de la mesa (/recogida/:token) pasa a la imagen de Camberas y
-- enseña "MESA #1 · nombre". El número es el orden de alta de la mesa en su
-- carrera (la primera creada es la #1). Cuenta también las revocadas, para
-- que revocar una no renumere las demás en mitad de la recogida.
--
-- Solo se añade 'mesa_numero' a lo que ya devolvía recogida_contexto; el
-- resto es idéntico. La pantalla funciona igual sin él (enseña solo el
-- nombre), así que el orden SQL / Publish da igual.
--
-- Editor SQL de Lovable: sentencias sueltas, cuerpos con $fn$ (no $$).
-- ============================================================

CREATE OR REPLACE FUNCTION public.recogida_contexto(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  m      mesas_recogida%ROWTYPE;
  v_race races%ROWTYPE;
  v_num  integer;
BEGIN
  SELECT * INTO m FROM mesas_recogida WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;
  IF NOT m.activa THEN
    RETURN jsonb_build_object('estado', 'revocada');
  END IF;

  UPDATE mesas_recogida SET last_seen_at = now() WHERE id = m.id;

  SELECT * INTO v_race FROM races WHERE id = m.race_id;

  -- Orden de alta dentro de la carrera (desempate por id si coinciden)
  SELECT count(*) INTO v_num
  FROM mesas_recogida m2
  WHERE m2.race_id = m.race_id
    AND (m2.created_at, m2.id) <= (m.created_at, m.id);

  RETURN jsonb_build_object(
    'estado',      'ok',
    'mesa',        m.nombre,
    'mesa_numero', v_num,
    'race_id',     v_race.id,
    'race_name',   v_race.name,
    'race_date',   v_race.date,
    -- Por recorrido: cuántos dorsales entregables hay y cuántos van entregados
    'resumen', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'recorrido', x.nombre, 'total', x.total, 'entregados', x.entregados)
             ORDER BY x.orden NULLS LAST, x.nombre)
      FROM (
        SELECT d.name AS nombre, d.display_order AS orden,
               count(r.id) FILTER (
                 WHERE r.status IS DISTINCT FROM 'cancelled'
                   AND r.payment_status IN ('paid', 'not_required')
               ) AS total,
               count(e.id) AS entregados
        FROM race_distances d
        LEFT JOIN registrations r ON r.race_distance_id = d.id
        LEFT JOIN entregas_dorsal e ON e.registration_id = r.id
        WHERE d.race_id = v_race.id
        GROUP BY d.name, d.display_order
      ) x
    ), '[]'::jsonb)
  );
END;
$fn$;

-- Comprobación (sin llamar a la función, que marca la mesa como vista): la
-- mesa de la Marcha ADEMCO debe salir como la #1
SELECT m.nombre,
       (SELECT count(*) FROM mesas_recogida m2
        WHERE m2.race_id = m.race_id
          AND (m2.created_at, m2.id) <= (m.created_at, m.id)) AS numero
FROM mesas_recogida m
ORDER BY m.race_id, m.created_at;
