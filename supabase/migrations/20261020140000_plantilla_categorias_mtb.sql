-- Plantilla de categorías «CICLISMO MTB» con las categorías RFEC
-- (20-oct-2026, criterios del usuario). Edad a 31 de diciembre de la
-- temporada (age_calculation_method 'season'), como en todo el deporte
-- federado. Para 2027: Cadetes 2011-2012, Junior/Juvenil 2009-2010, Sub-23
-- 2005-2008, Élite 2004 y anteriores, Máster 30 1988-1997, Máster 40
-- 1978-1987, Máster 50 1968-1977, Máster 60 1967 y anteriores.
--
-- Élite es 23+ «sin licencia máster»: se solapa con los Máster a propósito.
-- resolver_race_category_id elige el rango más estrecho, así que de 30 años
-- en adelante la asignación automática da Máster; quien corra como Élite se
-- cambia a mano. «ENIke» y «Parejas» no son de edad: se quedan al final.
-- Solo cambia la PLANTILLA: las carreras que ya la cargaron no cambian.
-- Aplicado en producción el 20-oct.

UPDATE category_templates SET description = 'Ciclismo MTB (RFEC). Edad a 31 de diciembre de la temporada, como en todo el deporte federado. Élite es 23+ sin licencia máster: a partir de 30 años la asignación automática da Máster; el que corra como Élite se cambia a mano.', updated_at = now()
 WHERE id = '5b08c543-d470-4531-9574-042022eb5bf6';

UPDATE category_template_items AS i SET
  name = v.name, short_name = v.short_name, min_age = v.min_age, max_age = v.max_age,
  display_order = v.ord, age_dependent = true, age_calculation_method = 'season', gender = NULL, updated_at = now()
FROM (VALUES
  ('7bda5315-0416-4757-a8c6-c7101b385fae'::uuid, 'Élite',     'ELITE', 23, NULL::int, 4),
  ('ebb21a2f-59fd-4ee4-bd44-e3c654572c2c'::uuid, 'Sub-23',    'SUB23', 19, 22,        3),
  ('94387401-6553-44b5-9cee-d09ee9fd617a'::uuid, 'Máster 30', 'M30',   30, 39,        5),
  ('cdfe912d-14cb-4b8e-93d6-4507924c539b'::uuid, 'Máster 40', 'M40',   40, 49,        6),
  ('3408387d-c9bd-48ab-a213-db4acc6ce83e'::uuid, 'Máster 50', 'M50',   50, 59,        7),
  ('452cb675-e3d6-4478-a7f5-b940351e4623'::uuid, 'Máster 60', 'M60',   60, NULL::int, 8)
) AS v(id, name, short_name, min_age, max_age, ord)
WHERE i.id = v.id;

INSERT INTO category_template_items (template_id, name, short_name, gender, min_age, max_age, display_order, age_dependent, age_calculation_method)
SELECT '5b08c543-d470-4531-9574-042022eb5bf6', x.name, x.short_name, NULL, x.min_age, x.max_age, x.ord, true, 'season'
FROM (VALUES ('Cadetes', 'CAD', 15, 16, 1), ('Junior / Juvenil', 'JUN', 17, 18, 2)) AS x(name, short_name, min_age, max_age, ord)
WHERE NOT EXISTS (SELECT 1 FROM category_template_items c
                   WHERE c.template_id = '5b08c543-d470-4531-9574-042022eb5bf6' AND c.name = x.name);

UPDATE category_template_items SET display_order = 9 WHERE id = '90dfd079-460f-4163-a2dc-066abdd37e56';
UPDATE category_template_items SET display_order = 10 WHERE id = '83aff1f3-ef9b-4304-9695-2df031e7281f';
