-- Fix overlay_config RLS policies - add WITH CHECK clauses for INSERT/UPDATE

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage all overlay config" ON public.overlay_config;
DROP POLICY IF EXISTS "Organizers can manage their race overlay config" ON public.overlay_config;
DROP POLICY IF EXISTS "Anyone can view overlay config" ON public.overlay_config;

-- Recreate policies with proper WITH CHECK clauses
CREATE POLICY "Anyone can view overlay config" 
ON public.overlay_config 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage all overlay config" 
ON public.overlay_config 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Organizers can manage their race overlay config" 
ON public.overlay_config 
FOR ALL 
USING (
  has_role(auth.uid(), 'organizer'::app_role) 
  AND EXISTS (
    SELECT 1 FROM races 
    WHERE races.id = overlay_config.race_id 
    AND races.organizer_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'organizer'::app_role) 
  AND EXISTS (
    SELECT 1 FROM races 
    WHERE races.id = overlay_config.race_id 
    AND races.organizer_id = auth.uid()
  )
);

-- Enable REPLICA IDENTITY FULL for realtime updates to include all columns
ALTER TABLE public.overlay_config REPLICA IDENTITY FULL;