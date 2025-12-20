-- Create table for moto GPS tracking
CREATE TABLE public.moto_gps_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moto_id uuid NOT NULL REFERENCES public.race_motos(id) ON DELETE CASCADE,
  race_id uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  altitude numeric,
  speed numeric,
  accuracy numeric,
  heading numeric,
  distance_from_start numeric,
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for fast queries
CREATE INDEX idx_moto_gps_tracking_moto ON public.moto_gps_tracking(moto_id, timestamp DESC);
CREATE INDEX idx_moto_gps_tracking_race ON public.moto_gps_tracking(race_id, timestamp DESC);

-- Enable RLS
ALTER TABLE public.moto_gps_tracking ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view moto GPS tracking"
  ON public.moto_gps_tracking FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage all moto GPS tracking"
  ON public.moto_gps_tracking FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Organizers can manage moto GPS for their races"
  ON public.moto_gps_tracking FOR ALL
  USING (
    has_role(auth.uid(), 'organizer'::app_role) AND
    EXISTS (
      SELECT 1 FROM races
      WHERE races.id = moto_gps_tracking.race_id
      AND races.organizer_id = auth.uid()
    )
  );

CREATE POLICY "Moto users can insert their GPS data"
  ON public.moto_gps_tracking FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM race_motos
      WHERE race_motos.id = moto_gps_tracking.moto_id
      AND race_motos.user_id = auth.uid()
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.moto_gps_tracking;