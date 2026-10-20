-- Mesas de recogida: poder cambiarles el nombre (20-oct-2026).
--
-- Las 8 mesas de la XIX Carrera Entre Viñedos se crearon sin nombre y todas
-- se llamaban «Mesa»: en el panel no había forma de distinguirlas ni de
-- renombrarlas. Desde ahora el panel tiene un lápiz por mesa, y una mesa
-- creada sin nombre se llama «Mesa N» (su número de alta), que la pantalla
-- de la tablet enseña como «Mesa #N».

-- 1) Renombrar: admin u organizador de la carrera, como revocar
CREATE OR REPLACE FUNCTION public.renombrar_mesa_recogida(p_id uuid, p_nombre text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_race uuid;
  v_nombre text := btrim(coalesce(p_nombre, ''));
BEGIN
  SELECT race_id INTO v_race FROM mesas_recogida WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Mesa no encontrada'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR EXISTS (SELECT 1 FROM races r
                     WHERE r.id = v_race AND r.organizer_id = auth.uid())) THEN
    RAISE EXCEPTION 'Sin permiso sobre esta carrera';
  END IF;
  IF v_nombre = '' THEN RAISE EXCEPTION 'El nombre no puede quedar vacío'; END IF;
  IF length(v_nombre) > 80 THEN RAISE EXCEPTION 'Nombre demasiado largo (máximo 80)'; END IF;

  UPDATE mesas_recogida SET nombre = v_nombre WHERE id = p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.renombrar_mesa_recogida(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renombrar_mesa_recogida(uuid, text) TO authenticated, service_role;

-- 2) Las que se llaman solo «Mesa» pasan a «Mesa N» (N = orden de alta en su
--    carrera, el mismo número que enseña la tablet)
UPDATE mesas_recogida m
   SET nombre = 'Mesa ' || x.n
  FROM (SELECT id, row_number() OVER (PARTITION BY race_id ORDER BY created_at) AS n
          FROM mesas_recogida) x
 WHERE x.id = m.id
   AND btrim(m.nombre) = 'Mesa';
