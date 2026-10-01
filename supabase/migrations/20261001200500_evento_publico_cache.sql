-- =============================================================================
-- evento_publico con copia guardada (1-oct, apertura de Gurriana).
--
-- Cada visita a la web de una carrera llamaba a evento_publico, que cuesta
-- alrededor de un segundo de base de datos. Con la apertura de inscripciones
-- de Gurriana la base se saturó (consultas simples de 3 s, evento_publico
-- cancelado a los 7-10 s). Ahora la web llama a evento_publico_cache:
--   - si hay copia de menos de 90 s, la devuelve sin calcular nada;
--   - si no, la calcula UNA sola sesión (candado consultivo) y la guarda; las
--     demás se llevan la copia anterior mientras tanto.
-- Solo se guarda para visitantes sin sesión: con sesión, evento_publico puede
-- enseñar una carrera oculta a quien la gestiona (vista previa) y eso no
-- debe acabar en la copia que ven los demás.
--
-- No toca evento_publico ni horas. La copia puede llevar hasta 90 s de
-- retraso en estado y plazas libres; las inscripciones comprueban las plazas
-- en el servidor igualmente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.evento_publico_cache (
  slug     text PRIMARY KEY,
  datos    jsonb,
  generado timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.evento_publico_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.evento_publico_cache FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION public.evento_publico_cache(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET jit = off
AS $fn$
DECLARE
  v_datos    jsonb;
  v_generado timestamptz;
  v_hay      boolean;
BEGIN
  -- Con sesión: siempre en vivo (vista previa de carreras ocultas)
  IF auth.uid() IS NOT NULL THEN
    RETURN public.evento_publico(p_slug);
  END IF;

  SELECT c.datos, c.generado INTO v_datos, v_generado
    FROM public.evento_publico_cache c WHERE c.slug = p_slug;
  v_hay := FOUND;

  IF v_hay AND v_generado > now() - interval '90 seconds' THEN
    RETURN v_datos;
  END IF;

  -- Solo una sesión recalcula; las demás devuelven la copia que haya
  IF NOT pg_try_advisory_xact_lock(hashtext('evento_publico_cache:' || p_slug)) THEN
    IF v_hay THEN
      RETURN v_datos;
    END IF;
  END IF;

  v_datos := public.evento_publico(p_slug);
  INSERT INTO public.evento_publico_cache (slug, datos, generado)
  VALUES (p_slug, v_datos, now())
  ON CONFLICT (slug) DO UPDATE SET datos = EXCLUDED.datos, generado = EXCLUDED.generado;
  RETURN v_datos;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.evento_publico_cache(text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.evento_publico_cache(text) TO anon, authenticated, service_role;

-- Precalentar: copia de todas las carreras visibles ya hecha, para que el
-- primer visitante no tenga que calcularla (aquí no hay límite de tiempo)
INSERT INTO public.evento_publico_cache (slug, datos, generado)
SELECT r.slug, public.evento_publico(r.slug), now()
  FROM public.races r
 WHERE r.is_visible AND r.slug IS NOT NULL AND r.date >= current_date - 30
ON CONFLICT (slug) DO UPDATE SET datos = EXCLUDED.datos, generado = EXCLUDED.generado;

-- Comprobaciones
SELECT slug, generado, datos IS NOT NULL AS con_datos FROM public.evento_publico_cache ORDER BY slug;
SELECT has_function_privilege('anon', 'public.evento_publico_cache(text)', 'EXECUTE') AS anon_puede;
