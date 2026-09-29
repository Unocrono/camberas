-- =============================================================================
-- Plantillas de categorías sin sexo.
--
-- «FEDME» (Sub20 a Vet65) y «RFEA Estándar» (Sub18 a Vet65, la plantilla por
-- defecto) tenían todas sus categorías con gender = 'M' y ninguna 'F'. Al
-- aplicarlas a una carrera, una mujer no encajaba en ninguna categoría (el
-- mismo fallo que La Garita, 20260929080000). En Camberas la categoría va sin
-- sexo: el género de la inscripción pone M-/F- y separa la clasificación.
--
-- Solo se tocan las plantillas con categorías de un único sexo; una plantilla
-- con masculinas Y femeninas se deja como está.
-- =============================================================================

UPDATE public.category_template_items i
   SET gender = NULL
 WHERE i.gender IS NOT NULL
   AND i.template_id IN (
     SELECT template_id FROM public.category_template_items
      GROUP BY template_id
     HAVING (count(*) FILTER (WHERE gender = 'M') > 0) <> (count(*) FILTER (WHERE gender = 'F') > 0));

-- Comprobación: ninguna plantilla con categorías de un solo sexo
SELECT t.name, count(*) FILTER (WHERE i.gender IS NOT NULL) AS con_sexo, count(*) AS categorias
  FROM public.category_templates t JOIN public.category_template_items i ON i.template_id = t.id
 GROUP BY t.id, t.name ORDER BY t.name;
