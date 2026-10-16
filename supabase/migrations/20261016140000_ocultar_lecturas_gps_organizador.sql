-- No se cronometra con GPS (decisión del usuario, 16-oct-2026): la edge
-- function process-gps-geofence ya no existe y la pantalla «Lecturas GPS»
-- del organizador (GPSReadingsManagement, lecturas gps_geofence que nunca
-- llegó a haber) se ha borrado del código. Se oculta su entrada de menú.
-- La «Lecturas GPS» del admin es otra cosa (el visor de posiciones,
-- GPSTrackingViewer) y se queda. Aplicado en producción el 16-oct.
UPDATE public.menu_items
   SET is_visible = false, updated_at = now()
 WHERE menu_type = 'organizer' AND view_name = 'gps-readings';
