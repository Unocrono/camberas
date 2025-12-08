
-- Habilitar extensión pg_net para llamadas HTTP asíncronas (si no está habilitada)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Actualizar función para usar anon key directamente (no requiere service_role)
CREATE OR REPLACE FUNCTION public.trigger_process_gps_geofence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  edge_function_url text;
BEGIN
  -- Build the edge function URL with the race_id parameter
  -- Using minutes_back=2 to only process recent GPS points
  edge_function_url := 'https://rsahtxjpisnldxnsmupk.supabase.co/functions/v1/process-gps-geofence?race_id=' || NEW.race_id || '&minutes_back=2';
  
  -- Make async HTTP call to the edge function using anon key
  -- The function has verify_jwt = false so anon key is sufficient
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWh0eGpwaXNubGR4bnNtdXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2Mjg5MDAsImV4cCI6MjA3OTIwNDkwMH0.MwUTZs3BxPMsy0YtEgM92o4U3xw2SrMmpZ-GFNC03dE'
    ),
    body := jsonb_build_object(
      'race_id', NEW.race_id,
      'registration_id', NEW.registration_id,
      'gps_id', NEW.id
    )
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the INSERT
    RAISE WARNING 'Failed to trigger GPS geofence processing: %', SQLERRM;
    RETURN NEW;
END;
$function$;

-- Crear trigger para ejecutar automáticamente cuando llega un nuevo punto GPS
DROP TRIGGER IF EXISTS on_gps_tracking_insert ON gps_tracking;

CREATE TRIGGER on_gps_tracking_insert
  AFTER INSERT ON gps_tracking
  FOR EACH ROW
  EXECUTE FUNCTION trigger_process_gps_geofence();
