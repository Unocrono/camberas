-- ============================================================
-- TIEMPO DE CORTE EN HORAS ENTERAS O DECIMALES (27-sep) — APLICADA
--
-- gps_cutoff_interval sacaba el número con substring(... from
-- '\d+([.,]\d+)?'), y substring con un grupo entre paréntesis devuelve
-- SOLO el grupo: con "8" o "7 h" daba NULL (ventana sin fin → la política
-- de INSERT rechaza TODAS las posiciones del recorrido, en silencio), y con
-- "6,5" devolvía 30 minutos. Encontrado por un revisor adversarial tras la
-- marcha ADEMCO; comprobado en producción:
--     "8" NULL → 08:00 · "7 h" NULL → 07:00 · "6,5" 00:30 → 06:30
-- Ningún recorrido existente cambia de ventana (0 de 34 comparadas): todos
-- usan hh:mm o nada. El grupo pasa a no-capturador (?:...).
-- ============================================================

CREATE OR REPLACE FUNCTION public.gps_cutoff_interval(p_cutoff text, p_group text)
 RETURNS interval LANGUAGE sql IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_group = 'grupetta' THEN interval '6 hours'
    WHEN p_cutoff ~ '^\s*\d{1,2}:\d{2}' THEN
      (substring(p_cutoff from '\d{1,2}:\d{2}') || ':00')::interval
    WHEN p_cutoff ~ '^\s*\d+([.,]\d+)?\s*(h|horas?)?\s*$' THEN
      make_interval(mins => round(replace(substring(p_cutoff from '\d+(?:[.,]\d+)?'),
                                          ',', '.')::numeric * 60)::int)
    ELSE interval '12 hours'
  END
$function$;
