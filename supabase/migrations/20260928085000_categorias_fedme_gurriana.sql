-- =============================================================================
-- Categorías FEDME (Absoluta + Veteranos A/B/C) como plantilla, y aplicadas a
-- la V Gurriana Trail 2027.
--
-- El reglamento FEDME dice «Absoluta: de 18 años en adelante; subcategorías
-- Veteranos A 40-49, B 50-59, C 60+». En Camberas cada corredor tiene UNA
-- categoría. Entre las que le cuadren por edad y sexo gana la de rango más
-- estrecho (la más específica), así que Absoluta (18 sin máximo) puede ir la
-- PRIMERA, como en el reglamento, y un corredor de 45 cae igualmente en
-- Veteranos A. La «absoluta de todos» del reglamento es la clasificación
-- general, que Camberas da siempre. Esta regla del rango más estrecho va en
-- src/lib/categoryUtils.ts y en las funciones SQL (20260928086000).
-- Edad a 31 de diciembre del año de la carrera ('season'), como la FEDME.
-- Idempotente.
-- =============================================================================

-- 1. Plantilla reutilizable (Plantillas de Categorías, menú Eventos)
INSERT INTO public.category_templates (name, description, is_default)
SELECT 'FEDME Absoluta + Veteranos', 'Absoluta desde 18 años y subcategorías Veteranos A (40-49), B (50-59) y C (60+), por sexo. Absoluta va la primera; a cada corredor se le asigna la categoría de rango más estrecho que le cuadre.', false
WHERE NOT EXISTS (SELECT 1 FROM public.category_templates WHERE name = 'FEDME Absoluta + Veteranos');

INSERT INTO public.category_template_items (template_id, name, short_name, gender, min_age, max_age, display_order, age_dependent, age_calculation_method)
SELECT t.id, i.name, i.short_name, i.gender, i.min_age, i.max_age, i.display_order, true, 'season'
FROM public.category_templates t,
     (VALUES
       ('Absoluta masculina',    'ABS M',   'M', 18, NULL, 1),
       ('Absoluta femenina',     'ABS F',   'F', 18, NULL, 2),
       ('Veteranos A masculino', 'VET A M', 'M', 40, 49,   3),
       ('Veteranas A femenino',  'VET A F', 'F', 40, 49,   4),
       ('Veteranos B masculino', 'VET B M', 'M', 50, 59,   5),
       ('Veteranas B femenino',  'VET B F', 'F', 50, 59,   6),
       ('Veteranos C masculino', 'VET C M', 'M', 60, NULL, 7),
       ('Veteranas C femenino',  'VET C F', 'F', 60, NULL, 8)
     ) AS i(name, short_name, gender, min_age, max_age, display_order)
WHERE t.name = 'FEDME Absoluta + Veteranos'
  AND NOT EXISTS (SELECT 1 FROM public.category_template_items x WHERE x.template_id = t.id);

-- 2. Gurriana: se sustituyen sus categorías actuales (no hay inscripciones aún)
DO $seed$
DECLARE
  v_race uuid := 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';
BEGIN
  IF EXISTS (SELECT 1 FROM public.registrations WHERE race_id = v_race AND race_category_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Gurriana ya tiene inscritos con categoría: cambia las categorías desde el panel';
  END IF;
  DELETE FROM public.race_categories WHERE race_id = v_race;
  INSERT INTO public.race_categories (race_id, race_distance_id, name, short_name, gender, min_age, max_age, age_dependent, age_calculation_date, display_order, category_number)
  SELECT v_race, NULL, i.name, i.short_name, i.gender, i.min_age, i.max_age, true, DATE '2027-12-31', i.display_order, i.display_order
  FROM public.category_template_items i
  JOIN public.category_templates t ON t.id = i.template_id
  WHERE t.name = 'FEDME Absoluta + Veteranos'
  ORDER BY i.display_order;
END
$seed$;

-- Comprobación: Absoluta primero, veteranos después
SELECT display_order, name, gender, min_age, max_age, age_calculation_date
  FROM public.race_categories WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e' ORDER BY display_order;
