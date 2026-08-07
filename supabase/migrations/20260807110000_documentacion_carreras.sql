-- ============================================================
-- GESTIÓN DOCUMENTAL DE CARRERAS (7-ago-2026)
--
-- race_document_requirements → checklist de documentos exigidos por carrera
--   (permisos, ETRAZA, seguros…). days_before_race calcula la fecha límite
--   contra races.date, así el checklist sobrevive a cambios de fecha.
-- race_documents → los archivos/trámites reales. Varios por requisito
--   (un permiso por cada ayuntamiento que cruza el recorrido). El archivo
--   vive en el bucket PRIVADO race-documents ({race_id}/…): nunca URL
--   pública, solo signed URLs — puede haber datos sensibles.
-- La lógica de acceso vive en puede_gestionar_carrera() SECURITY DEFINER
-- para que las revisiones de seguridad de Lovable no la desmonten al
-- reescribir políticas: las políticas quedan en una línea que delega aquí.
-- ============================================================

-- ── 1) Helper de acceso ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.puede_gestionar_carrera(p_race_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (SELECT 1 FROM races r
                  WHERE r.id = p_race_id AND r.organizer_id = auth.uid())
$fn$;

REVOKE EXECUTE ON FUNCTION public.puede_gestionar_carrera(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.puede_gestionar_carrera(uuid) TO authenticated;

-- ── 2) Checklist de requisitos ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.race_document_requirements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id          uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  category         text NOT NULL CHECK (category IN (
                     'permiso_municipal','juegos_espectaculos','etraza_dgt',
                     'seguro_rc','seguro_accidentes','plan_seguridad',
                     'medioambiental','federacion','proteccion_datos','otros')),
  title            text NOT NULL,
  description      text,
  days_before_race integer NOT NULL DEFAULT 30 CHECK (days_before_race >= 0),
  is_required      boolean NOT NULL DEFAULT true,
  display_order    integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (race_id, category, title)
);

CREATE INDEX IF NOT EXISTS idx_doc_requirements_race
  ON public.race_document_requirements(race_id);

-- ── 3) Documentos ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.race_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id        uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  requirement_id uuid REFERENCES public.race_document_requirements(id) ON DELETE SET NULL,
  category       text NOT NULL DEFAULT 'otros',
  title          text NOT NULL,
  -- file_* nullables: un trámite puede registrarse antes de tener el papel
  file_path      text,
  file_name      text,
  mime_type      text,
  size_bytes     bigint,
  status         text NOT NULL DEFAULT 'pendiente' CHECK (status IN
                   ('pendiente','subido','en_revision','aprobado','rechazado','caducado')),
  issue_date     date,
  expiry_date    date,
  notes          text,
  uploaded_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_race_documents_race
  ON public.race_documents(race_id, status);

CREATE OR REPLACE FUNCTION public.race_documents_touch()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_race_documents_touch ON public.race_documents;
CREATE TRIGGER trg_race_documents_touch
  BEFORE UPDATE ON public.race_documents
  FOR EACH ROW EXECUTE FUNCTION public.race_documents_touch();

-- ── 4) RLS de tablas ───────────────────────────────────────────────────────
ALTER TABLE public.race_document_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_documents             ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Requisitos doc: organizador o admin" ON public.race_document_requirements;
CREATE POLICY "Requisitos doc: organizador o admin"
  ON public.race_document_requirements FOR ALL
  USING (public.puede_gestionar_carrera(race_id))
  WITH CHECK (public.puede_gestionar_carrera(race_id));

DROP POLICY IF EXISTS "Documentos: organizador o admin" ON public.race_documents;
CREATE POLICY "Documentos: organizador o admin"
  ON public.race_documents FOR ALL
  USING (public.puede_gestionar_carrera(race_id))
  WITH CHECK (public.puede_gestionar_carrera(race_id));

-- Lección de julio: todo REVOKE de PUBLIC necesita GRANT explícito a los
-- roles que deben conservar acceso (authenticated hereda de PUBLIC).
REVOKE ALL ON public.race_document_requirements FROM PUBLIC, anon;
REVOKE ALL ON public.race_documents             FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.race_document_requirements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.race_documents             TO authenticated;

-- ── 5) Bucket PRIVADO ──────────────────────────────────────────────────────
-- Primer bucket privado del proyecto: aquí van pólizas, permisos y posibles
-- datos personales. El frontend usa SIEMPRE createSignedUrl, nunca getPublicUrl.
INSERT INTO storage.buckets (id, name, public)
VALUES ('race-documents', 'race-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Ruta obligatoria: {race_id}/… — la política delega en el helper.
DROP POLICY IF EXISTS "race-documents lee organizador" ON storage.objects;
CREATE POLICY "race-documents lee organizador" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'race-documents'
         AND public.puede_gestionar_carrera(((storage.foldername(name))[1])::uuid));

DROP POLICY IF EXISTS "race-documents sube organizador" ON storage.objects;
CREATE POLICY "race-documents sube organizador" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'race-documents'
              AND public.puede_gestionar_carrera(((storage.foldername(name))[1])::uuid));

DROP POLICY IF EXISTS "race-documents actualiza organizador" ON storage.objects;
CREATE POLICY "race-documents actualiza organizador" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'race-documents'
         AND public.puede_gestionar_carrera(((storage.foldername(name))[1])::uuid));

DROP POLICY IF EXISTS "race-documents borra organizador" ON storage.objects;
CREATE POLICY "race-documents borra organizador" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'race-documents'
         AND public.puede_gestionar_carrera(((storage.foldername(name))[1])::uuid));

-- ── 6) Seed del checklist estándar (trail Cantabria) ───────────────────────
-- Se ejecuta LOGUEADO desde el botón "Cargar checklist estándar" de la UI
-- (desde el editor SQL de Lovable auth.uid() es NULL y el check falla).
CREATE OR REPLACE FUNCTION public.seed_requisitos_documentales(p_race_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_count integer;
BEGIN
  IF NOT puede_gestionar_carrera(p_race_id) THEN
    RAISE EXCEPTION 'Sin permisos sobre la carrera %', p_race_id;
  END IF;
  INSERT INTO race_document_requirements
    (race_id, category, title, description, days_before_race, is_required, display_order)
  SELECT p_race_id, v.category, v.title, v.description, v.days, v.req, v.ord
  FROM (VALUES
    ('permiso_municipal',  'Permiso(s) de Ayuntamiento',
     'Autorización de cada municipio que cruza el recorrido. Si son varios, sube un documento por ayuntamiento.', 90, true, 1),
    ('juegos_espectaculos','Autorización Juegos y Espectáculos (Cantabria)',
     'Obligatoria si la prueba discurre por más de un término municipal.', 90, false, 2),
    ('medioambiental',     'Autorización medioambiental',
     'Red Natura 2000 / espacios naturales protegidos. Tramitación lenta: empezar pronto.', 90, true, 3),
    ('etraza_dgt',         'Autorización de tráfico (ETRAZA / DGT)',
     'Solicitud en la sede electrónica de la DGT con memoria, recorrido y horarios.', 60, true, 4),
    ('federacion',         'Homologación / permiso federativo',
     'Federación Cántabra de Atletismo o de Montaña según modalidad.', 60, false, 5),
    ('seguro_rc',          'Póliza de Responsabilidad Civil',
     'Póliza y recibo en vigor que cubra la fecha de la prueba.', 45, true, 6),
    ('seguro_accidentes',  'Póliza de accidentes de participantes',
     'Cobertura de accidentes para todos los inscritos (RD 849/1993 o federativa).', 45, true, 7),
    ('plan_seguridad',     'Plan de seguridad y emergencias',
     'Dispositivo sanitario, evacuación, comunicaciones y coordinación con 112.', 30, true, 8),
    ('proteccion_datos',   'Protección de datos y consentimientos',
     'Cláusulas RGPD de la inscripción y cesión de imagen.', 30, true, 9)
  ) AS v(category, title, description, days, req, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM race_document_requirements x
     WHERE x.race_id = p_race_id AND x.category = v.category AND x.title = v.title
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.seed_requisitos_documentales(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.seed_requisitos_documentales(uuid) TO authenticated;

-- ── 7) Entrada en el menú del panel ────────────────────────────────────────
INSERT INTO public.menu_items (menu_type, title, icon, view_name, group_label, display_order, is_visible, requires_auth)
SELECT * FROM (VALUES
  ('organizer', 'Documentación', 'FolderCheck', 'race-documents', '🏃 Carreras', 5, true, true),
  ('admin',     'Documentación', 'FolderCheck', 'race-documents', '🏃 Carreras', 5, true, true)
) AS m(menu_type, title, icon, view_name, group_label, display_order, is_visible, requires_auth)
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items mi
   WHERE mi.view_name = 'race-documents' AND mi.menu_type = m.menu_type
);
