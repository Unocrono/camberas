-- Mesas de recogida y Pantallas de seguimiento: entrada propia en el menú
--
-- Las dos gestiones de "puestos con token" iban colgadas de otras pantallas
-- para no tocar el menú: las mesas encima de Inscripciones (la pantalla más
-- usada del panel, pagando peaje a diario por algo de un día al año) y las
-- pantallas dentro de Camberas Track. El usuario lo señaló y tenía razón.
--
-- El menú vive en menu_items, así que es una fila por panel y pantalla:
--   · Mesas de recogida      → 🦺 Organización (con Puestos y Voluntariado,
--                              que es lo mismo: gente y logística del día)
--   · Pantallas de seguimiento → 📍 Seguimiento GPS (es lo que enseñan)
-- Los view_name los atienden AdminDashboard y OrganizerDashboard.

INSERT INTO public.menu_items
  (menu_type, title, icon, route, view_name, parent_id, group_label, display_order, is_visible, requires_auth)
SELECT v.menu_type, v.title, v.icon, NULL, v.view_name, NULL, v.group_label, v.display_order, true, true
FROM (VALUES
  ('admin',     'Mesas de recogida',       'Ticket',  'mesas-recogida',        '🦺 Organización',    430),
  ('admin',     'Pantallas de seguimiento', 'Monitor', 'pantallas-seguimiento', '📍 Seguimiento GPS', 705),
  ('organizer', 'Mesas de recogida',       'Ticket',  'mesas-recogida',        '🦺 Organización',    430),
  ('organizer', 'Pantallas de seguimiento', 'Monitor', 'pantallas-seguimiento', '📍 Seguimiento GPS', 705)
) AS v(menu_type, title, icon, view_name, group_label, display_order)
-- Idempotente: si ya existe la entrada en ese menú, no se duplica
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items m
  WHERE m.menu_type = v.menu_type AND m.view_name = v.view_name
);

-- Comprobación: deben salir las 4 filas, en su grupo y con su orden
SELECT menu_type, group_label, display_order, title, view_name, icon
FROM public.menu_items
WHERE view_name IN ('mesas-recogida', 'pantallas-seguimiento')
ORDER BY menu_type, display_order;
