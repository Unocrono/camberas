-- URGENTE: cerrar de verdad las funciones de servidor de recuperacion de pagos
--
-- Las dos migraciones anteriores llevaban `REVOKE EXECUTE ... FROM PUBLIC`
-- creyendo que eso bastaba. NO BASTA EN SUPABASE. El proyecto trae puesto:
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
--
-- o sea que cada funcion nueva de `public` nace con un permiso EXPLICITO para
-- `anon` y para `authenticated`. Revocar de PUBLIC no quita ese permiso: quita
-- otro distinto. Comprobado contra el proyecto en produccion — con la clave
-- anonima, la que viaja dentro del bundle del navegador, se podia llamar a
-- avisos_pago_pendientes() y llevarse los nombres y correos de todo el que
-- dejo una inscripcion a medias.
--
-- La regla, para no volver a caer: en este proyecto hay que revocar POR NOMBRE
-- de rol (anon, authenticated), no de PUBLIC.

-- ─────────────────────────────────────────────────────────────────────────
-- Solo el robot (service_role). Ni anon ni usuarios con sesion.
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.registrar_pagos_a_medias(integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registrar_pagos_a_medias(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.avisos_pago_pendientes() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.avisos_pago_pendientes() TO service_role;

REVOKE EXECUTE ON FUNCTION public.marcar_aviso_pago(uuid, integer, numeric) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.marcar_aviso_pago(uuid, integer, numeric) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cerrar_recuperaciones_pagadas() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cerrar_recuperaciones_pagadas() TO service_role;

-- Con un id de inscripcion suelto devolvia el token del enlace de pago de esa
-- persona. Solo servidor: quien decide de cara al publico es
-- resolver_inscripcion_previa, que comprueba de quien es la inscripcion.
REVOKE EXECUTE ON FUNCTION public.token_recuperacion_inscripcion(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.token_recuperacion_inscripcion(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Con sesion, pero no anonimo
-- ─────────────────────────────────────────────────────────────────────────

-- La llama RaceDetail desde el navegador para el corredor con cuenta. Por
-- dentro exige que p_user_id sea el de la sesion y anula p_email, asi que con
-- sesion es segura. Anonima NO: sin sesion, el email vale como criterio y con
-- el correo de otro se le podia cancelar la inscripcion a medias.
REVOKE EXECUTE ON FUNCTION public.resolver_inscripcion_previa(uuid, uuid, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resolver_inscripcion_previa(uuid, uuid, text, uuid) TO authenticated, service_role;

-- El resumen del organizador ya filtra por rol dentro, pero no hay motivo
-- para que anon pueda ni preguntarlo
REVOKE EXECUTE ON FUNCTION public.resumen_recuperacion_pagos(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resumen_recuperacion_pagos(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Estas dos SI son publicas a proposito, y se dejan dichas para que quede
-- claro que no es un olvido:
--   plazas_libres          — no dice nada que no este ya en la ficha publica
--   recuperacion_pago_info — la abre quien recibe el correo, tenga cuenta o no
-- ─────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.plazas_libres(uuid)          TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recuperacion_pago_info(uuid) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Comprobacion. Deberia devolver exactamente esto:
--
--   avisos_pago_pendientes          | f | f
--   cerrar_recuperaciones_pagadas   | f | f
--   marcar_aviso_pago               | f | f
--   plazas_libres                   | t | t
--   recuperacion_pago_info          | t | t
--   registrar_pagos_a_medias        | f | f
--   resolver_inscripcion_previa     | f | t
--   resumen_recuperacion_pagos      | f | t
--   token_recuperacion_inscripcion  | f | f
-- ─────────────────────────────────────────────────────────────────────────
SELECT p.proname                                              AS funcion,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS con_sesion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'plazas_libres', 'registrar_pagos_a_medias', 'avisos_pago_pendientes',
    'marcar_aviso_pago', 'cerrar_recuperaciones_pagadas', 'recuperacion_pago_info',
    'resumen_recuperacion_pagos', 'token_recuperacion_inscripcion',
    'resolver_inscripcion_previa'
  )
ORDER BY p.proname;
