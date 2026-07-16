-- Asignación atómica de dorsal: incrementa next_bib y devuelve el asignado.
-- Elimina la carrera de datos del cálculo cliente (dos inscripciones
-- simultáneas recibían el mismo dorsal).
CREATE OR REPLACE FUNCTION public.assign_next_bib(p_distance_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bib integer;
BEGIN
  UPDATE race_distances
  SET next_bib = next_bib + 1
  WHERE id = p_distance_id
    AND next_bib IS NOT NULL
    AND (bib_end IS NULL OR next_bib <= bib_end)
  RETURNING next_bib - 1 INTO v_bib;
  RETURN v_bib; -- NULL si no hay rango configurado o está agotado
END;
$$;

REVOKE ALL ON FUNCTION public.assign_next_bib(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.assign_next_bib(uuid) TO authenticated, service_role;
