-- Numeración de dorsales por CARRERA para lo que llega de EventBooking (uno.es)
--
-- Camberas reparte los dorsales con un contador por recorrido
-- (race_distances.next_bib, assign_next_bib). La Marcha ADEMCO quiere una sola
-- serie para toda la carrera, y como allí todo entra por el sync de
-- EventBooking (en Camberas tiene las inscripciones cerradas), basta con que
-- el sync sepa numerar así. El resto de caminos no cambia.
--
-- El resto de la plataforma ya da por hecho que el dorsal es único en la
-- carrera (cronometrador_fichar, calculate_*, recogida_buscar buscan por
-- race_id + bib), así que esta serie es justo lo que esperan.
--
-- Editor SQL de Lovable: sentencias sueltas y cuerpos con $fn$.

-- 1) Interruptor por carrera en la configuración del sync
ALTER TABLE public.eventbooking_sync
  ADD COLUMN IF NOT EXISTS numerar_por_carrera boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.eventbooking_sync.numerar_por_carrera IS
  'true: el sync da a cada importado el primer dorsal libre de TODA la carrera (asignar_dorsal_carrera). false: contador de su recorrido (assign_next_bib).';

-- 2) Elige y escribe el dorsal en la misma transacción
--
-- · Primer número libre desde el inicio de la carrera (el menor bib_start de
--   sus recorridos, o 1): respeta los dorsales puestos a mano y los de las
--   canceladas, que conservan su número.
-- · Un cerrojo por carrera: dos pasadas del sync a la vez (cron y botón) se
--   turnan y no pueden repetir número.
-- · Se salta el 999, que es el dorsal de organización de cada recorrido
--   (dorsal_organizacion, en gps_tokens).
-- · Si la inscripción ya tiene dorsal, lo devuelve sin tocar nada.
CREATE OR REPLACE FUNCTION public.asignar_dorsal_carrera(p_registration_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_race   uuid;
  v_bib    integer;
  v_inicio integer;
  v_total  integer;
  v_n      integer;
BEGIN
  SELECT race_id, bib_number INTO v_race, v_bib
  FROM registrations
  WHERE id = p_registration_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_bib IS NOT NULL THEN
    RETURN v_bib;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('dorsal_carrera:' || v_race::text, 0));

  -- Releer con el cerrojo puesto: otra llamada pudo numerarla mientras tanto
  SELECT bib_number INTO v_bib
  FROM registrations
  WHERE id = p_registration_id
  FOR UPDATE;
  IF v_bib IS NOT NULL THEN
    RETURN v_bib;
  END IF;

  SELECT COALESCE(min(bib_start), 1) INTO v_inicio
  FROM race_distances
  WHERE race_id = v_race;

  -- En [inicio, inicio + total + 1] siempre queda al menos un hueco: hay
  -- total + 2 números y, como mucho, total - 1 ocupados más el 999
  SELECT count(*) INTO v_total FROM registrations WHERE race_id = v_race;

  SELECT min(n) INTO v_n
  FROM generate_series(v_inicio, v_inicio + v_total + 1) AS n
  WHERE n <> 999
    AND NOT EXISTS (
      SELECT 1 FROM registrations r
      WHERE r.race_id = v_race AND r.bib_number = n
    );

  UPDATE registrations
  SET bib_number = v_n
  WHERE id = p_registration_id;

  RETURN v_n;
END;
$fn$;

-- Solo el servidor (el sync usa service_role). Cerrar de las tres formas:
-- las funciones nuevas nacen con GRANT explícito a anon y authenticated.
REVOKE EXECUTE ON FUNCTION public.asignar_dorsal_carrera(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.asignar_dorsal_carrera(uuid) TO service_role;

-- 3) ADEMCO numera por carrera
UPDATE public.eventbooking_sync
SET numerar_por_carrera = true
WHERE race_id = '943d5450-0ee9-4283-a13a-cf673b6e248e';

-- Comprobación (esperado: f | f | t, y la fila de ADEMCO con true)
SELECT has_function_privilege('anon',          'public.asignar_dorsal_carrera(uuid)', 'EXECUTE') AS anon,
       has_function_privilege('authenticated', 'public.asignar_dorsal_carrera(uuid)', 'EXECUTE') AS authenticated,
       has_function_privilege('service_role',  'public.asignar_dorsal_carrera(uuid)', 'EXECUTE') AS service_role,
       (SELECT numerar_por_carrera FROM public.eventbooking_sync
         WHERE race_id = '943d5450-0ee9-4283-a13a-cf673b6e248e') AS ademco;
