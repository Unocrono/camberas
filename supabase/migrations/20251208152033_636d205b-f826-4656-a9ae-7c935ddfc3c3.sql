-- Enable pg_net extension for HTTP calls from database
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function to call process-gps-geofence edge function
CREATE OR REPLACE FUNCTION public.trigger_process_gps_geofence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  edge_function_url text;
  service_role_key text;
BEGIN
  -- Build the edge function URL with the race_id parameter
  edge_function_url := 'https://rsahtxjpisnldxnsmupk.supabase.co/functions/v1/process-gps-geofence?race_id=' || NEW.race_id || '&minutes_back=2';
  
  -- Make async HTTP call to the edge function
  -- Using pg_net for non-blocking HTTP requests
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
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
$$;

-- Create trigger on gps_tracking table
DROP TRIGGER IF EXISTS on_gps_tracking_insert ON public.gps_tracking;

CREATE TRIGGER on_gps_tracking_insert
  AFTER INSERT ON public.gps_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_process_gps_geofence();

-- Add comment for documentation
COMMENT ON FUNCTION public.trigger_process_gps_geofence() IS 'Automatically triggers GPS geofence processing when new GPS readings are inserted';