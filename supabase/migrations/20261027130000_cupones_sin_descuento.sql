-- =============================================================================
-- Cupones sin descuento (0 %) para invitar con plaza reservada (27-oct-2026).
--
-- Con el aforo completo, el organizador quiere invitar a gente que PAGA el
-- precio normal: un cupón con reserva_plaza (20261027120000) y 0 % de
-- descuento. El CHECK discount_value > 0 lo impedía. Pasa a >= 0: un cupón
-- del 0 % deja el precio tal cual (computeCouponDiscount da 0) y solo
-- aporta la plaza. Nada más cambia.
--
-- Sentencias sueltas e idempotentes. APLICADA el 27-oct-2026.
-- =============================================================================

ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_discount_value_check;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_discount_value_check CHECK (discount_value >= 0);

-- Comprobación
SELECT pg_get_constraintdef(oid) AS regla FROM pg_constraint WHERE conname = 'coupons_discount_value_check';
