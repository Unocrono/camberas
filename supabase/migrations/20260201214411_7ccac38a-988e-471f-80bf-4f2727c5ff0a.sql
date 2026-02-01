-- 1. Eliminar tabla moto_assignments (redundante con race_motos.user_id)
DROP TABLE IF EXISTS public.moto_assignments;

-- 2. Actualizar función para usar solo race_motos.user_id
CREATE OR REPLACE FUNCTION public.user_has_moto_assignment_for_distance(distance_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM race_motos rm
    WHERE rm.user_id = auth.uid()
      AND rm.is_active = true
      AND (
        rm.race_distance_id = distance_id
        OR rm.race_id = (SELECT race_id FROM race_distances WHERE id = distance_id)
      )
  );
END;
$function$;

-- 3. Eliminar función obsoleta is_moto_for_race
DROP FUNCTION IF EXISTS public.is_moto_for_race(uuid, uuid);