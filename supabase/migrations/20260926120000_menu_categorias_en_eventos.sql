-- =============================================================================
-- Menú del panel: «Categorías» y «Plantillas de Categorías» pasan al grupo de
-- los eventos (el mismo grupo donde está «Recorridos»), en organizador y
-- admin. Son datos de Camberas por evento, no de la web propia.
-- Se toma el nombre del grupo de la fila de «Recorridos» (view_name distances)
-- por si se ha renombrado desde el panel; quedan justo detrás de Recorridos.
-- =============================================================================

UPDATE public.menu_items m
   SET group_label  = d.group_label,
       display_order = d.display_order + CASE m.view_name WHEN 'categories' THEN 1 ELSE 2 END
  FROM public.menu_items d
 WHERE d.view_name = 'distances'
   AND d.menu_type = m.menu_type
   AND m.view_name IN ('categories', 'category-templates');

-- Comprobación: Recorridos, Categorías y Plantillas seguidos, mismo grupo
SELECT menu_type, title, view_name, group_label, display_order
  FROM public.menu_items
 WHERE view_name IN ('distances', 'categories', 'category-templates')
 ORDER BY menu_type, display_order;
