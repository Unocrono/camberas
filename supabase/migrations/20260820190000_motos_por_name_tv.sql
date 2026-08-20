-- ============================================================
-- EL GRAFISMO MAPEA POR name_tv, NO POR ORDEN DE CREACIÓN (20-ago).
--
-- Hasta hoy tokens_motos_publico inventaba el dorsal con el orden de
-- creación ('M' || moto_order): si creabas MOTO1 y luego AMBULANCIA,
-- la ambulancia salía en el grafismo como M2. Ahora:
--
--   · tv_slot: hueco del grafismo (1, 2, 3) — solo lo tienen los GPS
--     marcados "para TV" (name_tv relleno), ordenados por moto_order
--   · name_tv: el nombre que SE MUESTRA en pantalla
--   · una ambulancia o la escoba (sin name_tv) → tv_slot NULL: emiten
--     y se ven en el mapa del organizador, pero el grafismo las ignora
--
-- bib_number se mantiene por compatibilidad con lo ya desplegado.
-- ============================================================

DROP FUNCTION IF EXISTS public.tokens_motos_publico(uuid);

CREATE OR REPLACE FUNCTION public.tokens_motos_publico(p_race_id uuid)
RETURNS TABLE(
  bib_number text, token_id uuid, moto_name text, color text,
  name_tv text, tv_slot int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT 'M' || m.moto_order,
         m.token_id,
         m.name,
         m.color,
         m.name_tv,
         CASE WHEN m.name_tv IS NOT NULL THEN
           (row_number() OVER (
              PARTITION BY (m.name_tv IS NOT NULL)
              ORDER BY m.moto_order))::int
         END
  FROM race_motos m
  JOIN gps_tokens t ON t.id = m.token_id AND t.active IS TRUE
  WHERE m.race_id = p_race_id AND m.is_active
  ORDER BY m.moto_order
$fn$;

GRANT EXECUTE ON FUNCTION public.tokens_motos_publico(uuid) TO anon, authenticated;
