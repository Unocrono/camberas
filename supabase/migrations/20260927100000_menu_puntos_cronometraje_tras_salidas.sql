-- =============================================================================
-- Menú del panel: «Puntos de Cronometraje» (timing-points) va en el grupo de
-- Cronometraje como segunda opción, justo detrás de «Horas de Salida» (waves),
-- en organizador y admin. Se toma el grupo y la posición de la fila de waves
-- por si se han renombrado desde el panel.
-- Dos pasadas (+1000 y -999) por si display_order tuviera unicidad.
-- =============================================================================

-- 1. Hacer hueco: lo que va detrás de Horas de Salida en su grupo baja un puesto
UPDATE public.menu_items m
   SET display_order = m.display_order + 1000
  FROM public.menu_items w
 WHERE w.view_name = 'waves'
   AND w.menu_type = m.menu_type
   AND m.group_label = w.group_label
   AND m.display_order > w.display_order
   AND m.view_name <> 'timing-points';

UPDATE public.menu_items
   SET display_order = display_order - 999
 WHERE display_order >= 1000;

-- 2. Puntos de Cronometraje al hueco: mismo grupo que Horas de Salida, un puesto después
UPDATE public.menu_items m
   SET group_label  = w.group_label,
       display_order = w.display_order + 1
  FROM public.menu_items w
 WHERE w.view_name = 'waves'
   AND w.menu_type = m.menu_type
   AND m.view_name = 'timing-points';

-- Comprobación: el grupo de Cronometraje en orden, con timing-points el segundo
SELECT m.menu_type, m.title, m.view_name, m.group_label, m.display_order
  FROM public.menu_items m
  JOIN public.menu_items w ON w.view_name = 'waves' AND w.menu_type = m.menu_type
 WHERE m.group_label = w.group_label
 ORDER BY m.menu_type, m.display_order;
