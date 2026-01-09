-- Tabla de suscriptores
CREATE TABLE public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  first_name TEXT,
  segments TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  confirmation_token UUID DEFAULT gen_random_uuid(),
  confirmed_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla de campañas
CREATE TABLE public.newsletter_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  preview_text TEXT,
  target_segments TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabla de envíos individuales (tracking)
CREATE TABLE public.newsletter_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.newsletter_campaigns(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL REFERENCES public.newsletter_subscribers(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced BOOLEAN DEFAULT false,
  UNIQUE(campaign_id, subscriber_id)
);

-- Habilitar RLS
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_sends ENABLE ROW LEVEL SECURITY;

-- Políticas para newsletter_subscribers
CREATE POLICY "Admins and editors can manage all subscribers"
ON public.newsletter_subscribers FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'editor'));

CREATE POLICY "Public can insert subscribers"
ON public.newsletter_subscribers FOR INSERT
WITH CHECK (true);

CREATE POLICY "Subscribers can update own record via token"
ON public.newsletter_subscribers FOR UPDATE
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Políticas para newsletter_campaigns
CREATE POLICY "Admins and editors can manage campaigns"
ON public.newsletter_campaigns FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'editor'));

-- Políticas para newsletter_sends
CREATE POLICY "Admins and editors can manage sends"
ON public.newsletter_sends FOR ALL
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'editor'));

-- Trigger para updated_at usando handle_updated_at que ya existe
CREATE TRIGGER update_newsletter_subscribers_updated_at
BEFORE UPDATE ON public.newsletter_subscribers
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_newsletter_campaigns_updated_at
BEFORE UPDATE ON public.newsletter_campaigns
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Índices
CREATE INDEX idx_newsletter_subscribers_email ON public.newsletter_subscribers(email);
CREATE INDEX idx_newsletter_subscribers_status ON public.newsletter_subscribers(status);
CREATE INDEX idx_newsletter_subscribers_segments ON public.newsletter_subscribers USING GIN(segments);
CREATE INDEX idx_newsletter_campaigns_status ON public.newsletter_campaigns(status);
CREATE INDEX idx_newsletter_sends_campaign ON public.newsletter_sends(campaign_id);