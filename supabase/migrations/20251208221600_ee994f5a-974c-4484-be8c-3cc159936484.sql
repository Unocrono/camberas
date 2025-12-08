-- Create trigger to process GPS geofence on new GPS readings
CREATE OR REPLACE TRIGGER gps_tracking_geofence_trigger
  AFTER INSERT ON public.gps_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_process_gps_geofence();