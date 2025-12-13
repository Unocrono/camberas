-- Create trigger to send GPS points to the GPS geofence processor
DROP TRIGGER IF EXISTS trigger_process_gps_geofence ON public.gps_tracking;
CREATE TRIGGER trigger_process_gps_geofence
AFTER INSERT ON public.gps_tracking
FOR EACH ROW
EXECUTE FUNCTION public.trigger_process_gps_geofence();