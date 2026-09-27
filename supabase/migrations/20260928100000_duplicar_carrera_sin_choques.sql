-- ============================================================
-- DUPLICAR CARRERA VOLVÍA A FALLAR (27-sep)
--
-- Al insertar cada recorrido nuevo, los triggers de race_distances siembran
-- la categoría 'UNICA' (create_default_category) y los controles Salida/Meta
-- (auto_create_distance_checkpoints). Después duplicar_carrera copiaba las
-- categorías y los controles de la edición original y chocaba con las claves
-- únicas (race_categories_race_distance_name_key,
-- race_checkpoints_distance_checkpoint_order_key). Fallaba en ADEMCO, Loiu,
-- Peña Prieta y Garita.
--
-- Arreglo, el mismo que ya se hacía con el formulario de inscripción: si el
-- recorrido original tiene categorías / controles propios, se borran los
-- sembrados antes de copiar. Los sembrados acaban de nacer y nada los
-- referencia.
--
-- APLICADA en producción el 27-sep, por sustitución sobre la definición de
-- producción (1 aparición). Ensayada con ROLLBACK duplicando ADEMCO, Peña
-- Prieta, Loiu y Garita: categorías y controles idénticos al original
-- (3/3, 12/12, 2/2, 12/12 y 6/6, 6/6, 4/4, 9/9) y salidas desplazadas con
-- prevista = oficial. Guardia de horas 0 FALLO.
-- ============================================================

SET client_encoding = 'UTF8';

BEGIN;
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION pg_temp.sustituir(p_fn regprocedure, p_patron text, p_nuevo text, p_n int DEFAULT 1)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE d text; n int;
BEGIN
  d := pg_get_functiondef(p_fn);
  SELECT count(*) INTO n FROM regexp_matches(d, p_patron, 'g');
  IF n <> p_n THEN RAISE EXCEPTION '%: se esperaban % apariciones y hay %', p_fn, p_n, n; END IF;
  EXECUTE regexp_replace(d, p_patron, p_nuevo, 'g');
END $f$;

SELECT pg_temp.sustituir('public.duplicar_carrera(uuid,text,date,text,boolean)',
  $p$(DELETE FROM public\.registration_form_fields WHERE race_distance_id = v_id;\s+END IF;)$p$,
  $n$\1
    -- Lo mismo con la categoría UNICA y los controles Salida/Meta que siembran
    -- los triggers de race_distances: si la original tiene los suyos, se quitan
    -- los sembrados antes de copiarlos (si no, chocaban con las claves únicas)
    IF EXISTS (SELECT 1 FROM public.race_categories WHERE race_distance_id = v_dist.id) THEN
      DELETE FROM public.race_categories WHERE race_distance_id = v_id;
    END IF;
    IF EXISTS (SELECT 1 FROM public.race_checkpoints WHERE race_distance_id = v_dist.id) THEN
      DELETE FROM public.race_checkpoints WHERE race_distance_id = v_id;
    END IF;$n$);

-- Guardia de horas (CLAUDE.md)
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;

COMMIT;
