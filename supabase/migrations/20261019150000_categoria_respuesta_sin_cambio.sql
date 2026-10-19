-- Reescribir la MISMA respuesta de «category» ya no recoloca la categoría
-- (19-oct-2026).
--
-- Al editar una inscripción en el panel se hace upsert de todas las
-- respuestas, también la de 'category' con el texto que tenía. Si el
-- organizador había cambiado la categoría en el desplegable
-- (race_category_id), este trigger la devolvía a la del texto viejo. Hasta
-- hoy a un organizador ese upsert se lo rechazaba RLS en silencio (y solo le
-- pasaba al admin); con la política «Organizadores gestionan respuestas de
-- sus carreras» (20261019120000) le pasaba a todos. Un texto DISTINTO sigue
-- recolocando la categoría como siempre.

CREATE OR REPLACE FUNCTION public.asignar_categoria_por_respuesta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Reescribir el mismo texto (upsert del panel al guardar) no recoloca la
  -- categoría: la que se cambió a mano en el desplegable se respeta
  IF TG_OP = 'UPDATE' AND OLD.field_value IS NOT DISTINCT FROM NEW.field_value THEN
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
$function$;

REVOKE EXECUTE ON FUNCTION public.asignar_categoria_por_respuesta() FROM anon, authenticated, PUBLIC;
