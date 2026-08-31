-- Borrar una carrera con corredores no puede costar un clic
--
-- Lo dijo el organizador de pruebas tras borrar una carrera sin querer: "la he
-- borrado con demasiada facilidad". Y tiene razón en que es grave:
--
--   · 30 tablas cascadean desde races: inscripciones con sus pagos, lecturas
--     de cronometraje, resultados, respuestas del formulario, tokens GPS...
--   · El organizador puede borrar sus carreras por RLS (20251121174802:34-35),
--     no solo el admin.
--   · Y en este proyecto NO hay pg_dump: la única copia es el export de
--     Lovable (docs/copias-de-seguridad.md). Un borrado accidental entre
--     export y export es irrecuperable.
--
-- La protección va AQUÍ y no solo en el diálogo del panel, porque un aviso
-- en pantalla se salta con la consola del navegador; un trigger, no.
--
-- LA REGLA: una carrera con historia no se borra. Historia es tener
-- inscripciones (las canceladas también: son registro), lecturas de
-- cronometraje o resultados. Una carrera recién creada, aunque tenga
-- recorridos y GPX configurados, sí se puede borrar: ahí no hay datos de
-- nadie, solo trabajo propio.
--
-- Vale para TODOS, admin incluido. Si de verdad hay que borrar una carrera
-- con datos (la demo se vacía periódicamente, por ejemplo), primero se
-- borran sus inscripciones desde el panel — que es una acción aparte, con su
-- propia confirmación — y entonces la carrera se deja borrar. Ese paso extra
-- ES la protección: convierte un clic en una decisión.

CREATE OR REPLACE FUNCTION public.races_borrado_protegido()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_inscripciones integer;
  v_lecturas      integer;
  v_resultados    integer;
BEGIN
  SELECT count(*) INTO v_inscripciones
  FROM registrations r WHERE r.race_id = OLD.id;

  SELECT count(*) INTO v_lecturas
  FROM timing_readings t WHERE t.race_id = OLD.id;

  SELECT count(*) INTO v_resultados
  FROM race_results rr
  JOIN race_distances d ON d.id = rr.race_distance_id
  WHERE d.race_id = OLD.id;

  IF v_inscripciones > 0 OR v_lecturas > 0 OR v_resultados > 0 THEN
    RAISE EXCEPTION USING
      errcode = 'P0001',
      message = format(
        'La carrera "%s" tiene historia y no se puede borrar: %s inscripciones, %s lecturas de cronometraje, %s resultados. Si de verdad quieres eliminarla, borra antes sus inscripciones desde el panel.',
        OLD.name, v_inscripciones, v_lecturas, v_resultados
      );
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS races_borrado_protegido_trg ON public.races;
CREATE TRIGGER races_borrado_protegido_trg
  BEFORE DELETE ON public.races
  FOR EACH ROW EXECUTE FUNCTION public.races_borrado_protegido();

-- ─────────────────────────────────────────────────────────────────────────
-- Comprobación: intentar borrar una carrera con inscripciones debe fallar
-- con el mensaje de arriba, y una recién creada debe dejarse borrar.
--
--   SELECT tgname, tgenabled FROM pg_trigger
--    WHERE tgrelid = 'public.races'::regclass AND tgname LIKE 'races_borrado%';
-- ─────────────────────────────────────────────────────────────────────────
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.races'::regclass
  AND tgname = 'races_borrado_protegido_trg';
