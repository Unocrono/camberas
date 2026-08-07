-- ============================================================
-- EQUIPOS: PAGO EN LOTE (7-ago-2026)
--
-- El capitán paga TODO el lote en un solo cargo Redsys: UN
-- payment_intent cubre N inscripciones. El enganche 1 a 1 existente
-- (payment_intents.registration_id) no se toca; los lotes usan esta
-- tabla de items y dejan registration_id a NULL en el intent.
-- El webhook, al confirmar el cobro, recorre los items: asigna dorsal
-- y marca paid en cada inscripción (el trigger de cupones registra
-- los canjes solo con eso).
--
-- Solo escribe el servidor (service role); ni anon ni authenticated
-- tienen acceso directo.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payment_intent_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id uuid NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
  registration_id   uuid NOT NULL UNIQUE REFERENCES public.registrations(id) ON DELETE CASCADE,
  -- Importe de ESTA inscripción dentro del lote (auditoría del desglose;
  -- la suma de items = amount del intent)
  amount            numeric NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_intent_items_intent
  ON public.payment_intent_items(payment_intent_id);

ALTER TABLE public.payment_intent_items ENABLE ROW LEVEL SECURITY;

-- El capitán VE los items de sus lotes (para el desglose post-pago);
-- escribir solo escribe el servidor.
DROP POLICY IF EXISTS "Items de pago: lectura del capitán del equipo" ON public.payment_intent_items;
CREATE POLICY "Items de pago: lectura del capitán del equipo"
  ON public.payment_intent_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM registrations r
        JOIN teams t ON t.id = r.team_id
       WHERE r.id = payment_intent_items.registration_id
         AND t.captain_user_id = auth.uid()
    )
  );

REVOKE ALL ON public.payment_intent_items FROM PUBLIC, anon;
GRANT SELECT ON public.payment_intent_items TO authenticated;
