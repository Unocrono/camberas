-- Create race_results table for storing participant timing data
CREATE TABLE public.race_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  finish_time INTERVAL NOT NULL,
  overall_position INTEGER,
  category_position INTEGER,
  status TEXT NOT NULL DEFAULT 'finished' CHECK (status IN ('finished', 'dnf', 'dns', 'dq')),
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(registration_id)
);

-- Create index for faster queries
CREATE INDEX idx_race_results_registration ON public.race_results(registration_id);
CREATE INDEX idx_race_results_status ON public.race_results(status);

-- Enable RLS
ALTER TABLE public.race_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for race_results
CREATE POLICY "Anyone can view race results"
ON public.race_results
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage race results"
ON public.race_results
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Create storage bucket for race photos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('race-photos', 'race-photos', true);

-- Storage policies for race photos
CREATE POLICY "Anyone can view race photos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'race-photos');

CREATE POLICY "Admins can upload race photos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'race-photos' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update race photos"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'race-photos' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete race photos"
ON storage.objects
FOR DELETE
USING (bucket_id = 'race-photos' AND has_role(auth.uid(), 'admin'));

-- Trigger to update updated_at
CREATE TRIGGER update_race_results_updated_at
BEFORE UPDATE ON public.race_results
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();