-- ============================================================
-- BORRAR GRUPETTA — completa el CRUD del Capo.
-- Elimina el grupo entero: posiciones GPS, tokens (incluidas las
-- rutas guardadas en Mis salidas de sus miembros), y la carrera
-- (la cascada se lleva evento, oleada, etc.). Solo el capo dueño.
-- ============================================================

CREATE OR REPLACE FUNCTION borrar_grupetta(p_race_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_owner uuid;
BEGIN
  SELECT organizer_id INTO v_owner FROM races
   WHERE id = p_race_id AND group_type = 'grupetta';
  IF NOT FOUND OR v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Esta grupetta no es tuya';
  END IF;

  -- posiciones y tokens del (único) evento del grupo
  DELETE FROM gps_positions p
   USING gps_tokens t, race_distances d
   WHERE p.token_id = t.id AND t.event_id = d.id AND d.race_id = p_race_id;

  DELETE FROM gps_tokens t
   USING race_distances d
   WHERE t.event_id = d.id AND d.race_id = p_race_id;

  -- la cascada elimina race_distances, race_waves, etc.
  DELETE FROM races WHERE id = p_race_id;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION borrar_grupetta(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION borrar_grupetta(uuid) TO authenticated;
