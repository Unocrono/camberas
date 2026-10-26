-- =============================================================================
-- assign_next_bib: nunca devuelve un dorsal que ya tenga otra inscripción de
-- la carrera (26-oct-2026).
--
-- Monte Tejas, apertura del 26-oct: el 103 y el 104 salieron dos veces,
-- a corredores pagados. El contador race_distances.next_bib es atómico, pero
-- el formulario de Recorridos lo guardaba con el valor que tenía al abrirse.
-- Alguien lo abrió con el contador en 103 y lo guardó cuando iba por 105, el
-- contador volvió a 103 y los dos pagos siguientes (redsys-webhook llama a
-- assign_next_bib al confirmar) se llevaron el 103 y el 104 otra vez.
--
-- El panel ya no reescribe el contador si no se toca (DistanceManagement).
-- Aquí, además, assign_next_bib salta los números ya ocupados en la carrera,
-- como ya hacía asignar_dorsal_siguiente por fuera: si el contador vuelve
-- atrás por lo que sea, no repite. Mismo tope (bib_end) y misma firma.
-- Los dos repetidos que ya existen no se tocan aquí: los decide el promotor.
--
-- Lleva cuerpo de función: se aplica con la consulta de Lovable.
-- Ensayada en seco y APLICADA el 26-oct-2026.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assign_next_bib(p_distance_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_bib  integer;
  v_race uuid;
BEGIN
  LOOP
    UPDATE race_distances
       SET next_bib = next_bib + 1
     WHERE id = p_distance_id
       AND next_bib IS NOT NULL
       AND (bib_end IS NULL OR next_bib <= bib_end)
    RETURNING next_bib - 1, race_id INTO v_bib, v_race;

    -- Sin contador o fuera del rango: como siempre, NULL
    EXIT WHEN v_bib IS NULL;
    -- Libre en toda la carrera: es este
    EXIT WHEN NOT EXISTS (SELECT 1 FROM registrations r
                           WHERE r.race_id = v_race AND r.bib_number = v_bib);
    -- Ocupado: el contador ya ha avanzado, se prueba el siguiente
  END LOOP;
  RETURN v_bib;
END
$fn$;

-- Permisos: CREATE OR REPLACE conserva los que tenía (solo postgres y
-- service_role). La llaman redsys-webhook, guest-register y team-register con
-- service_role, y asignar_dorsal_siguiente por dentro.

-- Guardia de horas (CLAUDE.md): ningún FALLO
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;

-- Comprobación
SELECT has_function_privilege('anon', 'public.assign_next_bib(uuid)', 'EXECUTE') AS anon_puede,
       has_function_privilege('authenticated', 'public.assign_next_bib(uuid)', 'EXECUTE') AS authenticated_puede;
