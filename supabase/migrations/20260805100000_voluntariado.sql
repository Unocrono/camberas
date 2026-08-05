-- ============================================================
-- VOLUNTARIADO (diseño 4-ago-2026, ver docs/voluntarios-diseno.md)
--
-- El voluntario NO es un usuario: es una fila. Igual que el cronometrador
-- dejó de necesitar cuenta, aquí no hay altas de usuario, ni contraseñas,
-- ni invitaciones. El organizador da de alta y asigna; el voluntario recibe
-- un papel o un WhatsApp con dónde, cuándo y a quién llamar.
--
-- Tres tablas:
--   volunteers            → la bolsa DEL ORGANIZADOR, reutilizable entre
--                           carreras y ediciones (los mismos vecinos repiten).
--   race_posts            → catálogo de puestos de la carrera. Tabla propia y
--                           no timing_points: solo 2-3 puestos son de crono.
--                           Se generan desde el rutómetro (roadbook_items ya
--                           tiene los cruces y avituallamientos con km y
--                           coordenadas).
--   volunteer_assignments → quién va a qué puesto. Sin horas de turno: el
--                           voluntario cubre todo el evento.
--
-- ⚠️ DATO SENSIBLE: el DNI existe para ASEGURAR AL VOLUNTARIO EN CASO DE
-- ACCIDENTE — sin DNI la persona no está cubierta por la póliza. Nada de
-- esto se abre a `anon`, y el DNI no se imprime en las hojas de puesto (solo
-- va en el listado que se manda a la aseguradora). No se borra al acabar la
-- carrera: un parte puede abrirse después.
-- ============================================================

-- ── 1) La bolsa del organizador ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.volunteers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name        text NOT NULL,
  phone            text NOT NULL,          -- canal del día de carrera y clave de deduplicación
  dni              text,                   -- para el seguro de accidentes
  driving_license  text,                   -- clases: 'B', 'A2', 'B, A2'… vacío = no conduce
  email            text,
  notes            text,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_volunteers_organizer ON public.volunteers(organizer_id, active);

-- Normalización: el teléfono y el DNI son claves de deduplicación, y llegan
-- tecleados a mano o pegados de un Excel. Se normalizan en la BD para que el
-- índice único funcione venga el dato por donde venga.
CREATE OR REPLACE FUNCTION public.voluntariado_normalizar()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $fn$
BEGIN
  NEW.full_name := btrim(NEW.full_name);
  NEW.phone     := regexp_replace(coalesce(NEW.phone, ''), '[^0-9+]', '', 'g');
  NEW.dni       := nullif(upper(regexp_replace(coalesce(NEW.dni, ''), '[^0-9A-Za-z]', '', 'g')), '');
  NEW.email     := nullif(btrim(lower(coalesce(NEW.email, ''))), '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_volunteers_normalizar ON public.volunteers;
CREATE TRIGGER trg_volunteers_normalizar
  BEFORE INSERT OR UPDATE ON public.volunteers
  FOR EACH ROW EXECUTE FUNCTION public.voluntariado_normalizar();

CREATE UNIQUE INDEX IF NOT EXISTS uniq_volunteers_org_phone
  ON public.volunteers (organizer_id, phone);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_volunteers_org_dni
  ON public.volunteers (organizer_id, dni) WHERE dni IS NOT NULL;

-- ── 2) Catálogo de puestos de la carrera ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.race_posts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id           uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  name              text NOT NULL,
  kind              text NOT NULL DEFAULT 'cruce',
  needed            integer NOT NULL DEFAULT 1,
  latitude          numeric,
  longitude         numeric,
  location_hint     text,                  -- "junto al panel de madera, lado río"
  notes             text,                  -- "llevar cinta y chaleco"
  post_order        integer,
  roadbook_item_id  uuid REFERENCES public.roadbook_items(id) ON DELETE SET NULL,
  timing_point_id   uuid REFERENCES public.timing_points(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT race_posts_kind_check CHECK (kind IN (
    'cruce', 'avituallamiento', 'salida', 'meta', 'guardarropa',
    'parking', 'escoba', 'movil', 'otro'
  )),
  CONSTRAINT race_posts_needed_check CHECK (needed >= 1)
);

CREATE INDEX IF NOT EXISTS idx_race_posts_race ON public.race_posts(race_id, post_order);
-- Un puesto por elemento del rutómetro: el botón "generar desde rutómetro"
-- se puede pulsar dos veces sin duplicar nada.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_race_posts_roadbook_item
  ON public.race_posts (race_id, roadbook_item_id) WHERE roadbook_item_id IS NOT NULL;

-- ── 3) Asignación: quién va a qué puesto ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.volunteer_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id       uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  post_id       uuid NOT NULL REFERENCES public.race_posts(id) ON DELETE CASCADE,
  volunteer_id  uuid NOT NULL REFERENCES public.volunteers(id) ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'apoyo',
  status        text NOT NULL DEFAULT 'propuesto',
  notes         text,                      -- "va con el coche", "llega a las 8"
  assigned_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT volunteer_assignments_role_check   CHECK (role IN ('responsable', 'apoyo')),
  CONSTRAINT volunteer_assignments_status_check CHECK (status IN ('propuesto', 'confirmado', 'no_disponible')),
  UNIQUE (post_id, volunteer_id)
);

CREATE INDEX IF NOT EXISTS idx_volunteer_assignments_race      ON public.volunteer_assignments(race_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_assignments_volunteer ON public.volunteer_assignments(volunteer_id);

-- ── 4) RLS: admin o el organizador de la carrera. Nada a `anon` ────────────
ALTER TABLE public.volunteers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_posts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volunteer_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Voluntariado: su dueño o admin" ON public.volunteers;
CREATE POLICY "Voluntariado: su dueño o admin"
  ON public.volunteers FOR ALL
  USING (organizer_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (organizer_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Puestos: organizador de la carrera o admin" ON public.race_posts;
CREATE POLICY "Puestos: organizador de la carrera o admin"
  ON public.race_posts FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM races r WHERE r.id = race_posts.race_id AND r.organizer_id = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM races r WHERE r.id = race_posts.race_id AND r.organizer_id = auth.uid())
  );

DROP POLICY IF EXISTS "Asignaciones: organizador de la carrera o admin" ON public.volunteer_assignments;
CREATE POLICY "Asignaciones: organizador de la carrera o admin"
  ON public.volunteer_assignments FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM races r WHERE r.id = volunteer_assignments.race_id AND r.organizer_id = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM races r WHERE r.id = volunteer_assignments.race_id AND r.organizer_id = auth.uid())
  );

-- Lección de julio: todo REVOKE de PUBLIC necesita GRANT explícito a los
-- roles que deben conservar acceso (authenticated hereda de PUBLIC).
REVOKE ALL ON public.volunteers            FROM PUBLIC, anon;
REVOKE ALL ON public.race_posts            FROM PUBLIC, anon;
REVOKE ALL ON public.volunteer_assignments FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.volunteers            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.race_posts            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.volunteer_assignments TO authenticated;

-- ── 5) Cobertura: las dos cuentas que importan la víspera ──────────────────
--     puestos sin gente  y  gente sin DNI (sin DNI no hay seguro).
CREATE OR REPLACE FUNCTION public.voluntariado_cobertura(p_race_id uuid)
RETURNS TABLE(
  post_id       uuid,
  name          text,
  kind          text,
  needed        integer,
  asignados     integer,
  confirmados   integer,
  sin_dni       integer,
  post_order    integer,
  latitude      numeric,
  longitude     numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT p.id, p.name, p.kind, p.needed,
         count(a.id)::int,
         count(a.id) FILTER (WHERE a.status = 'confirmado')::int,
         count(a.id) FILTER (WHERE v.dni IS NULL)::int,
         p.post_order, p.latitude, p.longitude
  FROM race_posts p
  LEFT JOIN volunteer_assignments a ON a.post_id = p.id AND a.status <> 'no_disponible'
  LEFT JOIN volunteers v            ON v.id = a.volunteer_id
  WHERE p.race_id = p_race_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (SELECT 1 FROM races r WHERE r.id = p_race_id AND r.organizer_id = auth.uid())
    )
  GROUP BY p.id
  ORDER BY p.post_order NULLS LAST, p.name
$fn$;

REVOKE EXECUTE ON FUNCTION public.voluntariado_cobertura(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.voluntariado_cobertura(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.voluntariado_cobertura(uuid) TO authenticated;

-- ── 6) Entrada en el menú (panel y PWA del organizador leen la misma tabla) ─
INSERT INTO public.menu_items (menu_type, title, icon, view_name, group_label, display_order, is_visible, requires_auth)
SELECT * FROM (VALUES
  ('organizer', 'Voluntariado', 'HeartHandshake', 'voluntariado', '🦺 Organización', 15, true, true),
  ('admin',     'Voluntariado', 'HeartHandshake', 'voluntariado', '🦺 Organización', 15, true, true)
) AS m(menu_type, title, icon, view_name, group_label, display_order, is_visible, requires_auth)
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items mi
   WHERE mi.view_name = 'voluntariado' AND mi.menu_type = m.menu_type
);
