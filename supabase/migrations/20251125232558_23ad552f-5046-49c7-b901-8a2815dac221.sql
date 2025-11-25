-- Create bib_designs table for storing race bib templates
CREATE TABLE public.bib_designs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  race_id UUID NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Diseño sin nombre',
  canvas_json JSONB NOT NULL DEFAULT '{}',
  width_cm NUMERIC NOT NULL DEFAULT 20,
  height_cm NUMERIC NOT NULL DEFAULT 15,
  background_color TEXT DEFAULT '#FFFFFF',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bib_designs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view bib designs"
  ON public.bib_designs FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage all bib designs"
  ON public.bib_designs FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Organizers can manage their race bib designs"
  ON public.bib_designs FOR ALL
  USING (
    has_role(auth.uid(), 'organizer'::app_role) AND
    EXISTS (
      SELECT 1 FROM races
      WHERE races.id = bib_designs.race_id
      AND races.organizer_id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_bib_designs_updated_at
  BEFORE UPDATE ON public.bib_designs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();