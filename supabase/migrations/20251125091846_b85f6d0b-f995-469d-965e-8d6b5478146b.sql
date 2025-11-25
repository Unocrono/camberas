-- Create race_regulations table
CREATE TABLE public.race_regulations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  race_id UUID NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  published BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create race_regulation_sections table
CREATE TABLE public.race_regulation_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  regulation_id UUID NOT NULL REFERENCES public.race_regulations(id) ON DELETE CASCADE,
  section_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  section_order INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.race_regulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.race_regulation_sections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for race_regulations
CREATE POLICY "Anyone can view published regulations"
ON public.race_regulations
FOR SELECT
USING (published = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Organizers can manage their race regulations"
ON public.race_regulations
FOR ALL
USING (
  has_role(auth.uid(), 'organizer'::app_role) 
  AND EXISTS (
    SELECT 1 FROM races 
    WHERE races.id = race_regulations.race_id 
    AND races.organizer_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all regulations"
ON public.race_regulations
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for race_regulation_sections
CREATE POLICY "Anyone can view published regulation sections"
ON public.race_regulation_sections
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM race_regulations 
    WHERE race_regulations.id = race_regulation_sections.regulation_id 
    AND race_regulations.published = true
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Organizers can manage their race regulation sections"
ON public.race_regulation_sections
FOR ALL
USING (
  has_role(auth.uid(), 'organizer'::app_role) 
  AND EXISTS (
    SELECT 1 FROM race_regulations
    JOIN races ON races.id = race_regulations.race_id
    WHERE race_regulations.id = race_regulation_sections.regulation_id 
    AND races.organizer_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all regulation sections"
ON public.race_regulation_sections
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at on race_regulations
CREATE TRIGGER update_race_regulations_updated_at
BEFORE UPDATE ON public.race_regulations
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Create trigger for updated_at on race_regulation_sections
CREATE TRIGGER update_race_regulation_sections_updated_at
BEFORE UPDATE ON public.race_regulation_sections
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();