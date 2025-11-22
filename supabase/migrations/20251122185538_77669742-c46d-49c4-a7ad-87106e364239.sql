-- Add new fields to races table
ALTER TABLE public.races
ADD COLUMN IF NOT EXISTS official_website_url text,
ADD COLUMN IF NOT EXISTS organizer_email text,
ADD COLUMN IF NOT EXISTS logo_url text,
ADD COLUMN IF NOT EXISTS cover_image_url text;

-- Add new fields to race_distances table
ALTER TABLE public.race_distances
ADD COLUMN IF NOT EXISTS gpx_file_url text,
ADD COLUMN IF NOT EXISTS image_url text;

-- Create registration_form_fields table for customizable form fields
CREATE TABLE IF NOT EXISTS public.registration_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL, -- 'text', 'email', 'phone', 'select', 'textarea', 'checkbox', 'date', 'number'
  field_options jsonb, -- For select/radio options
  is_required boolean NOT NULL DEFAULT false,
  field_order integer NOT NULL DEFAULT 0,
  placeholder text,
  help_text text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on registration_form_fields
ALTER TABLE public.registration_form_fields ENABLE ROW LEVEL SECURITY;

-- RLS policies for registration_form_fields
CREATE POLICY "Anyone can view registration form fields"
  ON public.registration_form_fields
  FOR SELECT
  USING (true);

CREATE POLICY "Organizers can manage their race form fields"
  ON public.registration_form_fields
  FOR ALL
  USING (
    has_role(auth.uid(), 'organizer') 
    AND EXISTS (
      SELECT 1 FROM races 
      WHERE races.id = registration_form_fields.race_id 
      AND races.organizer_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all form fields"
  ON public.registration_form_fields
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER handle_registration_form_fields_updated_at
  BEFORE UPDATE ON public.registration_form_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Add comments
COMMENT ON TABLE public.registration_form_fields IS 'Custom form fields for race registrations configured by organizers';
COMMENT ON COLUMN public.races.official_website_url IS 'Official website URL of the race';
COMMENT ON COLUMN public.races.organizer_email IS 'Contact email for race organizer';
COMMENT ON COLUMN public.races.logo_url IS 'URL to race logo image';
COMMENT ON COLUMN public.races.cover_image_url IS 'URL to race cover/hero image';
COMMENT ON COLUMN public.race_distances.gpx_file_url IS 'URL to GPX file for this distance';
COMMENT ON COLUMN public.race_distances.image_url IS 'URL to image specific to this distance';