-- Create roadbooks table (rutómetros)
CREATE TABLE public.roadbooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  race_id UUID NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  start_time TIME,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create roadbook_items table (ítems del rutómetro)
CREATE TABLE public.roadbook_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  roadbook_id UUID NOT NULL REFERENCES public.roadbooks(id) ON DELETE CASCADE,
  item_order INTEGER NOT NULL DEFAULT 0,
  item_type TEXT NOT NULL DEFAULT 'checkpoint',
  icon_url TEXT,
  altitude NUMERIC,
  description TEXT NOT NULL,
  via TEXT,
  km_total NUMERIC NOT NULL,
  km_remaining NUMERIC,
  km_partial NUMERIC,
  latitude NUMERIC,
  longitude NUMERIC,
  photo_16_9_url TEXT,
  photo_9_16_url TEXT,
  is_highlighted BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create roadbook_paces table (ritmos configurables)
CREATE TABLE public.roadbook_paces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  roadbook_id UUID NOT NULL REFERENCES public.roadbooks(id) ON DELETE CASCADE,
  pace_name TEXT NOT NULL,
  pace_minutes_per_km NUMERIC NOT NULL,
  pace_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create roadbook_schedules table (horarios calculados)
CREATE TABLE public.roadbook_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  roadbook_item_id UUID NOT NULL REFERENCES public.roadbook_items(id) ON DELETE CASCADE,
  roadbook_pace_id UUID NOT NULL REFERENCES public.roadbook_paces(id) ON DELETE CASCADE,
  estimated_time INTERVAL NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(roadbook_item_id, roadbook_pace_id)
);

-- Enable RLS
ALTER TABLE public.roadbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadbook_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadbook_paces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadbook_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for roadbooks
CREATE POLICY "Anyone can view roadbooks"
  ON public.roadbooks FOR SELECT
  USING (true);

CREATE POLICY "Organizers can create roadbooks for their races"
  ON public.roadbooks FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'organizer'::app_role) AND
    EXISTS (
      SELECT 1 FROM public.races
      WHERE races.id = roadbooks.race_id
      AND races.organizer_id = auth.uid()
    )
  );

CREATE POLICY "Organizers can update their race roadbooks"
  ON public.roadbooks FOR UPDATE
  USING (
    has_role(auth.uid(), 'organizer'::app_role) AND
    EXISTS (
      SELECT 1 FROM public.races
      WHERE races.id = roadbooks.race_id
      AND races.organizer_id = auth.uid()
    )
  );

CREATE POLICY "Organizers can delete their race roadbooks"
  ON public.roadbooks FOR DELETE
  USING (
    has_role(auth.uid(), 'organizer'::app_role) AND
    EXISTS (
      SELECT 1 FROM public.races
      WHERE races.id = roadbooks.race_id
      AND races.organizer_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all roadbooks"
  ON public.roadbooks FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for roadbook_items
CREATE POLICY "Anyone can view roadbook items"
  ON public.roadbook_items FOR SELECT
  USING (true);

CREATE POLICY "Organizers can manage items for their roadbooks"
  ON public.roadbook_items FOR ALL
  USING (
    has_role(auth.uid(), 'organizer'::app_role) AND
    EXISTS (
      SELECT 1 FROM public.roadbooks
      JOIN public.races ON races.id = roadbooks.race_id
      WHERE roadbooks.id = roadbook_items.roadbook_id
      AND races.organizer_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all roadbook items"
  ON public.roadbook_items FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for roadbook_paces
CREATE POLICY "Anyone can view roadbook paces"
  ON public.roadbook_paces FOR SELECT
  USING (true);

CREATE POLICY "Organizers can manage paces for their roadbooks"
  ON public.roadbook_paces FOR ALL
  USING (
    has_role(auth.uid(), 'organizer'::app_role) AND
    EXISTS (
      SELECT 1 FROM public.roadbooks
      JOIN public.races ON races.id = roadbooks.race_id
      WHERE roadbooks.id = roadbook_paces.roadbook_id
      AND races.organizer_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all roadbook paces"
  ON public.roadbook_paces FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for roadbook_schedules
CREATE POLICY "Anyone can view roadbook schedules"
  ON public.roadbook_schedules FOR SELECT
  USING (true);

CREATE POLICY "Organizers can manage schedules for their roadbooks"
  ON public.roadbook_schedules FOR ALL
  USING (
    has_role(auth.uid(), 'organizer'::app_role) AND
    EXISTS (
      SELECT 1 FROM public.roadbook_items
      JOIN public.roadbooks ON roadbooks.id = roadbook_items.roadbook_id
      JOIN public.races ON races.id = roadbooks.race_id
      WHERE roadbook_items.id = roadbook_schedules.roadbook_item_id
      AND races.organizer_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all roadbook schedules"
  ON public.roadbook_schedules FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for better performance
CREATE INDEX idx_roadbooks_race_id ON public.roadbooks(race_id);
CREATE INDEX idx_roadbook_items_roadbook_id ON public.roadbook_items(roadbook_id);
CREATE INDEX idx_roadbook_items_order ON public.roadbook_items(roadbook_id, item_order);
CREATE INDEX idx_roadbook_paces_roadbook_id ON public.roadbook_paces(roadbook_id);
CREATE INDEX idx_roadbook_schedules_item_id ON public.roadbook_schedules(roadbook_item_id);
CREATE INDEX idx_roadbook_schedules_pace_id ON public.roadbook_schedules(roadbook_pace_id);

-- Create triggers for updated_at
CREATE TRIGGER update_roadbooks_updated_at
  BEFORE UPDATE ON public.roadbooks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_roadbook_items_updated_at
  BEFORE UPDATE ON public.roadbook_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_roadbook_paces_updated_at
  BEFORE UPDATE ON public.roadbook_paces
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();