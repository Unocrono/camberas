-- =============================================================================
-- La Garita (2025 y su duplicado de 2026): categorías sin sexo.
--
-- Las categorías del trail (Infantil a VetC) tenían gender = 'M'. En Camberas
-- no hacen falta categorías femeninas: la categoría va sin sexo y el género
-- de cada inscripción pone el prefijo M- o F- y separa la clasificación. Con
-- 'M' fijado, una mujer no encajaba en ninguna (get_race_category devolvía
-- NULL para una mujer de 35 años y «Senior» para un hombre de la misma edad).
-- Se deja gender = NULL, como en Gurriana.
-- =============================================================================

UPDATE public.race_categories rc
   SET gender = NULL
  FROM public.races r
 WHERE r.id = rc.race_id
   AND r.name ILIKE '%garita%'
   AND rc.gender IS NOT NULL;

-- Comprobación: ninguna categoría de La Garita con sexo; una mujer de 35 años ya es Senior
SELECT r.name, r.date, count(*) FILTER (WHERE rc.gender IS NOT NULL) AS con_sexo, count(*) AS categorias
  FROM public.races r JOIN public.race_categories rc ON rc.race_id = r.id
 WHERE r.name ILIKE '%garita%'
 GROUP BY r.id, r.name, r.date ORDER BY r.date;
SELECT public.get_race_category('6e92d4f4-8f50-4a43-aeda-87992d74a95f', DATE '1990-06-01', 'F', '09da3511-8f48-420d-816a-e50201e2a052') AS mujer_35_trail_2025;

-- Mujeres del trail de 2025 que se quedaron sin categoría (solo se listan; ver abajo)
SELECT count(*) AS mujeres_sin_categoria_2025
  FROM public.registrations g
 WHERE g.race_distance_id = '09da3511-8f48-420d-816a-e50201e2a052'
   AND g.race_category_id IS NULL
   AND (g.gender_id = 2 OR g.gender IN ('F', 'Femenino', 'female', 'Female'));

-- Para dárselas (cambia la clasificación por categorías de 2025; decidirlo antes):
-- UPDATE public.registrations g
--    SET race_category_id = public.resolver_race_category_id(g.race_distance_id, g.birth_date, 'F')
--  WHERE g.race_distance_id = '09da3511-8f48-420d-816a-e50201e2a052'
--    AND g.race_category_id IS NULL
--    AND (g.gender_id = 2 OR g.gender IN ('F', 'Femenino', 'female', 'Female'));

-- Otras carreras con categorías de un solo sexo (no se tocan: solo para revisar)
SELECT r.name, r.date,
       count(*) FILTER (WHERE rc.gender = 'M') AS solo_masculinas,
       count(*) FILTER (WHERE rc.gender = 'F') AS solo_femeninas
  FROM public.races r JOIN public.race_categories rc ON rc.race_id = r.id
 GROUP BY r.id, r.name, r.date
HAVING (count(*) FILTER (WHERE rc.gender = 'M') > 0) <> (count(*) FILTER (WHERE rc.gender = 'F') > 0)
 ORDER BY r.date DESC;
