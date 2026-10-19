-- Alta de un corredor por el organizador (Camberas Org → «Añadir corredor»):
-- el despistado que llega a recoger el dorsal sin haberse inscrito o sin
-- haber pagado se inscribe en la mesa, con el formulario completo, y se le
-- da dorsal en el momento (19-oct-2026).

-- 1) El organizador puede guardar las respuestas del formulario de sus
--    carreras. Hasta ahora solo podía verlas: el alta y la edición desde el
--    panel no guardaban las preguntas propias (talla, club…) de un
--    organizador, sin avisar (el admin sí podía).
DROP POLICY IF EXISTS "Organizadores gestionan respuestas de sus carreras" ON public.registration_responses;
CREATE POLICY "Organizadores gestionan respuestas de sus carreras" ON public.registration_responses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.registrations r
                  WHERE r.id = registration_responses.registration_id
                    AND public.puede_gestionar_carrera(r.race_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.registrations r
                       WHERE r.id = registration_responses.registration_id
                         AND public.puede_gestionar_carrera(r.race_id)));

-- 2) Dorsal siguiente para una inscripción, a petición del organizador o un
--    admin de su carrera. assign_next_bib es solo del servidor y no mira los
--    números ya puestos a mano; aquí se saltan los ocupados en la carrera.
--    Si ya tiene dorsal, devuelve el suyo. NULL = el recorrido no numera solo
--    (sin rango) o se ha agotado: se pone a mano.
CREATE OR REPLACE FUNCTION public.asignar_dorsal_siguiente(p_registration_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_reg record;
  v_bib integer;
  v_saltos integer := 0;
BEGIN
  SELECT id, race_id, race_distance_id, bib_number
    INTO v_reg
    FROM registrations
   WHERE id = p_registration_id
   FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'Inscripción no encontrada';
  END IF;
  IF NOT public.puede_gestionar_carrera(v_reg.race_id) THEN
    RAISE EXCEPTION 'Sin permiso sobre esta carrera' USING ERRCODE = '42501';
  END IF;
  IF v_reg.bib_number IS NOT NULL THEN
    RETURN v_reg.bib_number;
  END IF;

  LOOP
    v_bib := public.assign_next_bib(v_reg.race_distance_id);
    EXIT WHEN v_bib IS NULL;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM registrations
                           WHERE race_id = v_reg.race_id AND bib_number = v_bib);
    v_saltos := v_saltos + 1;
    IF v_saltos >= 2000 THEN
      v_bib := NULL;
      EXIT;
    END IF;
  END LOOP;

  IF v_bib IS NOT NULL THEN
    UPDATE registrations SET bib_number = v_bib WHERE id = p_registration_id;
  END IF;
  RETURN v_bib;
END;
$fn$;

REVOKE ALL ON FUNCTION public.asignar_dorsal_siguiente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asignar_dorsal_siguiente(uuid) TO authenticated, service_role;

-- Comprobación
SELECT 'politica' AS que, count(*)::text AS valor FROM pg_policies
 WHERE tablename = 'registration_responses' AND policyname = 'Organizadores gestionan respuestas de sus carreras'
UNION ALL
SELECT 'funcion anon', has_function_privilege('anon', 'public.asignar_dorsal_siguiente(uuid)', 'EXECUTE')::text
UNION ALL
SELECT 'funcion authenticated', has_function_privilege('authenticated', 'public.asignar_dorsal_siguiente(uuid)', 'EXECUTE')::text;
