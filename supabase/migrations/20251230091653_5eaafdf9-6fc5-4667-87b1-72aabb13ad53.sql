-- Add registration window fields to race_distances
ALTER TABLE public.race_distances
ADD COLUMN registration_opens timestamptz,
ADD COLUMN registration_closes timestamptz;

-- Create price ranges table
CREATE TABLE public.race_distance_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_distance_id uuid NOT NULL REFERENCES public.race_distances(id) ON DELETE CASCADE,
  start_datetime timestamptz NOT NULL,
  end_datetime timestamptz NOT NULL,
  price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.race_distance_prices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view price ranges"
ON public.race_distance_prices FOR SELECT
USING (true);

CREATE POLICY "Admins can manage all price ranges"
ON public.race_distance_prices FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Organizers can manage their race price ranges"
ON public.race_distance_prices FOR ALL
USING (
  has_role(auth.uid(), 'organizer'::app_role) AND
  EXISTS (
    SELECT 1 FROM race_distances rd
    JOIN races r ON r.id = rd.race_id
    WHERE rd.id = race_distance_prices.race_distance_id
    AND r.organizer_id = auth.uid()
  )
);

-- Index for efficient lookups
CREATE INDEX idx_race_distance_prices_distance_id ON public.race_distance_prices(race_distance_id);
CREATE INDEX idx_race_distance_prices_dates ON public.race_distance_prices(start_datetime, end_datetime);