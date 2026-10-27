-- ============================================================
-- WEB PROPIA: TPV, DOMINIO Y PUBLICAR, SOLO EL ADMIN (27-oct-2026)
--
-- Petición del dueño: en el panel, Web propia › TPV, Dominio y Publicar son
-- solo para el administrador; el organizador no puede acceder. La web
-- oculta las tres pestañas (WebPropiaManagement); esto lo hace cumplir
-- también en la base, para que no se pueda saltar desde la consola:
--
-- 1. race_tpv y race_domains: la política pasa de puede_gestionar_carrera
--    (organizador o admin) a solo admin. Quien los lee para cobrar o servir
--    la web (evento_publico, carrera_por_dominio, tpv_de_carrera, redsys,
--    verificar-dominio) lo hace con SECURITY DEFINER o service role: no
--    cambia nada para el público ni para los cobros.
-- 2. tpv_guardar (guarda la clave del comercio en el vault): solo admin.
-- 3. race_web.activa (publicar/despublicar): el organizador sigue
--    guardando diseño y contenido, pero no puede cambiar «activa».
--    OJO: useRaceWeb guarda con upsert de la fila ENTERA (activa incluida),
--    y en un INSERT … ON CONFLICT el disparador BEFORE INSERT ve la fila
--    propuesta aunque luego acabe en UPDATE. Por eso en INSERT solo se
--    rechaza activa=true si la web no estaba ya publicada; el cambio real
--    lo vigila la rama UPDATE.
--    Sin sesión (service role, SQL directo) no se comprueba nada;
--    duplicar_carrera crea la copia con activa=false, así que pasa.
--
-- APLICADA en producción el 27-oct-2026 tras ensayo con ROLLBACK como el
-- organizador de la Gurriana 2027 (web publicada) y como admin: el
-- organizador guarda diseño sin problema; despublicar, crear dominio, crear
-- TPV directo y tpv_guardar quedan bloqueados; el admin publica,
-- despublica y crea dominio. 5 webs publicadas intactas; guardia 0 FALLO.
-- ============================================================

SET client_encoding = 'UTF8';

BEGIN;
SET LOCAL lock_timeout = '2s';

-- 1. Tablas de TPV y dominio: solo admin --------------------------------
DROP POLICY IF EXISTS "race_tpv: organizador o admin" ON public.race_tpv;
DROP POLICY IF EXISTS "race_tpv: solo admin" ON public.race_tpv;
CREATE POLICY "race_tpv: solo admin" ON public.race_tpv
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "race_domains: organizador o admin" ON public.race_domains;
DROP POLICY IF EXISTS "race_domains: solo admin" ON public.race_domains;
CREATE POLICY "race_domains: solo admin" ON public.race_domains
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Guardar el TPV: solo admin -----------------------------------------
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.tpv_guardar'::regproc);
  v_viejo text := 'IF NOT public.puede_gestionar_carrera(p_race_id) THEN';
  v_nuevo text := 'IF NOT public.has_role(auth.uid(), ''admin''::app_role) THEN';
BEGIN
  IF (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 THEN
    RAISE EXCEPTION 'tpv_guardar: el patrón de permiso no aparece exactamente una vez';
  END IF;
  EXECUTE replace(v_def, v_viejo, v_nuevo);
END $$;

-- 3. Publicar la web: solo admin ----------------------------------------
CREATE OR REPLACE FUNCTION public.race_web_publicar_solo_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.activa IS TRUE AND NOT EXISTS (
      SELECT 1 FROM race_web w WHERE w.race_id = NEW.race_id AND w.activa IS TRUE
    ) THEN
      RAISE EXCEPTION 'Solo el administrador de Camberas puede publicar la web' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.activa IS DISTINCT FROM OLD.activa THEN
    RAISE EXCEPTION 'Solo el administrador de Camberas puede publicar o despublicar la web' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS race_web_publicar_solo_admin ON public.race_web;
CREATE TRIGGER race_web_publicar_solo_admin
  BEFORE INSERT OR UPDATE ON public.race_web
  FOR EACH ROW EXECUTE FUNCTION public.race_web_publicar_solo_admin();

-- Guardia de horas (CLAUDE.md): ningún FALLO
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel = 'FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;

COMMIT;
