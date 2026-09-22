-- Mesas de recogida y Pantallas de seguimiento: entrada propia en el menu
--
-- Las dos gestiones de "puestos con token" iban colgadas de otras pantallas
-- para no tocar el menu: las mesas encima de Inscripciones (la pantalla mas
-- usada del panel, pagando peaje a diario por algo de un dia al ano) y las
-- pantallas dentro de Camberas Track. El usuario lo senalo y tenia razon.
--
-- El menu vive en menu_items, asi que es una fila por panel y pantalla:
--   . Mesas de recogida        -> grupo Organizacion (con Puestos y
--                                 Voluntariado: gente y logistica del dia)
--   . Pantallas de seguimiento -> grupo Seguimiento GPS (es lo que ensenan)
-- Los view_name los atienden AdminDashboard y OrganizerDashboard.
--
-- El nombre del grupo lleva emoji y NO se escribe aqui: se copia de una fila
-- vecina que ya existe (Voluntariado / Camberas Track). Asi el SQL es ASCII
-- puro y el grupo coincide exactamente con el que ya pinta el menu.

INSERT INTO public.menu_items
  (menu_type, title, icon, route, view_name, parent_id, group_label, display_order, is_visible, requires_auth)
SELECT v.menu_type, v.title, v.icon, NULL, v.view_name, NULL,
       (SELECT m.group_label FROM public.menu_items m
        WHERE m.menu_type = v.menu_type AND m.view_name = v.vecino
        LIMIT 1),
       v.display_order, true, true
FROM (VALUES
  ('admin',     'Mesas de recogida',        'Ticket',  'mesas-recogida',        'voluntariado',   430),
  ('admin',     'Pantallas de seguimiento', 'Monitor', 'pantallas-seguimiento', 'camberas-track', 705),
  ('organizer', 'Mesas de recogida',        'Ticket',  'mesas-recogida',        'voluntariado',   430),
  ('organizer', 'Pantallas de seguimiento', 'Monitor', 'pantallas-seguimiento', 'camberas-track', 705)
) AS v(menu_type, title, icon, view_name, vecino, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items m
  WHERE m.menu_type = v.menu_type AND m.view_name = v.view_name
);

-- Comprobacion: deben salir las 4 filas, cada una con el grupo de su vecina
SELECT menu_type, group_label, display_order, title, view_name, icon
FROM public.menu_items
WHERE view_name IN ('mesas-recogida', 'pantallas-seguimiento')
ORDER BY menu_type, display_order;
