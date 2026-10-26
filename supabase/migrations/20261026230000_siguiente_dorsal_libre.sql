-- =============================================================================
-- siguiente_dorsal_libre: el cuadro «Asignar dorsal» del panel pide el
-- siguiente libre con un clic (26-oct-2026).
--
-- asignar_dorsal_siguiente (20261019120000) solo numera inscripciones SIN
-- dorsal: es la del alta en /org. Esta sirve también para cambiar uno que ya
-- lo tiene (esta noche, los repetidos 103 y 104 de Monte Tejas): pide el
-- siguiente al contador del recorrido con assign_next_bib, que desde
-- 20261026220000 salta los números ocupados en la carrera, y lo escribe.
-- Devuelve NULL si el recorrido no tiene rango o está agotado; el panel
-- avisa y deja teclearlo a mano.
--
-- Permisos: entra quien gestiona la carrera (puede_gestionar_carrera), como
-- asignar_dorsal_siguiente. SECURITY DEFINER para poder llamar a
-- assign_next_bib (solo service_role). Cerrada a anon. No toca horas.
-- Ensayada en seco y APLICADA el 26-oct-2026.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.siguiente_dorsal_libre(p_registration_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_reg record;
  v_bib integer;
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

  v_bib := public.assign_next_bib(v_reg.race_distance_id);
  IF v_bib IS NOT NULL THEN
    UPDATE registrations SET bib_number = v_bib WHERE id = p_registration_id;
  END IF;
  RETURN v_bib;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.siguiente_dorsal_libre(uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.siguiente_dorsal_libre(uuid) TO authenticated;

-- Guardia de horas (CLAUDE.md): ningún FALLO
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;

NOTIFY pgrst, 'reload schema';

-- Comprobación: anon no entra, authenticated sí
SELECT has_function_privilege('anon', 'public.siguiente_dorsal_libre(uuid)', 'EXECUTE') AS anon_puede,
       has_function_privilege('authenticated', 'public.siguiente_dorsal_libre(uuid)', 'EXECUTE') AS authenticated_puede;
