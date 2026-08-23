-- ============================================================
-- LOS DORSALES DEMO DE LAS TIENDAS NO SE PUEDEN APAGAR (22-ago)
--
-- Se han desactivado DOS veces en dos días. La primera costó el rechazo
-- de Google Play ("Login credentials are incorrect": su revisor escaneó
-- el QR y la app respondió "Token no válido o inactivo"). Da igual quién
-- los apague — un clic en la etiqueta de Estado del panel, una limpieza,
-- lo que sea: mientras haya una app en revisión, ESE dorsal tiene que
-- responder siempre.
--
-- Un disparador revierte cualquier intento de desactivarlos o borrarlos.
-- Para retirarlos de verdad hay que quitar el disparador a conciencia.
-- ============================================================

-- 1) Revivirlos ahora
UPDATE gps_tokens
   SET active = true, device_id = NULL, linked_at = NULL
 WHERE token IN ('a99e11e0-de30-4a99-9e11-c0debeefcafe',   -- Apple
                 '468c795b-bf7e-4004-b4cb-556488655295');  -- Google

-- 2) Y que no se puedan volver a apagar
CREATE OR REPLACE FUNCTION public.proteger_dorsales_demo()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'El dorsal demo % está protegido: lo usan los revisores de las tiendas', OLD.bib_number;
  END IF;
  IF NEW.active IS DISTINCT FROM true THEN
    NEW.active := true;   -- se ignora el intento de revocar
  END IF;
  IF NEW.token IS DISTINCT FROM OLD.token THEN
    NEW.token := OLD.token;   -- el UUID va impreso en el QR ya entregado
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_proteger_dorsales_demo ON gps_tokens;
CREATE TRIGGER trg_proteger_dorsales_demo
  BEFORE UPDATE OR DELETE ON gps_tokens
  FOR EACH ROW
  WHEN (OLD.token IN ('a99e11e0-de30-4a99-9e11-c0debeefcafe',
                      '468c795b-bf7e-4004-b4cb-556488655295'))
  EXECUTE FUNCTION public.proteger_dorsales_demo();

-- 3) Comprobación: los dos activos
SELECT token, bib_number, participant_name, active
  FROM gps_tokens
 WHERE token IN ('a99e11e0-de30-4a99-9e11-c0debeefcafe',
                 '468c795b-bf7e-4004-b4cb-556488655295');
