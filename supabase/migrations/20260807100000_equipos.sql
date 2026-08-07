-- ============================================================
-- EQUIPOS — roster persistente reutilizable (7-ago-2026)
--
-- El equipo NO está atado a una carrera: es un roster que el capitán
-- mantiene (añade, quita, actualiza miembros). "Inscribir el equipo a
-- una carrera" y "salida de grupetta" (futuro) son USOS del mismo
-- roster. Esta migración crea la capa de PERSONAS; la inscripción en
-- lote y el pago van en la edge function team-register (service role).
--
-- Miembros en dos estados:
--   · vinculado (user_id): tiene cuenta Camberas, gestiona sus datos
--   · anónimo (user_id NULL): responde el capitán; comunicados por
--     email/SMS (sin push, sin app)
-- Auto-vinculación en dos direcciones, reutilizando la filosofía de
-- link_registrations_by_dni: al añadir un miembro se busca su cuenta
-- por DNI o email; al rellenar el DNI de un perfil se reclaman las
-- membresías anónimas que lo tuvieran.
--
-- NICK: lo visible en mapas/listas informales; único por equipo.
-- Se muestra nick si existe, si no el nombre de pila. El nombre
-- completo queda para listados oficiales.
--
-- Descuento por equipos: tramos por carrera (race_team_discount_tiers)
-- "N o más corredores → X% (o X€ por corredor)". El cálculo es del
-- SERVIDOR (team-register); combinable con cupón (el cupón se calcula
-- sobre la base ya reducida por el descuento de equipo).
--
-- OJO editor SQL de Lovable: delimitadores $fn$, sentencias cortas.
-- ============================================================

-- ── 1) Equipos ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teams (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (length(trim(name)) >= 3),
  captain_user_id uuid NOT NULL,
  -- Código de unión por QR (fase grupetta futura); NULL hasta entonces
  join_code       text UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teams_captain ON public.teams(captain_user_id);

DROP TRIGGER IF EXISTS trg_teams_updated_at ON public.teams;
CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 2) Miembros del roster ─────────────────────────────────────────────────
-- Datos ESTABLES de la persona; lo específico de cada carrera (talla,
-- autobús…) se pide al inscribir y vive en registrations/responses.
CREATE TABLE IF NOT EXISTS public.team_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  -- NULL = anónimo (lo gestiona el capitán); con valor = cuenta Camberas
  user_id      uuid,
  nick         text,
  first_name   text,
  last_name    text,
  email        text,
  phone        text,
  dni_passport text,
  birth_date   date,
  gender       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- Alguien identificable: nick o nombre de pila
  CONSTRAINT team_members_identificable
    CHECK (coalesce(trim(nick), '') <> '' OR coalesce(trim(first_name), '') <> '')
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);

-- Nick único dentro del equipo (case-insensitive); la UI sugiere
-- "Rober2" si colisiona
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_members_nick
  ON public.team_members (team_id, lower(nick))
  WHERE nick IS NOT NULL;

DROP TRIGGER IF EXISTS trg_team_members_updated_at ON public.team_members;
CREATE TRIGGER trg_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 3) Auto-vinculación miembro → cuenta ───────────────────────────────────
-- Al añadir/editar un miembro sin user_id se busca su perfil por DNI y,
-- si no, por email. Así el capitán no crea duplicados de gente que ya
-- tiene cuenta. Solo se rellena user_id; los datos tecleados quedan.
CREATE OR REPLACE FUNCTION public.team_member_autolink()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NEW.user_id IS NULL THEN
    IF coalesce(trim(NEW.dni_passport), '') <> '' THEN
      SELECT id INTO NEW.user_id FROM profiles
       WHERE dni_passport = trim(NEW.dni_passport)
       LIMIT 1;
    END IF;
    IF NEW.user_id IS NULL AND coalesce(trim(NEW.email), '') <> '' THEN
      SELECT id INTO NEW.user_id FROM profiles
       WHERE lower(email) = lower(trim(NEW.email))
       LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_team_members_autolink ON public.team_members;
CREATE TRIGGER trg_team_members_autolink
  BEFORE INSERT OR UPDATE OF email, dni_passport ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.team_member_autolink();

-- ── 4) Auto-vinculación cuenta → miembro (dirección inversa) ───────────────
-- Cuando un usuario crea su cuenta o rellena su DNI, reclama las
-- membresías anónimas con ese DNI (mismo patrón que
-- link_registrations_by_dni; trigger aparte, el existente no se toca).
CREATE OR REPLACE FUNCTION public.link_team_members_by_dni(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_dni    text;
  v_linked integer;
BEGIN
  SELECT dni_passport INTO v_dni FROM profiles WHERE id = p_user_id;
  IF v_dni IS NULL OR trim(v_dni) = '' THEN
    RETURN 0;
  END IF;

  UPDATE team_members
     SET user_id = p_user_id
   WHERE dni_passport = v_dni
     AND user_id IS NULL;

  GET DIAGNOSTICS v_linked = ROW_COUNT;
  RETURN v_linked;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.trg_link_team_members_on_dni_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NEW.dni_passport IS NOT NULL
     AND trim(NEW.dni_passport) <> ''
     AND (TG_OP = 'INSERT' OR NEW.dni_passport IS DISTINCT FROM OLD.dni_passport)
  THEN
    PERFORM public.link_team_members_by_dni(NEW.id);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_link_team_members_on_dni ON public.profiles;
CREATE TRIGGER trg_link_team_members_on_dni
  AFTER INSERT OR UPDATE OF dni_passport ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_link_team_members_on_dni_update();

-- ── 5) Enganche con las inscripciones ──────────────────────────────────────
-- El texto legado `team` se mantiene (visualización/exports); team_id y
-- team_member_id son el vínculo real. team_discount audita lo descontado
-- por equipo, separado de coupon_discount.
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_discount numeric;

CREATE INDEX IF NOT EXISTS idx_registrations_team ON public.registrations(team_id);

-- ── 6) Tramos de descuento por equipo ──────────────────────────────────────
-- "N o más corredores inscritos en el lote → descuento por corredor".
-- percent = % sobre la tarifa base; fixed = € por corredor.
-- Aplica el tramo más alto cuyo min_members se cumpla.
CREATE TABLE IF NOT EXISTS public.race_team_discount_tiers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id        uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  min_members    integer NOT NULL CHECK (min_members >= 2),
  discount_type  text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_tiers_percent_max
    CHECK (discount_type <> 'percent' OR discount_value <= 100),
  UNIQUE (race_id, min_members)
);

CREATE INDEX IF NOT EXISTS idx_team_discount_tiers_race
  ON public.race_team_discount_tiers(race_id);

-- ── 7) Helper anti-recursión para RLS ──────────────────────────────────────
-- Una policy de team_members que consulte team_members entra en
-- recursión infinita de RLS; este SECURITY DEFINER la corta.
CREATE OR REPLACE FUNCTION public.es_miembro_del_equipo(p_team_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM team_members
     WHERE team_id = p_team_id AND user_id = p_user
  )
$fn$;

REVOKE EXECUTE ON FUNCTION public.es_miembro_del_equipo(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.es_miembro_del_equipo(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.es_miembro_del_equipo(uuid, uuid) TO authenticated;

-- ── 8) RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.teams                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_team_discount_tiers ENABLE ROW LEVEL SECURITY;

-- Equipos: el capitán manda; admin supervisa
DROP POLICY IF EXISTS "Equipos: capitán o admin" ON public.teams;
CREATE POLICY "Equipos: capitán o admin"
  ON public.teams FOR ALL
  USING (
    captain_user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    captain_user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Los miembros vinculados VEN su equipo
DROP POLICY IF EXISTS "Equipos: los miembros ven su equipo" ON public.teams;
CREATE POLICY "Equipos: los miembros ven su equipo"
  ON public.teams FOR SELECT
  USING (public.es_miembro_del_equipo(id, auth.uid()));

-- Roster: el capitán hace CRUD completo de SU equipo
DROP POLICY IF EXISTS "Roster: capitán del equipo o admin" ON public.team_members;
CREATE POLICY "Roster: capitán del equipo o admin"
  ON public.team_members FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM teams t
       WHERE t.id = team_members.team_id AND t.captain_user_id = auth.uid()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM teams t
       WHERE t.id = team_members.team_id AND t.captain_user_id = auth.uid()
    )
  );

-- Los miembros vinculados ven a sus compañeros de equipo
DROP POLICY IF EXISTS "Roster: los miembros se ven entre sí" ON public.team_members;
CREATE POLICY "Roster: los miembros se ven entre sí"
  ON public.team_members FOR SELECT
  USING (public.es_miembro_del_equipo(team_id, auth.uid()));

-- Un miembro vinculado edita SU propia ficha (el GRANT por columnas de
-- abajo impide que nadie cambie team_id por UPDATE directo)
DROP POLICY IF EXISTS "Roster: cada miembro edita su ficha" ON public.team_members;
CREATE POLICY "Roster: cada miembro edita su ficha"
  ON public.team_members FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Tramos de descuento: lectura pública (la ficha de la carrera los
-- muestra); escribe el organizador de la carrera o admin
DROP POLICY IF EXISTS "Tramos equipo: lectura pública" ON public.race_team_discount_tiers;
CREATE POLICY "Tramos equipo: lectura pública"
  ON public.race_team_discount_tiers FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Tramos equipo: escribe el organizador o admin" ON public.race_team_discount_tiers;
CREATE POLICY "Tramos equipo: escribe el organizador o admin"
  ON public.race_team_discount_tiers FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM races r
       WHERE r.id = race_team_discount_tiers.race_id AND r.organizer_id = auth.uid()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM races r
       WHERE r.id = race_team_discount_tiers.race_id AND r.organizer_id = auth.uid()
    )
  );

-- ── 9) GRANTs ──────────────────────────────────────────────────────────────
-- Lección de julio: todo REVOKE de PUBLIC necesita GRANT explícito a los
-- roles que deben conservar acceso (authenticated hereda de PUBLIC).
REVOKE ALL ON public.teams                    FROM PUBLIC, anon;
REVOKE ALL ON public.team_members             FROM PUBLIC, anon;
REVOKE ALL ON public.race_team_discount_tiers FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;

-- team_members: UPDATE solo de columnas de datos personales — sin
-- team_id, así nadie mueve una fila a otro equipo por UPDATE directo
-- (mover = borrar y re-añadir, cosa del capitán vía DELETE+INSERT)
GRANT SELECT, INSERT, DELETE ON public.team_members TO authenticated;
GRANT UPDATE (user_id, nick, first_name, last_name, email, phone,
              dni_passport, birth_date, gender)
  ON public.team_members TO authenticated;

GRANT SELECT ON public.race_team_discount_tiers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.race_team_discount_tiers TO authenticated;
