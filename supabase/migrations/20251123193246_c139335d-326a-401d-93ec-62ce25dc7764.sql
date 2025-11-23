-- Create race_faqs table for race-specific FAQs
CREATE TABLE public.race_faqs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  race_id UUID NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.race_faqs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for race_faqs
CREATE POLICY "Anyone can view race FAQs"
  ON public.race_faqs
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage all race FAQs"
  ON public.race_faqs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Organizers can manage their race FAQs"
  ON public.race_faqs
  FOR ALL
  USING (
    has_role(auth.uid(), 'organizer'::app_role) 
    AND EXISTS (
      SELECT 1 FROM public.races 
      WHERE races.id = race_faqs.race_id 
      AND races.organizer_id = auth.uid()
    )
  );

-- Create organizer_faqs table for general organizer FAQs
CREATE TABLE public.organizer_faqs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.organizer_faqs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for organizer_faqs
CREATE POLICY "Organizers can view organizer FAQs"
  ON public.organizer_faqs
  FOR SELECT
  USING (has_role(auth.uid(), 'organizer'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage organizer FAQs"
  ON public.organizer_faqs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add triggers for updated_at
CREATE TRIGGER update_race_faqs_updated_at
  BEFORE UPDATE ON public.race_faqs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_organizer_faqs_updated_at
  BEFORE UPDATE ON public.organizer_faqs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Add indexes for performance
CREATE INDEX idx_race_faqs_race_id ON public.race_faqs(race_id);
CREATE INDEX idx_race_faqs_display_order ON public.race_faqs(display_order);
CREATE INDEX idx_organizer_faqs_display_order ON public.organizer_faqs(display_order);