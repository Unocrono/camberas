-- Create split_times table for checkpoint tracking
CREATE TABLE public.split_times (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  race_result_id UUID NOT NULL REFERENCES public.race_results(id) ON DELETE CASCADE,
  checkpoint_name TEXT NOT NULL,
  checkpoint_order INTEGER NOT NULL,
  split_time INTERVAL NOT NULL,
  distance_km NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.split_times ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage split times"
  ON public.split_times
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view split times"
  ON public.split_times
  FOR SELECT
  USING (true);

-- Create indexes for better performance
CREATE INDEX idx_split_times_race_result_id ON public.split_times(race_result_id);
CREATE INDEX idx_split_times_checkpoint_order ON public.split_times(checkpoint_order);

-- Create trigger for updated_at
CREATE TRIGGER update_split_times_updated_at
  BEFORE UPDATE ON public.split_times
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create race_checkpoints table to define checkpoints for each race
CREATE TABLE public.race_checkpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  race_id UUID NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  checkpoint_order INTEGER NOT NULL,
  distance_km NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(race_id, checkpoint_order)
);

-- Enable RLS
ALTER TABLE public.race_checkpoints ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage race checkpoints"
  ON public.race_checkpoints
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view race checkpoints"
  ON public.race_checkpoints
  FOR SELECT
  USING (true);

-- Create indexes
CREATE INDEX idx_race_checkpoints_race_id ON public.race_checkpoints(race_id);
CREATE INDEX idx_race_checkpoints_order ON public.race_checkpoints(checkpoint_order);

-- Create trigger for updated_at
CREATE TRIGGER update_race_checkpoints_updated_at
  BEFORE UPDATE ON public.race_checkpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();