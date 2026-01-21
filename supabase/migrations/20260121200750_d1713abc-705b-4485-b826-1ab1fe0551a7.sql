-- Create payment_intents table for Redsys payments
CREATE TABLE IF NOT EXISTS public.payment_intents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  registration_id UUID REFERENCES public.registrations(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'pending',
  response_code TEXT,
  auth_code TEXT,
  response_message TEXT,
  merchant_params JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_payment_intents_order_number ON public.payment_intents(order_number);
CREATE INDEX idx_payment_intents_registration_id ON public.payment_intents(registration_id);
CREATE INDEX idx_payment_intents_status ON public.payment_intents(status);

-- Enable RLS
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own payment intents
CREATE POLICY "Users can view their own payment intents"
ON public.payment_intents
FOR SELECT
USING (
  registration_id IN (
    SELECT id FROM public.registrations WHERE user_id = auth.uid()
  )
);

-- Policy: Service role can do everything (for webhooks)
CREATE POLICY "Service role full access"
ON public.payment_intents
FOR ALL
USING (true)
WITH CHECK (true);

-- Policy: Allow insert from edge functions (anon key)
CREATE POLICY "Allow insert payment intents"
ON public.payment_intents
FOR INSERT
WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER handle_payment_intents_updated_at
  BEFORE UPDATE ON public.payment_intents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();