-- ============================================================
-- TIPOS DE PUESTO · GRUPOS (5-ago-2026)
--
-- El desplegable de tipos se organiza en tres bloques con cabecera no
-- seleccionable (lista revisada por el usuario):
--
--   El recorrido        → Cruce, Avituallamiento, Punto de control,
--                         Escoba, Control móvil
--   Salida y meta       → Salida, Meta, Entrega de dorsales,
--                         Acreditaciones, Guardarropa
--   Seguridad y logística → Sanitario, Señalización, Parking,
--                         Avituallamiento final, Recogida de material
--
-- "Otro" queda en un grupo final para lo que no encaje. El grupo vive en
-- la tabla (group_label), igual que hace menu_items: la pantalla no lleva
-- la lista incrustada.
--
-- OJO (corrección del usuario): Policía, Protección Civil y el médico NO
-- son voluntarios — son personal de organización y se controlan desde
-- GPS Organización. Por eso no entran aquí, y la opción de menú de
-- GPS Organización se mueve al grupo Organización para tenerlos al lado.
-- ============================================================

ALTER TABLE public.race_post_types ADD COLUMN IF NOT EXISTS group_label text;

-- Grupo y orden de los tipos ya sembrados
UPDATE public.race_post_types SET group_label = 'El recorrido',          display_order = 10  WHERE name = 'cruce';
UPDATE public.race_post_types SET group_label = 'El recorrido',          display_order = 20  WHERE name = 'avituallamiento';
UPDATE public.race_post_types SET group_label = 'El recorrido',          display_order = 40  WHERE name = 'escoba';
UPDATE public.race_post_types SET group_label = 'El recorrido',          display_order = 50  WHERE name = 'movil';
UPDATE public.race_post_types SET group_label = 'Salida y meta',         display_order = 60  WHERE name = 'salida';
UPDATE public.race_post_types SET group_label = 'Salida y meta',         display_order = 70  WHERE name = 'meta';
UPDATE public.race_post_types SET group_label = 'Salida y meta',         display_order = 100 WHERE name = 'guardarropa';
UPDATE public.race_post_types SET group_label = 'Seguridad y logística', display_order = 110 WHERE name = 'sanitario';
UPDATE public.race_post_types SET group_label = 'Seguridad y logística', display_order = 140 WHERE name = 'senalizacion';
UPDATE public.race_post_types SET group_label = 'Seguridad y logística', display_order = 150 WHERE name = 'parking';
UPDATE public.race_post_types SET group_label = 'Seguridad y logística', display_order = 170 WHERE name = 'recogida';
UPDATE public.race_post_types SET group_label = 'Otros',                 display_order = 200 WHERE name = 'otro';

-- Tipos nuevos de la lista
INSERT INTO public.race_post_types (name, label, icon, color, description, display_order, group_label) VALUES
  ('control',              'Punto de control',     'Flag',        '#6366F1', 'Anotar dorsales al paso', 30,  'El recorrido'),
  ('entrega-dorsales',     'Entrega de dorsales',  'Ticket',      '#10B981', 'Reparto de dorsales y bolsa del corredor', 80,  'Salida y meta'),
  ('acreditaciones',       'Acreditaciones',       'BadgeCheck',  '#14B8A6', 'Acreditación de prensa, staff e invitados', 90,  'Salida y meta'),
  ('avituallamiento-final','Avituallamiento final','Utensils',    '#0D9488', 'Reparto post-meta', 160, 'Seguridad y logística')
ON CONFLICT (name) DO NOTHING;

-- ── GPS Organización, visible en el grupo Organización ─────────────────────
--    Policía, Protección Civil y el médico se controlan ahí (personal de
--    organización con GPS), al lado del voluntariado y los puestos.
UPDATE public.menu_items
   SET group_label = '🦺 Organización',
       title = 'GPS Organización',
       display_order = 18
 WHERE view_name = 'motos';

INSERT INTO public.menu_items (menu_type, title, icon, view_name, group_label, display_order, is_visible, requires_auth)
SELECT * FROM (VALUES
  ('organizer', 'GPS Organización', 'Satellite', 'motos', '🦺 Organización', 18, true, true),
  ('admin',     'GPS Organización', 'Satellite', 'motos', '🦺 Organización', 18, true, true)
) AS m(menu_type, title, icon, view_name, group_label, display_order, is_visible, requires_auth)
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items mi
   WHERE mi.view_name = 'motos' AND mi.menu_type = m.menu_type
);
