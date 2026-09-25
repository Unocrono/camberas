-- =============================================================================
-- Estado de inscripción de cada carrera para el listado (/races)
--
-- La tarjeta del listado decía «Abiertas» a todo lo que no fuera pasado:
-- Gurriana antes de abrir, carreras con el plazo cerrado o con el cupo lleno.
-- estado_carreras() devuelve, en una sola llamada, el estado real de todas
-- las carreras visibles con la misma escalera que evento_publico y el widget:
--
--   celebrada        fecha pasada
--   proximamente     ningún recorrido abierto y alguno aún por abrir
--   abierta          algún recorrido abierto y ninguno agotado
--   agotada_parcial  algún recorrido abierto y otro agotado
--   agotada          ningún recorrido abierto y alguno agotado
--   cerrada          el resto (plazo cerrado)
--
-- Las ventanas de inscripción del recorrido mandan; si no las tiene, las de
-- la carrera. Plazas con plazas_libres() (misma regla que la ficha).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.estado_carreras()
RETURNS TABLE (race_id uuid, estado text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH dist AS (
    SELECT d.race_id,
           CASE
             WHEN r.date < current_date THEN 'celebrada'
             WHEN COALESCE(d.registration_opens,  r.registration_opens)  IS NOT NULL
                  AND now() < COALESCE(d.registration_opens,  r.registration_opens)  THEN 'proximamente'
             WHEN COALESCE(d.registration_closes, r.registration_closes) IS NOT NULL
                  AND now() > COALESCE(d.registration_closes, r.registration_closes) THEN 'cerrada'
             WHEN d.max_participants IS NOT NULL AND public.plazas_libres(d.id) <= 0 THEN 'agotada'
             ELSE 'abierta'
           END AS estado
    FROM race_distances d
    JOIN races r ON r.id = d.race_id
    WHERE r.is_visible = true AND d.is_visible = true
  )
  SELECT r.id AS race_id,
         CASE
           WHEN r.date < current_date THEN 'celebrada'
           WHEN NOT EXISTS (SELECT 1 FROM dist WHERE dist.race_id = r.id) THEN
             -- sin recorridos visibles: solo las ventanas de la carrera
             CASE
               WHEN r.registration_opens  IS NOT NULL AND now() < r.registration_opens  THEN 'proximamente'
               WHEN r.registration_closes IS NOT NULL AND now() > r.registration_closes THEN 'cerrada'
               ELSE 'abierta'
             END
           WHEN EXISTS (SELECT 1 FROM dist WHERE dist.race_id = r.id AND dist.estado = 'abierta')
                AND EXISTS (SELECT 1 FROM dist WHERE dist.race_id = r.id AND dist.estado = 'agotada') THEN 'agotada_parcial'
           WHEN EXISTS (SELECT 1 FROM dist WHERE dist.race_id = r.id AND dist.estado = 'abierta')      THEN 'abierta'
           WHEN EXISTS (SELECT 1 FROM dist WHERE dist.race_id = r.id AND dist.estado = 'proximamente') THEN 'proximamente'
           WHEN EXISTS (SELECT 1 FROM dist WHERE dist.race_id = r.id AND dist.estado = 'agotada')      THEN 'agotada'
           ELSE 'cerrada'
         END AS estado
  FROM races r
  WHERE r.is_visible = true;
$fn$;

GRANT EXECUTE ON FUNCTION public.estado_carreras() TO anon, authenticated;

COMMENT ON FUNCTION public.estado_carreras() IS
  'Estado de inscripción (celebrada, proximamente, abierta, agotada_parcial, agotada, cerrada) de todas las carreras visibles, para el listado.';

-- =============================================================================
-- Comprobaciones
-- =============================================================================
SELECT has_function_privilege('anon', 'public.estado_carreras()', 'EXECUTE') AS anon_debe_ser_true;
SELECT r.name, r.date, e.estado
  FROM public.estado_carreras() e JOIN public.races r ON r.id = e.race_id
 ORDER BY r.date DESC LIMIT 15;
