-- Create registration_responses table to store custom form field answers
CREATE TABLE public.registration_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.registration_form_fields(id) ON DELETE CASCADE,
  field_value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(registration_id, field_id)
);

-- Enable Row Level Security
ALTER TABLE public.registration_responses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own responses when registering
CREATE POLICY "Users can insert their own registration responses"
ON public.registration_responses
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.registrations
    WHERE registrations.id = registration_responses.registration_id
    AND registrations.user_id = auth.uid()
  )
);

-- Policy: Users can view their own responses
CREATE POLICY "Users can view their own registration responses"
ON public.registration_responses
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.registrations
    WHERE registrations.id = registration_responses.registration_id
    AND registrations.user_id = auth.uid()
  )
);

-- Policy: Users can update their own responses
CREATE POLICY "Users can update their own registration responses"
ON public.registration_responses
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.registrations
    WHERE registrations.id = registration_responses.registration_id
    AND registrations.user_id = auth.uid()
  )
);

-- Policy: Organizers can view responses for their races
CREATE POLICY "Organizers can view responses for their races"
ON public.registration_responses
FOR SELECT
USING (
  has_role(auth.uid(), 'organizer'::app_role) AND
  EXISTS (
    SELECT 1 FROM public.registrations
    JOIN public.races ON races.id = registrations.race_id
    WHERE registrations.id = registration_responses.registration_id
    AND races.organizer_id = auth.uid()
  )
);

-- Policy: Admins can manage all responses
CREATE POLICY "Admins can manage all registration responses"
ON public.registration_responses
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_registration_responses_updated_at
BEFORE UPDATE ON public.registration_responses
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Create index for better query performance
CREATE INDEX idx_registration_responses_registration_id ON public.registration_responses(registration_id);
CREATE INDEX idx_registration_responses_field_id ON public.registration_responses(field_id);