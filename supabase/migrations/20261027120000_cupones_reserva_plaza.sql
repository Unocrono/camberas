-- =============================================================================
-- Cupones que reservan plaza aunque el aforo esté completo (27-oct-2026).
--
-- Monte Tejas se llenó (200) y el organizador quiere dejar entrar a gente
-- concreta con un cupón, inscribiéndose ellos mismos. Hoy el enlace de /org
-- (?cupon=CODIGO) no sirve: con el recorrido completo la web no deja abrir
-- el formulario y guest-register corta por aforo antes de mirar el cupón.
--
-- coupons.reserva_plaza: con ella, guest-register no aplica el tope de
-- plazas a quien se inscribe con ese cupón (el tope lo pone el cupón con sus
-- usos), validate-coupon lo devuelve a la web para que abra el formulario
-- aunque diga «completo», y /org lo enseña en la lista. Para el público sin
-- cupón nada cambia: la carrera sigue agotada.
--
-- Sentencias sueltas e idempotentes. APLICADA el 27-oct-2026.
-- =============================================================================

ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS reserva_plaza boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.coupons.reserva_plaza IS
  'Con true, quien se inscribe con este cupón entra aunque el recorrido esté completo: el tope lo ponen los usos del cupón. Lo lee guest-register (salta el aforo) y validate-coupon (la web abre el formulario).';

-- Comprobación: la columna existe y nadie la tiene puesta todavía
SELECT count(*) AS cupones, count(*) FILTER (WHERE reserva_plaza) AS con_reserva FROM public.coupons;
