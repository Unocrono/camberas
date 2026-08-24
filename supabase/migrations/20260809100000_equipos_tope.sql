-- ============================================================
-- EQUIPOS: tope de equipos por capitán (9-ago-2026)
--
-- Cualquier usuario registrado puede crear un equipo — no hay
-- aprobación, y así debe seguir: un equipo no publica nada, no manda
-- correos y no ocupa plazas. Pero sin tope una cuenta puede crear
-- miles, así que se pone el mismo freno que ya tiene el Capo con las
-- grupettas (3 vivas por 48 h).
--
-- 5 equipos: da para el club, sus subequipos y alguna prueba; nadie
-- legítimo lo roza. Los admin quedan exentos (crean en nombre de otros
-- desde el panel).
-- ============================================================

CREATE OR REPLACE FUNCTION public.equipos_tope_por_capitan()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_tope int := 5;
  v_actuales int;
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_actuales
    FROM teams
   WHERE captain_user_id = NEW.captain_user_id;

  IF v_actuales >= v_tope THEN
    RAISE EXCEPTION 'Máximo % equipos por capitán. Borra alguno que ya no uses o escríbenos a info@camberas.com', v_tope;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_equipos_tope ON public.teams;
CREATE TRIGGER trg_equipos_tope
  BEFORE INSERT ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.equipos_tope_por_capitan();

-- ── Vista "Equipos" en el panel de admin ───────────────────────────────────
-- Solo admin: es información de plataforma (cuántos clubes hay y de qué
-- tamaño), no de una carrera concreta. El organizador ya ve los equipos de
-- SU carrera en la columna Equipo de Inscripciones.
INSERT INTO public.menu_items (menu_type, title, icon, view_name, group_label, display_order, is_visible, requires_auth)
SELECT * FROM (VALUES
  ('admin', 'Equipos', 'Users', 'teams', '📝 Inscripciones', 23, true, true)
) AS m(menu_type, title, icon, view_name, group_label, display_order, is_visible, requires_auth)
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items mi
   WHERE mi.view_name = 'teams' AND mi.menu_type = 'admin'
);
