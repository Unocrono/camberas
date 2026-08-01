-- ============================================================
-- REPARACIÓN: el hardening del 16-jul (20260716142415) hizo
-- REVOKE ... FROM PUBLIC, anon con la intención de "mantener
-- authenticated", pero al revocar PUBLIC se pierde el permiso
-- heredado y authenticated nunca recibió un GRANT explícito.
-- Resultado: los RPCs del panel de administración quedaron rotos
-- ("permission denied") — p. ej. Solicitudes de Organizadores.
--
-- Se restaura EXECUTE a authenticated SOLO en los RPCs que el
-- panel invoca (todos comprueban has_role internamente). Las
-- funciones de triggers internos se quedan sin permisos de
-- cliente, como debe ser.
-- ============================================================

GRANT EXECUTE ON FUNCTION public.get_organizer_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_with_emails() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_event_results(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_race_results(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_split_times(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_split_positions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_split_times(uuid) TO authenticated;
