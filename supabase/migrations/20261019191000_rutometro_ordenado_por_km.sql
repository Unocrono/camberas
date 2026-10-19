-- =============================================================================
-- Rutómetro: los puntos, siempre en el orden del recorrido (19-oct-2026).
--
-- Las listas del rutómetro (panel, página pública, web propia, los mapas que
-- dibujan la línea) ordenan por item_order. Pero un punto añadido en el panel
-- entraba al final (item_order = total de la lista, y con un filtro puesto, el
-- total filtrado), y al regenerar desde el GPX los puntos del panel y de campo
-- se quedaban con su número viejo. En Monte Tejas el avituallamiento del km 5,5
-- salía detrás de la meta.
--
-- 1. Disparador: después de cada INSERT, y de cada UPDATE que cambie km_total
--    o el rutómetro, se renumeran por km los rutómetros tocados, una vez por
--    sentencia (no por fila: el GPX entra en tandas de 500). Con el mismo km
--    manda el orden que ya tenían (así un waypoint sigue detrás de su punto
--    del track). km_total es NOT NULL. Solo se reescriben las filas cuyo
--    número cambia. La función es de disparador: nadie la llama por RPC y se
--    cierra a anon, authenticated y PUBLIC (el disparador salta igual).
-- 2. Una vez: se renumeran los rutómetros que hoy no están en orden de km o
--    tienen números repetidos (solo Monte Tejas).
--
-- Lleva bloques de función: se aplica con la consulta de Lovable, no con el
-- editor SQL. No toca horas. Ensayada en seco (también como organizador, con
-- su RLS) y APLICADA el 19-oct-2026.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rutometro_ordenar_por_km()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- La renumeración es un UPDATE de esta misma tabla: no vuelve a disparar
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  -- En un UPDATE, solo si ha cambiado algún km o algún punto de rutómetro
  -- (marcar destacado, cambiar el tipo o la descripción no reordena)
  IF TG_OP = 'UPDATE' THEN
    IF NOT EXISTS (SELECT 1 FROM nuevos n JOIN viejos v ON v.id = n.id
                    WHERE n.km_total IS DISTINCT FROM v.km_total
                       OR n.roadbook_id IS DISTINCT FROM v.roadbook_id) THEN
      RETURN NULL;
    END IF;
  END IF;

  UPDATE roadbook_items i
     SET item_order = o.orden
    FROM (SELECT x.id,
                 (row_number() OVER (PARTITION BY x.roadbook_id
                                     ORDER BY x.km_total, x.item_order, x.created_at, x.id) - 1)::int AS orden
            FROM roadbook_items x
           WHERE x.roadbook_id IN (SELECT DISTINCT n.roadbook_id FROM nuevos n)) o
   WHERE i.id = o.id
     AND i.item_order IS DISTINCT FROM o.orden;

  RETURN NULL;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.rutometro_ordenar_por_km() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS roadbook_items_orden_al_insertar ON public.roadbook_items;
CREATE TRIGGER roadbook_items_orden_al_insertar
  AFTER INSERT ON public.roadbook_items
  REFERENCING NEW TABLE AS nuevos
  FOR EACH STATEMENT EXECUTE FUNCTION public.rutometro_ordenar_por_km();

DROP TRIGGER IF EXISTS roadbook_items_orden_al_cambiar_km ON public.roadbook_items;
CREATE TRIGGER roadbook_items_orden_al_cambiar_km
  AFTER UPDATE ON public.roadbook_items
  REFERENCING OLD TABLE AS viejos NEW TABLE AS nuevos
  FOR EACH STATEMENT EXECUTE FUNCTION public.rutometro_ordenar_por_km();

-- Una vez: los rutómetros que hoy están desordenados o con números repetidos
UPDATE public.roadbook_items i
   SET item_order = o.orden
  FROM (SELECT x.id,
               (row_number() OVER (PARTITION BY x.roadbook_id
                                   ORDER BY x.km_total, x.item_order, x.created_at, x.id) - 1)::int AS orden
          FROM public.roadbook_items x
         WHERE x.roadbook_id IN (
                 SELECT s.roadbook_id
                   FROM (SELECT y.roadbook_id, y.km_total,
                                lag(y.km_total) OVER (PARTITION BY y.roadbook_id ORDER BY y.item_order, y.id) AS km_ant,
                                count(*) OVER (PARTITION BY y.roadbook_id, y.item_order) AS repes
                           FROM public.roadbook_items y) s
                  WHERE s.km_total < s.km_ant OR s.repes > 1)) o
 WHERE i.id = o.id
   AND i.item_order IS DISTINCT FROM o.orden;

-- Comprobación: ningún rutómetro con km que retroceden ni números repetidos,
-- y el de Monte Tejas en orden
SELECT (SELECT count(*) FROM (SELECT km_total < lag(km_total) OVER (PARTITION BY roadbook_id ORDER BY item_order, id) AS retrocede
                                FROM public.roadbook_items) s WHERE s.retrocede) AS km_que_retroceden,
       (SELECT count(*) FROM (SELECT 1 FROM public.roadbook_items GROUP BY roadbook_id, item_order HAVING count(*) > 1) s) AS numeros_repetidos,
       (SELECT string_agg(i.item_order || ' ' || i.description || ' km ' || i.km_total, ' | ' ORDER BY i.item_order)
          FROM public.roadbook_items i
         WHERE i.roadbook_id = 'ce1532c8-b80c-4cbd-b811-4a4f759983a8' AND i.item_type <> 'point') AS monte_tejas,
       has_function_privilege('anon', 'public.rutometro_ordenar_por_km()', 'EXECUTE') AS anon_puede;
