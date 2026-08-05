-- ============================================================
-- VOLUNTARIADO · PUESTOS, TIPOS Y ACREDITACIÓN (5-ago-2026)
--
-- Segunda tanda del módulo (ver docs/voluntarios-diseno.md):
--
-- 1. Los tipos de puesto dejan de ser una restricción CHECK y pasan a ser
--    tabla con CRUD: cada organización nombra sus puestos como los nombra
--    de verdad. Se siembran los que veníamos usando más los tres que
--    faltaban (señalización, sanitario, recogida de material).
-- 2. El puesto gana ABREVIATURA de 3 caracteres en mayúsculas: es lo que
--    se lee de lejos en la acreditación y la raíz del número de cada una.
-- 3. El voluntario gana vehículo y matrícula, junto al carnet: quien lleva
--    la escoba o un control móvil necesita las tres cosas.
-- 4. La ACREDITACIÓN se genera sola al asignar: abreviatura del puesto +
--    número correlativo dentro de ese puesto (CRU01, CRU02…). La calcula
--    un trigger, no la pantalla: así sale igual desde el alta rápida, la
--    ficha o una importación.
-- ============================================================

-- ── 1) Catálogo de tipos de puesto ─────────────────────────────────────────
--     Mismo patrón que roadbook_item_types: lo mantiene el admin y lo lee
--     todo el mundo con sesión. `color` queda listo para imprimir cada
--     acreditación del color de su puesto.
CREATE TABLE IF NOT EXISTS public.race_post_types (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL UNIQUE,          -- slug interno
  label          text NOT NULL,                 -- lo que se ve
  icon           text NOT NULL DEFAULT 'MapPin',
  color          text NOT NULL DEFAULT '#64748B',
  description    text,
  display_order  integer NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.race_post_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tipos de puesto: los ve cualquiera con sesión" ON public.race_post_types;
CREATE POLICY "Tipos de puesto: los ve cualquiera con sesión"
  ON public.race_post_types FOR SELECT
  USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Tipos de puesto: los mantiene el admin" ON public.race_post_types;
CREATE POLICY "Tipos de puesto: los mantiene el admin"
  ON public.race_post_types FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.race_post_types FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.race_post_types TO authenticated;

INSERT INTO public.race_post_types (name, label, icon, color, description, display_order) VALUES
  ('cruce',            'Cruce',              'TrafficCone',   '#EF4444', 'Paso de tráfico o cruce de caminos', 10),
  ('senalizacion',     'Señalización',       'Signpost',      '#F97316', 'Marcaje del recorrido y repaso de cintas', 20),
  ('avituallamiento',  'Avituallamiento',    'Droplet',       '#0EA5E9', 'Agua y comida', 30),
  ('salida',           'Salida',             'Flag',          '#22C55E', 'Zona de salida', 40),
  ('meta',             'Meta',               'Trophy',        '#EAB308', 'Zona de llegada', 50),
  ('guardarropa',      'Guardarropa',        'Backpack',      '#8B5CF6', 'Recogida y entrega de bolsas', 60),
  ('parking',          'Parking',            'ParkingCircle', '#64748B', 'Aparcamiento y accesos', 70),
  ('sanitario',        'Sanitario',          'HeartPulse',    '#DC2626', 'Ambulancia, DEA o personal sanitario', 80),
  ('escoba',           'Escoba',             'Bike',          '#78716C', 'Cierre de carrera', 90),
  ('movil',            'Control móvil',      'Car',           '#0891B2', 'Se desplaza por el recorrido', 100),
  ('recogida',         'Recogida de material','PackageOpen',  '#A16207', 'Desmontaje al terminar', 110),
  ('otro',             'Otro',               'MapPin',        '#94A3B8', NULL, 120)
ON CONFLICT (name) DO NOTHING;

-- ── 2) El puesto: tipo por referencia y abreviatura ────────────────────────
ALTER TABLE public.race_posts DROP CONSTRAINT IF EXISTS race_posts_kind_check;
ALTER TABLE public.race_posts ADD COLUMN IF NOT EXISTS post_type_id uuid REFERENCES public.race_post_types(id);
ALTER TABLE public.race_posts ADD COLUMN IF NOT EXISTS abbr text;

-- Los que hubiera creados con el `kind` de texto se reenganchan por nombre
UPDATE public.race_posts p
   SET post_type_id = t.id
  FROM public.race_post_types t
 WHERE p.post_type_id IS NULL
   AND t.name = p.kind;

ALTER TABLE public.race_posts DROP COLUMN IF EXISTS kind;

-- Abreviatura: 3 caracteres, mayúsculas, única dentro de la carrera —
-- es la raíz de la acreditación, así que no puede repetirse.
ALTER TABLE public.race_posts DROP CONSTRAINT IF EXISTS race_posts_abbr_check;
ALTER TABLE public.race_posts ADD CONSTRAINT race_posts_abbr_check
  CHECK (abbr IS NULL OR abbr ~ '^[A-Z0-9]{3}$');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_race_posts_abbr
  ON public.race_posts (race_id, abbr) WHERE abbr IS NOT NULL;

CREATE OR REPLACE FUNCTION public.race_posts_normalizar()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $fn$
BEGIN
  NEW.name := btrim(NEW.name);
  -- La abreviatura se guarda siempre en mayúsculas y sin adornos
  NEW.abbr := nullif(upper(regexp_replace(coalesce(NEW.abbr, ''), '[^0-9A-Za-z]', '', 'g')), '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_race_posts_normalizar ON public.race_posts;
CREATE TRIGGER trg_race_posts_normalizar
  BEFORE INSERT OR UPDATE ON public.race_posts
  FOR EACH ROW EXECUTE FUNCTION public.race_posts_normalizar();

-- ── 3) El voluntario: vehículo y matrícula ─────────────────────────────────
ALTER TABLE public.volunteers ADD COLUMN IF NOT EXISTS vehicle text;  -- "Berlingo blanco"
ALTER TABLE public.volunteers ADD COLUMN IF NOT EXISTS plate   text;  -- matrícula

-- La matrícula se normaliza como el DNI: es dato de control de accesos
CREATE OR REPLACE FUNCTION public.voluntariado_normalizar()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $fn$
BEGIN
  NEW.full_name := btrim(NEW.full_name);
  NEW.phone     := regexp_replace(coalesce(NEW.phone, ''), '[^0-9+]', '', 'g');
  NEW.dni       := nullif(upper(regexp_replace(coalesce(NEW.dni, ''), '[^0-9A-Za-z]', '', 'g')), '');
  NEW.plate     := nullif(upper(regexp_replace(coalesce(NEW.plate, ''), '[^0-9A-Za-z]', '', 'g')), '');
  NEW.email     := nullif(btrim(lower(coalesce(NEW.email, ''))), '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

-- ── 4) La acreditación: abreviatura del puesto + correlativo ───────────────
--     La calcula la BD, no la pantalla: el número tiene que salir bien
--     venga la asignación del alta rápida, de la ficha o de un importador.
ALTER TABLE public.volunteer_assignments ADD COLUMN IF NOT EXISTS accreditation text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_volunteer_assignments_acreditacion
  ON public.volunteer_assignments (race_id, accreditation) WHERE accreditation IS NOT NULL;

CREATE OR REPLACE FUNCTION public.voluntariado_acreditacion()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $fn$
DECLARE
  v_abbr text;
  v_seq  int;
BEGIN
  -- Al cambiar de puesto, la acreditación vieja ya no vale
  IF TG_OP = 'UPDATE' AND NEW.post_id IS DISTINCT FROM OLD.post_id THEN
    NEW.accreditation := NULL;
  END IF;

  IF coalesce(NEW.accreditation, '') <> '' THEN
    RETURN NEW;
  END IF;

  SELECT p.abbr INTO v_abbr FROM race_posts p WHERE p.id = NEW.post_id;
  IF v_abbr IS NULL THEN
    RETURN NEW;   -- puesto sin abreviatura: se acredita cuando la tenga
  END IF;

  SELECT coalesce(max((regexp_replace(a.accreditation, '^[A-Z0-9]{3}', ''))::int), 0) + 1
    INTO v_seq
    FROM volunteer_assignments a
   WHERE a.post_id = NEW.post_id
     AND a.accreditation ~ ('^' || v_abbr || '[0-9]+$')
     AND (TG_OP = 'INSERT' OR a.id <> NEW.id);

  NEW.accreditation := v_abbr || lpad(v_seq::text, 2, '0');
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_volunteer_assignments_acreditacion ON public.volunteer_assignments;
CREATE TRIGGER trg_volunteer_assignments_acreditacion
  BEFORE INSERT OR UPDATE ON public.volunteer_assignments
  FOR EACH ROW EXECUTE FUNCTION public.voluntariado_acreditacion();

-- Renumerar un puesto entero (si se cambia la abreviatura o se quiere
-- compactar tras varias bajas). Devuelve cuántas acreditaciones ha tocado.
CREATE OR REPLACE FUNCTION public.voluntariado_renumerar_puesto(p_post_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_race uuid;
  v_n    int := 0;
BEGIN
  SELECT race_id INTO v_race FROM race_posts WHERE id = p_post_id;
  IF v_race IS NULL THEN
    RAISE EXCEPTION 'Puesto no encontrado';
  END IF;

  IF NOT (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM races r WHERE r.id = v_race AND r.organizer_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sin permiso sobre esta carrera';
  END IF;

  -- Se apartan a un valor provisional (único por fila) para no chocar con el
  -- índice único al reasignar. Vaciarlas no sirve: el trigger las regeneraría.
  UPDATE volunteer_assignments
     SET accreditation = 'tmp-' || id::text
   WHERE post_id = p_post_id;

  WITH orden AS (
    SELECT a.id, row_number() OVER (ORDER BY a.assigned_at, a.id) AS n
      FROM volunteer_assignments a
     WHERE a.post_id = p_post_id
  )
  UPDATE volunteer_assignments a
     SET accreditation = p.abbr || lpad(orden.n::text, 2, '0')
    FROM orden, race_posts p
   WHERE a.id = orden.id AND p.id = p_post_id AND p.abbr IS NOT NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.voluntariado_renumerar_puesto(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.voluntariado_renumerar_puesto(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.voluntariado_renumerar_puesto(uuid) TO authenticated;

-- ── 5) La cobertura, con el tipo por referencia ────────────────────────────
DROP FUNCTION IF EXISTS public.voluntariado_cobertura(uuid);
CREATE OR REPLACE FUNCTION public.voluntariado_cobertura(p_race_id uuid)
RETURNS TABLE(
  post_id       uuid,
  name          text,
  abbr          text,
  tipo          text,
  color         text,
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
  SELECT p.id, p.name, p.abbr,
         coalesce(t.label, '—'), coalesce(t.color, '#94A3B8'),
         p.needed,
         count(a.id)::int,
         count(a.id) FILTER (WHERE a.status = 'confirmado')::int,
         count(a.id) FILTER (WHERE v.dni IS NULL)::int,
         p.post_order, p.latitude, p.longitude
  FROM race_posts p
  LEFT JOIN race_post_types t        ON t.id = p.post_type_id
  LEFT JOIN volunteer_assignments a  ON a.post_id = p.id AND a.status <> 'no_disponible'
  LEFT JOIN volunteers v             ON v.id = a.volunteer_id
  WHERE p.race_id = p_race_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (SELECT 1 FROM races r WHERE r.id = p_race_id AND r.organizer_id = auth.uid())
    )
  GROUP BY p.id, t.label, t.color
  ORDER BY p.post_order NULLS LAST, p.name
$fn$;

REVOKE EXECUTE ON FUNCTION public.voluntariado_cobertura(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.voluntariado_cobertura(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.voluntariado_cobertura(uuid) TO authenticated;

-- ── 6) Menú: Puestos (organizador y admin) y Tipos de Puesto (admin) ───────
INSERT INTO public.menu_items (menu_type, title, icon, view_name, group_label, display_order, is_visible, requires_auth)
SELECT * FROM (VALUES
  ('organizer', 'Puestos',          'MapPin',   'puestos',      '🦺 Organización', 16, true, true),
  ('admin',     'Puestos',          'MapPin',   'puestos',      '🦺 Organización', 16, true, true),
  ('admin',     'Tipos de Puesto',  'Layers',   'tipos-puesto', '🦺 Organización', 17, true, true)
) AS m(menu_type, title, icon, view_name, group_label, display_order, is_visible, requires_auth)
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items mi
   WHERE mi.view_name = m.view_name AND mi.menu_type = m.menu_type
);
