-- Remates tras la verificación de la primera importación de RockTheSport
-- (10-oct-2026).
--
-- 1) Las tablas de configuración de las sincronizaciones son de SOLO LECTURA
--    para el cliente. La 20261010120000 revocaba a anon y PUBLIC, pero los
--    privilegios por defecto de Supabase ya habían dado ALL a authenticated
--    (y en eventbooking_sync también a anon). RLS sin políticas de escritura
--    frena INSERT/UPDATE/DELETE, pero TRUNCATE no pasa por RLS. En Postgres 17
--    ALL incluye MAINTAIN, que un REVOKE enumerado dejaría puesto: por eso
--    REVOKE ALL y se vuelve a dar SELECT. Solo escriben las edge functions
--    (service_role); el panel solo lee.
REVOKE ALL ON public.rockthesport_sync FROM anon, authenticated, PUBLIC;
GRANT  SELECT ON public.rockthesport_sync TO authenticated;
GRANT  ALL    ON public.rockthesport_sync TO service_role;

REVOKE ALL ON public.eventbooking_sync FROM anon, authenticated, PUBLIC;
GRANT  SELECT ON public.eventbooking_sync TO authenticated;
GRANT  ALL    ON public.eventbooking_sync TO service_role;

-- 2) La plantilla del comprobante no se manda a las importadas de otra
--    plataforma: ya no es solo uno.es. El replace acotado respeta una
--    descripción que alguien hubiera retocado a mano.
UPDATE public.plantillas_email
   SET descripcion = replace(
         descripcion,
         'No se manda a las importadas de uno.es salvo que se pida.',
         'No se manda a las importadas de otras plataformas (uno.es, RockTheSport) salvo que se pida.')
 WHERE clave = 'comprobante'
   AND descripcion LIKE '%importadas de uno.es salvo que se pida.%';

-- Comprobación: authenticated solo SELECT (r), anon fuera; la plantilla al día
SELECT relname AS que, relacl::text AS valor FROM pg_class
 WHERE relname IN ('rockthesport_sync', 'eventbooking_sync')
UNION ALL
SELECT 'plantilla comprobante', descripcion FROM public.plantillas_email WHERE clave = 'comprobante';
