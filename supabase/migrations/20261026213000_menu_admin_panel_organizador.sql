-- =============================================================================
-- Menú de Admin: «Panel del organizador» (26-oct-2026).
--
-- El promotor quiere ver desde Admin lo que ve el organizador al entrar en su
-- panel (la portada de /organizer, OrganizerDashboardHome), con la carrera
-- elegida arriba, para ir mejorándolo. Primera opción del grupo Carreras,
-- como en el menú del organizador (allí es «Panel de Organizador», orden 100).
--
-- Sentencia suelta e idempotente. Ensayada en seco y APLICADA el 26-oct-2026.
-- =============================================================================

INSERT INTO public.menu_items
  (menu_type, title, icon, route, view_name, parent_id, group_label, display_order, is_visible, requires_auth)
SELECT 'admin', 'Panel del organizador', 'Home', NULL, 'panel-organizador', NULL,
       (SELECT m.group_label FROM public.menu_items m WHERE m.menu_type = 'admin' AND m.view_name = 'races' LIMIT 1),
       99, true, true
 WHERE NOT EXISTS (SELECT 1 FROM public.menu_items m WHERE m.menu_type = 'admin' AND m.view_name = 'panel-organizador');

-- Comprobación: una fila, en el grupo de Gestión de Carreras y antes que ella
SELECT menu_type, group_label, display_order, title, icon, view_name
  FROM public.menu_items
 WHERE menu_type = 'admin' AND view_name IN ('panel-organizador', 'races')
 ORDER BY display_order;
