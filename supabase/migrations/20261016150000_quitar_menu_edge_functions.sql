-- ============================================================
-- QUITAR «EDGE FUNCTIONS» DEL MENÚ DEL PANEL
--
-- El dueño (16-oct): «quitamos el menú Edge Functions, porque no sirve para
-- nada». La pantalla solo encendía y apagaba filas de edge_function_flags y
-- ninguna función del servidor las miraba: apagar, por ejemplo,
-- send-payment-confirmation no paraba los correos. El único lector real era
-- el enlace «Asistente IA» del menú público, que se retiró con support-chat
-- (16-oct). La pantalla y su hook salen del código en el mismo cambio.
--
-- Solo se borra la entrada del menú. La tabla edge_function_flags se queda
-- (sin lectores): borrarla es un cambio destructivo aparte.
--
-- PENDIENTE DE APLICAR en producción (panel de Supabase).
-- ============================================================

BEGIN;

DELETE FROM public.menu_items
 WHERE menu_type = 'admin'
   AND view_name = 'edge-functions';

COMMIT;

-- Comprobación: debe dar 0
SELECT count(*) AS entradas_edge_functions
  FROM public.menu_items
 WHERE view_name = 'edge-functions';
