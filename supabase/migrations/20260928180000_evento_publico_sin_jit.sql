-- =============================================================================
-- evento_publico sin JIT.
--
-- Síntoma (28-sep): la web de todas las carreras tardaba o caía en la ficha
-- antigua. evento_publico pasaba del límite de 3 s de anon en TODAS las
-- carreras, y también con un slug que no existe, donde apenas lee nada.
-- Así que el tiempo no está en los datos sino en preparar la consulta: es
-- una sola consulta SQL enorme (decenas de subconsultas y jsonb_build_object)
-- y, cuando el planificador la estima cara, Postgres la compila con JIT en
-- cada llamada, lo que cuesta segundos. Crece con las estadísticas de las
-- tablas (roadbook_items ya tiene 28.000 filas), por eso empeoró sin cambios.
--
-- Solo se cambia la configuración de la función (SET jit = off), no su
-- cuerpo: no hay sustitución y no toca horas. Se deshace con
--   ALTER FUNCTION public.evento_publico(text) RESET jit;
-- =============================================================================

ALTER FUNCTION public.evento_publico(text) SET jit = off;

-- Comprobaciones ---------------------------------------------------------------
-- La función lleva jit=off junto a su search_path
SELECT proconfig FROM pg_proc WHERE oid = 'public.evento_publico(text)'::regprocedure;

-- Tiempo de una llamada (debe bajar a décimas de segundo)
DO $$
DECLARE t0 timestamptz := clock_timestamp(); n int;
BEGIN
  n := length(public.evento_publico('gurriana-trail-2027')::text);
  RAISE NOTICE 'evento_publico(gurriana): % bytes en % ms', n, round(extract(epoch FROM clock_timestamp() - t0) * 1000);
END $$;
