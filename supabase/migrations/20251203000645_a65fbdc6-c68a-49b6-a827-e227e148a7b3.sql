-- Add policy for timers to delete their own readings
CREATE POLICY "Timers can delete their own readings" 
ON public.timing_readings 
FOR DELETE 
USING (
  has_role(auth.uid(), 'timer'::app_role) 
  AND is_timer_for_race(auth.uid(), race_id)
  AND operator_user_id = auth.uid()
);

-- Add policy for timers to update their own readings
CREATE POLICY "Timers can update their own readings" 
ON public.timing_readings 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'timer'::app_role) 
  AND is_timer_for_race(auth.uid(), race_id)
  AND operator_user_id = auth.uid()
);