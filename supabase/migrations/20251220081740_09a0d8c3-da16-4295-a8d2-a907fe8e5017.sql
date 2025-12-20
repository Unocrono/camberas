-- Crear tabla para gestionar menús dinámicos
CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_type text NOT NULL CHECK (menu_type IN ('navbar', 'organizer', 'admin')),
  title text NOT NULL,
  icon text NOT NULL DEFAULT 'Circle',
  route text, -- URL o nombre de vista interna
  view_name text, -- Para vistas internas del dashboard (ej: 'races', 'registrations')
  parent_id uuid REFERENCES public.menu_items(id) ON DELETE CASCADE,
  group_label text, -- Etiqueta del grupo (ej: '🏃 Carreras')
  display_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  requires_auth boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para mejor rendimiento
CREATE INDEX idx_menu_items_menu_type ON public.menu_items(menu_type);
CREATE INDEX idx_menu_items_parent_id ON public.menu_items(parent_id);
CREATE INDEX idx_menu_items_display_order ON public.menu_items(menu_type, display_order);

-- Habilitar RLS
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Anyone can view visible menu items"
ON public.menu_items
FOR SELECT
USING (is_visible = true OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all menu items"
ON public.menu_items
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Trigger para updated_at
CREATE TRIGGER update_menu_items_updated_at
BEFORE UPDATE ON public.menu_items
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Insertar menú de Organizador por defecto
INSERT INTO public.menu_items (menu_type, title, icon, view_name, group_label, display_order) VALUES
-- Grupo Carreras
('organizer', 'Gestión de Carreras', 'Calendar', 'races', '🏃 Carreras', 1),
('organizer', 'Recorridos', 'Route', 'distances', '🏃 Carreras', 2),
('organizer', 'Reglamento', 'Scale', 'regulations', '🏃 Carreras', 3),
-- Grupo Recorrido
('organizer', 'Puntos de Cronometraje', 'Clock', 'timing-points', '🗺️ Recorrido', 10),
('organizer', 'Puntos de Control', 'MapPin', 'checkpoints', '🗺️ Recorrido', 11),
('organizer', 'Rutómetros', 'Map', 'roadbooks', '🗺️ Recorrido', 12),
-- Grupo Inscripciones
('organizer', 'Inscripciones', 'Users', 'registrations', '📝 Inscripciones', 20),
('organizer', 'Campos de Formulario', 'FileText', 'form-fields', '📝 Inscripciones', 21),
('organizer', 'Resumen de Tallas', 'Shirt', 'tshirt-sizes', '📝 Inscripciones', 22),
-- Grupo Cronometraje
('organizer', 'Horas de Salida', 'Flag', 'waves', '⏱️ Cronometraje', 30),
('organizer', 'Chips RFID', 'Cpu', 'bib-chips', '⏱️ Cronometraje', 31),
('organizer', 'Cronometradores', 'UserCog', 'timer-assignments', '⏱️ Cronometraje', 32),
('organizer', 'Resultados', 'Trophy', 'results', '⏱️ Cronometraje', 33),
('organizer', 'Tiempos Parciales', 'Timer', 'splits', '⏱️ Cronometraje', 34),
('organizer', 'Lecturas Crono', 'Radio', 'timing-readings', '⏱️ Cronometraje', 35),
('organizer', 'Lecturas GPS', 'Satellite', 'gps-readings', '⏱️ Cronometraje', 36),
-- Grupo Contenido
('organizer', 'Archivos Multimedia', 'FolderOpen', 'storage', '📁 Contenido', 40),
('organizer', 'FAQs de Carreras', 'HelpCircle', 'race-faqs', '📁 Contenido', 41);

-- Insertar menú de Admin por defecto
INSERT INTO public.menu_items (menu_type, title, icon, view_name, group_label, display_order) VALUES
-- Grupo Carreras (admin)
('admin', 'Gestión de Carreras', 'Calendar', 'races', '🏃 Carreras', 1),
('admin', 'Recorridos', 'Route', 'distances', '🏃 Carreras', 2),
('admin', 'Reglamento', 'Scale', 'regulations', '🏃 Carreras', 3),
-- Grupo Recorrido (admin)
('admin', 'Puntos de Cronometraje', 'Clock', 'timing-points', '🗺️ Recorrido', 10),
('admin', 'Puntos de Control', 'MapPin', 'checkpoints', '🗺️ Recorrido', 11),
('admin', 'Rutómetros', 'Map', 'roadbooks', '🗺️ Recorrido', 12),
('admin', 'Tipos de Rutómetro', 'Layers', 'roadbook-types', '🗺️ Recorrido', 13),
-- Grupo Inscripciones (admin)
('admin', 'Inscripciones', 'Users', 'registrations', '📝 Inscripciones', 20),
('admin', 'Campos de Formulario', 'FileText', 'form-fields', '📝 Inscripciones', 21),
('admin', 'Resumen de Tallas', 'Shirt', 'tshirt-sizes', '📝 Inscripciones', 22),
-- Grupo Cronometraje (admin)
('admin', 'Horas de Salida', 'Flag', 'waves', '⏱️ Cronometraje', 30),
('admin', 'Chips RFID', 'Cpu', 'bib-chips', '⏱️ Cronometraje', 31),
('admin', 'Cronometradores', 'UserCog', 'timer-assignments', '⏱️ Cronometraje', 32),
('admin', 'Resultados', 'Trophy', 'results', '⏱️ Cronometraje', 33),
('admin', 'Tiempos Parciales', 'Timer', 'splits', '⏱️ Cronometraje', 34),
('admin', 'Lecturas Crono', 'Radio', 'timing-readings', '⏱️ Cronometraje', 35),
('admin', 'Lecturas GPS', 'Satellite', 'gps-readings', '⏱️ Cronometraje', 36),
('admin', 'Estados de Resultados', 'ListChecks', 'results-status', '⏱️ Cronometraje', 37),
-- Grupo Contenido (admin)
('admin', 'Archivos Multimedia', 'FolderOpen', 'storage', '📁 Contenido', 40),
('admin', 'FAQs de Carreras', 'HelpCircle', 'race-faqs', '📁 Contenido', 41),
('admin', 'FAQs de Organizadores', 'HelpCircle', 'organizer-faqs', '📁 Contenido', 42),
-- Grupo Sistema (admin)
('admin', 'Usuarios', 'Users', 'users', '⚙️ Sistema', 50),
('admin', 'Solicitudes Organizadores', 'UserCheck', 'organizer-requests', '⚙️ Sistema', 51),
('admin', 'Edge Functions', 'Zap', 'edge-functions', '⚙️ Sistema', 52),
('admin', 'Contacto', 'Mail', 'contact-settings', '⚙️ Sistema', 53),
('admin', 'Notificaciones', 'Bell', 'notifications', '⚙️ Sistema', 54),
('admin', 'Gestión de Menús', 'Menu', 'menu-management', '⚙️ Sistema', 55);

-- Insertar menú navbar por defecto
INSERT INTO public.menu_items (menu_type, title, icon, route, display_order, requires_auth) VALUES
('navbar', 'Carreras', 'Calendar', '/races', 1, false),
('navbar', 'Tienda', 'ShoppingBag', '/timing-shop', 2, false),
('navbar', 'Preguntas Frecuentes', 'HelpCircle', '/faqs', 3, false),
('navbar', 'Contacto', 'Mail', '/contact', 4, false);