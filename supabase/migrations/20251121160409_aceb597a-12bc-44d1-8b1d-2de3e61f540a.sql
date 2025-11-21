-- Create table for GPS tracking positions
CREATE TABLE public.gps_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  race_id UUID NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  latitude NUMERIC(10, 8) NOT NULL,
  longitude NUMERIC(11, 8) NOT NULL,
  altitude NUMERIC(8, 2),
  accuracy NUMERIC(8, 2),
  speed NUMERIC(8, 2),
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  battery_level INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add GPS configuration fields to races table
ALTER TABLE public.races 
ADD COLUMN gps_tracking_enabled BOOLEAN DEFAULT false,
ADD COLUMN gps_update_frequency INTEGER DEFAULT 30;

-- Add index for efficient queries
CREATE INDEX idx_gps_tracking_race_id ON public.gps_tracking(race_id);
CREATE INDEX idx_gps_tracking_registration_id ON public.gps_tracking(registration_id);
CREATE INDEX idx_gps_tracking_timestamp ON public.gps_tracking(timestamp DESC);

-- Enable Row Level Security
ALTER TABLE public.gps_tracking ENABLE ROW LEVEL SECURITY;

-- RLS Policies for gps_tracking
CREATE POLICY "Anyone can view GPS tracking data"
  ON public.gps_tracking
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own GPS data"
  ON public.gps_tracking
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.registrations
      WHERE registrations.id = gps_tracking.registration_id
      AND registrations.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all GPS data"
  ON public.gps_tracking
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for GPS tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.gps_tracking;

-- Add comment
COMMENT ON TABLE public.gps_tracking IS 'Stores real-time GPS positions from runners during races';
COMMENT ON COLUMN public.races.gps_tracking_enabled IS 'Enable GPS tracking for this race';
COMMENT ON COLUMN public.races.gps_update_frequency IS 'GPS update frequency in seconds (e.g., 15, 30, 60)';