-- Crear tabla de configuración de contacto
CREATE TABLE IF NOT EXISTS public.contact_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  support_email TEXT NOT NULL DEFAULT 'soporte@camberas.com',
  whatsapp_number TEXT NOT NULL DEFAULT '+34600000000',
  whatsapp_url TEXT NOT NULL DEFAULT 'https://wa.me/34600000000',
  form_enabled BOOLEAN NOT NULL DEFAULT true,
  page_title TEXT NOT NULL DEFAULT 'Contacta con nosotros',
  page_description TEXT NOT NULL DEFAULT '¿Tienes alguna pregunta? Estamos aquí para ayudarte',
  form_title TEXT NOT NULL DEFAULT 'Envíanos un mensaje',
  form_description TEXT NOT NULL DEFAULT 'Completa el formulario y te responderemos por email',
  success_message TEXT NOT NULL DEFAULT 'Te responderemos lo antes posible por email.',
  email_card_visible BOOLEAN NOT NULL DEFAULT true,
  whatsapp_card_visible BOOLEAN NOT NULL DEFAULT true,
  support_chat_card_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Permitir solo un registro de configuración
CREATE UNIQUE INDEX contact_settings_singleton ON public.contact_settings ((1));

-- Insertar configuración por defecto
INSERT INTO public.contact_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Habilitar RLS
ALTER TABLE public.contact_settings ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Anyone can view contact settings"
  ON public.contact_settings
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can update contact settings"
  ON public.contact_settings
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

-- Trigger para updated_at
CREATE TRIGGER update_contact_settings_updated_at
  BEFORE UPDATE ON public.contact_settings
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();