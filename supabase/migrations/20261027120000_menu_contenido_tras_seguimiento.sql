-- ============================================================
-- MENÚ: «Contenido» debajo de «Seguimiento GPS» (27-oct-2026)
--
-- Petición del dueño. Los grupos del menú lateral se ordenan por el
-- display_order MÁS BAJO de sus filas (useMenuItems). «Web propia» entró en
-- Contenido con 368 (20260924180000) y arrastraba el grupo entero a justo
-- después de Inscripciones. Con 790 queda primero dentro de Contenido
-- (Archivos Multimedia va en 800) y el grupo pasa detrás de Seguimiento
-- GPS (700-750), en el panel del organizador y en el del admin.
--
-- APLICADA en producción el 27-oct-2026.
-- ============================================================

UPDATE public.menu_items SET display_order = 790
 WHERE view_name = 'web-propia' AND menu_type IN ('admin', 'organizer') AND display_order = 368;
