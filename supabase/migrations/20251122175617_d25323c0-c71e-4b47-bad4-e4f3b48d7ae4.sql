-- Create table for edge function control flags
CREATE TABLE public.edge_function_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.edge_function_flags ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view function flags
CREATE POLICY "Anyone can view function flags"
ON public.edge_function_flags
FOR SELECT
USING (true);

-- Policy: Only admins can insert function flags
CREATE POLICY "Admins can insert function flags"
ON public.edge_function_flags
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Policy: Only admins can update function flags
CREATE POLICY "Admins can update function flags"
ON public.edge_function_flags
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Policy: Only admins can delete function flags
CREATE POLICY "Admins can delete function flags"
ON public.edge_function_flags
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_edge_function_flags_updated_at
BEFORE UPDATE ON public.edge_function_flags
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Insert default values for existing edge functions
INSERT INTO public.edge_function_flags (function_name, is_enabled, description) VALUES
  ('get-mapbox-token', true, 'Obtiene el token público de Mapbox'),
  ('generate-training-plan', true, 'Genera planes de entrenamiento personalizados con IA'),
  ('support-chat', true, 'Chatbot de soporte para trail running'),
  ('send-registration-confirmation', true, 'Envía emails de confirmación de registro'),
  ('send-payment-confirmation', true, 'Envía emails de confirmación de pago'),
  ('send-cancellation-confirmation', true, 'Envía emails de confirmación de cancelación'),
  ('send-race-reminders', true, 'Envía recordatorios de carreras próximas');