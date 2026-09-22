-- La inscripción toma su categoría — sola, al crearse
--
-- Lo destapó la Peña Prieta: el organizador configuró las categorías de cada
-- recorrido (Trail: Cadete/Juvenil/Júnior/Promesa; Skyrace: Promesa/Senior/
-- VetA/VetB/VetC, con Absoluta de recogida)... y el panel enseña "-" en toda
-- la columna Categoría. El motivo: NADIE escribe registrations.race_category_id
-- en la inscripción web. El formulario calcula una categoría para ENSEÑARLA
-- (get_race_category) y la guarda como respuesta de texto, pero el id de
-- verdad —el que usan el panel, la cesión y el cronometraje— se queda NULL.
-- Solo la importación CSV lo rellenaba.
--
-- El resolutor bueno ya existía: resolver_race_category_id (de la cesión,
-- 20260826120000), por RECORRIDO, edad y sexo. Esta migración lo conecta:
--
--  1. Trigger en registrations: toda inscripción nueva resuelve su categoría
--     al crearse (única → esa; de edad → resolutor con fila o perfil). Si el
--     recorrido cambia después, se re-resuelve; si la categoría vino puesta
--     (importación, alta manual), se respeta.
--  2. Trigger en registration_responses: las categorías de ELECCIÓN
--     (Absoluta/Militar del Desafío Sarrio) no se pueden calcular — las
--     elige el corredor y llegan como respuesta del campo "category". Al
--     guardarse esa respuesta, se casa el nombre con la categoría del
--     recorrido y se escribe el id.
--  3. Se arreglan las inscripciones EXISTENTES de las dos carreras vivas
--     (Peña Prieta y Desafío Sarrio), con el mismo orden de verdad:
--     respuesta elegida > categoría única > edad y sexo.
--
-- Identidad como en 20260901230000: la fila primero, el perfil después —
-- las inscripciones con cuenta no llevan fecha de nacimiento ni sexo en la
-- fila. El sexo puede venir como texto o como gender_id (1=M, 2=F).

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Al crearse (o cambiar de recorrido), la inscripción resuelve su categoría
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.asignar_categoria_inscripcion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_birth  date;
  v_gender text;
  v_n      integer;
  v_unica  uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Cambio de recorrido: si la categoría sigue valiendo en el nuevo, se
    -- queda; si era del recorrido viejo, se re-resuelve
    IF NEW.race_category_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM race_categories rc
         WHERE rc.id = NEW.race_category_id
           AND (rc.race_distance_id = NEW.race_distance_id
                OR (rc.race_distance_id IS NULL AND rc.race_id = NEW.race_id))
       ) THEN
      RETURN NEW;
    END IF;
    NEW.race_category_id := NULL;
  ELSIF NEW.race_category_id IS NOT NULL THEN
    -- Vino puesta (importación, alta manual): se respeta
    RETURN NEW;
  END IF;

  -- Recorrido de categoría única: esa, sin preguntar nada
  SELECT count(*), min(rc.id::text)::uuid INTO v_n, v_unica
  FROM race_categories rc
  WHERE rc.race_distance_id = NEW.race_distance_id;
  IF v_n = 1 THEN
    NEW.race_category_id := v_unica;
    RETURN NEW;
  END IF;

  -- Varias categorías y ninguna depende de la edad: son de ELECCIÓN. La
  -- verdad es la respuesta del formulario (trigger de abajo); aquí no se
  -- adivina — mejor un "-" honesto que una Absoluta inventada.
  IF v_n > 1 AND NOT EXISTS (
    SELECT 1 FROM race_categories rc
    WHERE rc.race_distance_id = NEW.race_distance_id AND rc.age_dependent
  ) THEN
    RETURN NEW;
  END IF;

  -- Identidad: la fila primero, el perfil después; el sexo, como texto o
  -- como gender_id
  SELECT COALESCE(NEW.birth_date, p.birth_date),
         COALESCE(
           NULLIF(NEW.gender, ''),
           CASE NEW.gender_id WHEN 1 THEN 'M' WHEN 2 THEN 'F' END,
           NULLIF(p.gender, ''),
           CASE p.gender_id WHEN 1 THEN 'M' WHEN 2 THEN 'F' END
         )
    INTO v_birth, v_gender
  FROM (SELECT 1) unused
  LEFT JOIN profiles p ON p.id = NEW.user_id;

  NEW.race_category_id :=
    public.resolver_race_category_id(NEW.race_distance_id, v_birth, v_gender);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.asignar_categoria_inscripcion() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trigger_asignar_categoria_inscripcion ON public.registrations;
CREATE TRIGGER trigger_asignar_categoria_inscripcion
BEFORE INSERT OR UPDATE OF race_distance_id ON public.registrations
FOR EACH ROW
EXECUTE FUNCTION public.asignar_categoria_inscripcion();

-- ═════════════════════════════════════════════════════════════════════════
-- 2. La categoría ELEGIDA en el formulario escribe el id de verdad
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.asignar_categoria_por_respuesta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre text;
  v_reg    registrations%ROWTYPE;
  v_id     uuid;
BEGIN
  -- Solo interesa la respuesta del campo "category"
  IF NOT EXISTS (
    SELECT 1 FROM registration_form_fields f
    WHERE f.id = NEW.field_id AND f.field_name = 'category'
  ) THEN
    RETURN NEW;
  END IF;

  v_nombre := trim(NEW.field_value);
  IF v_nombre = '' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_reg FROM registrations WHERE id = NEW.registration_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- El nombre elegido, casado con las categorías DE ESE RECORRIDO (o las
  -- generales de la carrera). Si no casa con ninguna —p. ej. el texto
  -- calculado para otro recorrido—, no se toca nada.
  SELECT rc.id INTO v_id
  FROM race_categories rc
  WHERE (rc.race_distance_id = v_reg.race_distance_id
         OR (rc.race_distance_id IS NULL AND rc.race_id = v_reg.race_id))
    AND (lower(rc.name) = lower(v_nombre)
         OR lower(COALESCE(rc.short_name, '')) = lower(v_nombre))
  ORDER BY (rc.race_distance_id IS NOT NULL) DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE registrations
    SET race_category_id = v_id
    WHERE id = NEW.registration_id
      AND race_category_id IS DISTINCT FROM v_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.asignar_categoria_por_respuesta() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trigger_asignar_categoria_por_respuesta ON public.registration_responses;
CREATE TRIGGER trigger_asignar_categoria_por_respuesta
AFTER INSERT OR UPDATE OF field_value ON public.registration_responses
FOR EACH ROW
EXECUTE FUNCTION public.asignar_categoria_por_respuesta();

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Las inscripciones existentes de las dos carreras vivas
--    Peña Prieta: 4ba602c8-4445-4170-82bf-e37f79b047b3
--    Desafío Sarrio: b37a8668-e6fe-4018-bbe0-d20c1141ac53
-- ═════════════════════════════════════════════════════════════════════════

-- 3a. Primero la eleccion explicita del corredor (respuesta del formulario)
UPDATE registrations r
SET race_category_id = elegido.categoria_id
FROM (
  SELECT DISTINCT ON (rr.registration_id)
         rr.registration_id, rc.id AS categoria_id
  FROM registration_responses rr
  JOIN registration_form_fields f ON f.id = rr.field_id AND f.field_name = 'category'
  JOIN registrations r2 ON r2.id = rr.registration_id
  JOIN race_categories rc
    ON (rc.race_distance_id = r2.race_distance_id
        OR (rc.race_distance_id IS NULL AND rc.race_id = r2.race_id))
   AND (lower(rc.name) = lower(trim(rr.field_value))
        OR lower(COALESCE(rc.short_name, '')) = lower(trim(rr.field_value)))
  WHERE r2.race_id IN ('4ba602c8-4445-4170-82bf-e37f79b047b3',
                       'b37a8668-e6fe-4018-bbe0-d20c1141ac53')
  ORDER BY rr.registration_id, (rc.race_distance_id IS NOT NULL) DESC
) elegido
WHERE r.id = elegido.registration_id
  AND r.race_category_id IS NULL;

-- 3b. Recorridos de categoria unica (la Marcha de cada carrera)
UPDATE registrations r
SET race_category_id = u.categoria_id
FROM (
  SELECT race_distance_id, min(id::text)::uuid AS categoria_id
  FROM race_categories
  GROUP BY race_distance_id
  HAVING count(*) = 1
) u
WHERE r.race_distance_id = u.race_distance_id
  AND r.race_category_id IS NULL
  AND r.race_id IN ('4ba602c8-4445-4170-82bf-e37f79b047b3',
                    'b37a8668-e6fe-4018-bbe0-d20c1141ac53');

-- 3c. El resto, por edad y sexo (fila o perfil), solo donde hay categorias de edad
UPDATE registrations r
SET race_category_id = public.resolver_race_category_id(
      r.race_distance_id,
      COALESCE(r.birth_date,
               (SELECT p.birth_date FROM profiles p WHERE p.id = r.user_id)),
      COALESCE(NULLIF(r.gender, ''),
               CASE r.gender_id WHEN 1 THEN 'M' WHEN 2 THEN 'F' END,
               (SELECT NULLIF(p.gender, '') FROM profiles p WHERE p.id = r.user_id),
               (SELECT CASE p.gender_id WHEN 1 THEN 'M' WHEN 2 THEN 'F' END
                FROM profiles p WHERE p.id = r.user_id)))
WHERE r.race_category_id IS NULL
  AND r.race_id IN ('4ba602c8-4445-4170-82bf-e37f79b047b3',
                    'b37a8668-e6fe-4018-bbe0-d20c1141ac53')
  AND EXISTS (SELECT 1 FROM race_categories rc
              WHERE rc.race_distance_id = r.race_distance_id
                AND rc.age_dependent);

-- ═════════════════════════════════════════════════════════════════════════
-- Comprobacion: cuantas inscripciones hay en cada categoria. Las filas
-- "— SIN CATEGORIA —" que queden deberian ser solo las que no tienen ni
-- fecha de nacimiento ni eleccion con que resolverlas.
-- ═════════════════════════════════════════════════════════════════════════
SELECT ra.name                                              AS carrera,
       d.name                                               AS recorrido,
       COALESCE(rc.short_name, rc.name, '— SIN CATEGORIA —') AS categoria,
       count(*)                                             AS inscripciones
FROM registrations r
JOIN races ra          ON ra.id = r.race_id
JOIN race_distances d  ON d.id  = r.race_distance_id
LEFT JOIN race_categories rc ON rc.id = r.race_category_id
WHERE r.race_id IN ('4ba602c8-4445-4170-82bf-e37f79b047b3',
                    'b37a8668-e6fe-4018-bbe0-d20c1141ac53')
  AND r.status IS DISTINCT FROM 'cancelled'
GROUP BY ra.name, d.name, COALESCE(rc.short_name, rc.name, '— SIN CATEGORIA —')
ORDER BY carrera, recorrido, inscripciones DESC;
