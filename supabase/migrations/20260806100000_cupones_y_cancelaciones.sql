-- ============================================================
-- CUPONES DE DESCUENTO + POLÍTICA DE CANCELACIÓN (6-ago-2026)
--
-- PRINCIPIO DE ORO: el precio es autoritativo en el servidor. El cupón se
-- valida y se aplica en las edge functions (guest-register /
-- redsys-init-payment) con service role; el cliente solo muestra el desglose.
--
-- Cupones:
--   coupons            → definición: ámbito carrera (+distancia opcional),
--                        percent|fixed, sobre la tarifa o sobre el total.
--   coupon_redemptions → un canje por inscripción. Los usos disponibles se
--                        cuentan descartando inscripciones canceladas: así
--                        cancelar libera el cupón sin código extra en ninguna
--                        ruta de cancelación.
--   El canje lo registra un trigger sobre registrations cuando el pago queda
--   resuelto (paid / not_required), venga por el flujo que venga: webhook de
--   Redsys, inscripción gratuita de invitado o flujo de usuario registrado.
--
-- Cancelaciones:
--   race_cancellation_tiers → tramos "cancelando con ≥ N días de antelación
--   se devuelve el X%". El tramo más exigente que se cumpla es el que aplica;
--   sin tramo que cumpla, no se permite cancelar. Sin tramos definidos, la
--   web mantiene la regla histórica (7 días, sin devolución). La devolución
--   en Redsys es MANUAL: la tabla informa al corredor y al organizador, no
--   mueve dinero.
-- ============================================================

-- ── 1) Cupones ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coupons (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id            uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  race_distance_id   uuid REFERENCES public.race_distances(id) ON DELETE CASCADE,
  code               text NOT NULL,
  discount_type      text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value     numeric NOT NULL CHECK (discount_value > 0),
  -- 'base': descuenta solo la tarifa de inscripción (los suplementos de
  -- campos —autobús, comidas— se cobran íntegros). 'total': descuenta
  -- también los suplementos, salvo campos con discountable=false.
  applies_to         text NOT NULL DEFAULT 'base' CHECK (applies_to IN ('base', 'total')),
  max_uses           integer CHECK (max_uses IS NULL OR max_uses > 0),
  max_uses_per_email integer NOT NULL DEFAULT 1 CHECK (max_uses_per_email > 0),
  min_amount         numeric CHECK (min_amount IS NULL OR min_amount >= 0),
  valid_from         timestamptz,
  valid_until        timestamptz,
  active             boolean NOT NULL DEFAULT true,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_percent_max CHECK (discount_type <> 'percent' OR discount_value <= 100),
  UNIQUE (race_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coupons_race ON public.coupons(race_id, active);

-- El código llega tecleado o pegado de un WhatsApp: se normaliza en la BD
-- (mayúsculas, sin espacios) para que el UNIQUE y la búsqueda funcionen.
CREATE OR REPLACE FUNCTION public.cupones_normalizar()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $fn$
BEGIN
  NEW.code := upper(regexp_replace(coalesce(NEW.code, ''), '\s', '', 'g'));
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_coupons_normalizar ON public.coupons;
CREATE TRIGGER trg_coupons_normalizar
  BEFORE INSERT OR UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.cupones_normalizar();

-- ── 2) Canjes ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id         uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  registration_id   uuid NOT NULL UNIQUE REFERENCES public.registrations(id) ON DELETE CASCADE,
  email             text NOT NULL,
  amount_discounted numeric NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON public.coupon_redemptions(coupon_id);

-- ── 3) Columnas de apoyo ───────────────────────────────────────────────────
-- El cupón se ancla a la inscripción al crearla: redsys-init-payment solo
-- recibe registrationId y lee de aquí qué cupón recalcular.
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_discount numeric;

-- Desglose para la recaudación del organizador: amount = cobrado (con el
-- descuento ya aplicado), discount_amount = lo descontado.
ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS discount_amount numeric;

-- ── 4) Registro del canje: trigger, no código repartido por los flujos ─────
-- Dispara cuando el pago queda resuelto. ON CONFLICT hace de candado: una
-- inscripción canjea una sola vez aunque el webhook llegue duplicado.
CREATE OR REPLACE FUNCTION public.cupones_registrar_canje()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NEW.coupon_id IS NOT NULL
     AND NEW.payment_status IN ('paid', 'not_required') THEN
    INSERT INTO coupon_redemptions (coupon_id, registration_id, email, amount_discounted)
    VALUES (NEW.coupon_id, NEW.id, lower(coalesce(NEW.email, '')), coalesce(NEW.coupon_discount, 0))
    ON CONFLICT (registration_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_registrations_canje_cupon ON public.registrations;
CREATE TRIGGER trg_registrations_canje_cupon
  AFTER INSERT OR UPDATE OF payment_status ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.cupones_registrar_canje();

-- ── 5) Cuenta de usos ──────────────────────────────────────────────────────
-- La usan las edge functions (validación) y el panel (columna "usos").
-- Cancelar una inscripción libera el uso porque aquí se descartan las
-- canceladas — no hay que tocar ninguna ruta de cancelación.
CREATE OR REPLACE FUNCTION public.coupon_uses(p_coupon_id uuid, p_email text DEFAULT NULL)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT count(*)::int
  FROM coupon_redemptions cr
  JOIN registrations r ON r.id = cr.registration_id
  WHERE cr.coupon_id = p_coupon_id
    AND r.status <> 'cancelled'
    AND (p_email IS NULL OR cr.email = lower(p_email))
$fn$;

REVOKE EXECUTE ON FUNCTION public.coupon_uses(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.coupon_uses(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.coupon_uses(uuid, text) TO authenticated;

-- ── 6) Política de cancelación por tramos ──────────────────────────────────
-- "Cancelando con ≥ days_before días de antelación → refund_percent%".
CREATE TABLE IF NOT EXISTS public.race_cancellation_tiers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id        uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  days_before    integer NOT NULL CHECK (days_before >= 0),
  refund_percent integer NOT NULL CHECK (refund_percent BETWEEN 0 AND 100),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (race_id, days_before)
);

CREATE INDEX IF NOT EXISTS idx_cancellation_tiers_race ON public.race_cancellation_tiers(race_id);

-- ── 7) RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.coupons                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_cancellation_tiers ENABLE ROW LEVEL SECURITY;

-- Cupones: solo el organizador de la carrera o admin. La validación pública
-- va por edge function con service role, no por anon.
DROP POLICY IF EXISTS "Cupones: organizador de la carrera o admin" ON public.coupons;
CREATE POLICY "Cupones: organizador de la carrera o admin"
  ON public.coupons FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM races r WHERE r.id = coupons.race_id AND r.organizer_id = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM races r WHERE r.id = coupons.race_id AND r.organizer_id = auth.uid())
  );

-- Canjes: el organizador los VE (para auditar usos); solo el servidor
-- (trigger con service role) los escribe.
DROP POLICY IF EXISTS "Canjes: lectura del organizador o admin" ON public.coupon_redemptions;
CREATE POLICY "Canjes: lectura del organizador o admin"
  ON public.coupon_redemptions FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM coupons c
      JOIN races r ON r.id = c.race_id
      WHERE c.id = coupon_redemptions.coupon_id AND r.organizer_id = auth.uid()
    )
  );

-- Tramos de cancelación: lectura pública (el corredor y el reglamento los
-- muestran); escritura del organizador o admin.
DROP POLICY IF EXISTS "Tramos cancelación: lectura pública" ON public.race_cancellation_tiers;
CREATE POLICY "Tramos cancelación: lectura pública"
  ON public.race_cancellation_tiers FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Tramos cancelación: escribe el organizador o admin" ON public.race_cancellation_tiers;
CREATE POLICY "Tramos cancelación: escribe el organizador o admin"
  ON public.race_cancellation_tiers FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM races r WHERE r.id = race_cancellation_tiers.race_id AND r.organizer_id = auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM races r WHERE r.id = race_cancellation_tiers.race_id AND r.organizer_id = auth.uid())
  );

-- Lección de julio: todo REVOKE de PUBLIC necesita GRANT explícito a los
-- roles que deben conservar acceso (authenticated hereda de PUBLIC).
REVOKE ALL ON public.coupons                 FROM PUBLIC, anon;
REVOKE ALL ON public.coupon_redemptions      FROM PUBLIC, anon;
REVOKE ALL ON public.race_cancellation_tiers FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons                 TO authenticated;
GRANT SELECT                         ON public.coupon_redemptions      TO authenticated;
GRANT SELECT                         ON public.race_cancellation_tiers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.race_cancellation_tiers TO authenticated;

-- ── 8) Entrada en el menú del panel ────────────────────────────────────────
INSERT INTO public.menu_items (menu_type, title, icon, view_name, group_label, display_order, is_visible, requires_auth)
SELECT * FROM (VALUES
  ('organizer', 'Cupones', 'TicketPercent', 'coupons', '🏃 Carreras', 4, true, true),
  ('admin',     'Cupones', 'TicketPercent', 'coupons', '🏃 Carreras', 4, true, true)
) AS m(menu_type, title, icon, view_name, group_label, display_order, is_visible, requires_auth)
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items mi
   WHERE mi.view_name = 'coupons' AND mi.menu_type = m.menu_type
);
