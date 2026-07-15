
-- 1) Enable RLS on unprotected tables and add restrictive policies
ALTER TABLE public.gps_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_sos_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moto_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moto_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finish_photos ENABLE ROW LEVEL SECURITY;

-- gps_devices: only admins
DROP POLICY IF EXISTS "Admins manage gps_devices" ON public.gps_devices;
CREATE POLICY "Admins manage gps_devices" ON public.gps_devices
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- gps_positions: only admins can read; writes only via service role (bypasses RLS)
DROP POLICY IF EXISTS "Admins read gps_positions" ON public.gps_positions;
CREATE POLICY "Admins read gps_positions" ON public.gps_positions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

-- gps_sos_alerts: admins + organizers of the race can read; no client writes
DROP POLICY IF EXISTS "Admins read sos" ON public.gps_sos_alerts;
CREATE POLICY "Admins read sos" ON public.gps_sos_alerts
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

-- gps_tokens: only admins
DROP POLICY IF EXISTS "Admins manage gps_tokens" ON public.gps_tokens;
CREATE POLICY "Admins manage gps_tokens" ON public.gps_tokens
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- moto_positions: admins read only
DROP POLICY IF EXISTS "Admins read moto_positions" ON public.moto_positions;
CREATE POLICY "Admins read moto_positions" ON public.moto_positions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

-- moto_state: admins manage
DROP POLICY IF EXISTS "Admins manage moto_state" ON public.moto_state;
CREATE POLICY "Admins manage moto_state" ON public.moto_state
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- finish_photos: everyone can view, but only admins/organizers can write
DROP POLICY IF EXISTS "Anyone can view finish_photos" ON public.finish_photos;
CREATE POLICY "Anyone can view finish_photos" ON public.finish_photos
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins/organizers manage finish_photos" ON public.finish_photos;
CREATE POLICY "Admins/organizers manage finish_photos" ON public.finish_photos
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'organizer'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'organizer'::app_role));

-- 2) Overlay + timing + racetec tables: remove permissive "true" write policies
--    Keep SELECT public, restrict writes to admin/organizer
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'overlay_control','overlay_stages','overlay_riders','overlay_teams','overlays_results',
    'microgate_times','race_leaderboard','start_list','moto_race_config',
    'racetec_results','racetec_leaderboard','racetec_categories','racetec_athletes','racetec_events'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','anon all',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','anon read',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','anon write',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','allow_all',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','allow_delete',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','public read',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','public write',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','public insert',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','public update',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','public read athletes',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','public read categories',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','public read leaderboard',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','public read results',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true)','anyone_read_'||t,t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (has_role(auth.uid(),%L) OR has_role(auth.uid(),%L)) WITH CHECK (has_role(auth.uid(),%L) OR has_role(auth.uid(),%L))','admin_org_manage_'||t,t,'admin','organizer','admin','organizer');
  END LOOP;
END $$;

-- 3) overlay_config: restrict writes to admin/organizer only
DROP POLICY IF EXISTS "Authenticated users can insert overlay config" ON public.overlay_config;
DROP POLICY IF EXISTS "Authenticated users can update overlay config" ON public.overlay_config;
CREATE POLICY "Admins/organizers insert overlay config" ON public.overlay_config
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'organizer'::app_role));
CREATE POLICY "Admins/organizers update overlay config" ON public.overlay_config
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'organizer'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'organizer'::app_role));

-- 4) payment_intents: replace permissive true policy
DROP POLICY IF EXISTS "Service role full access" ON public.payment_intents;
DROP POLICY IF EXISTS "Allow insert payment intents" ON public.payment_intents;
CREATE POLICY "Admins manage payment intents" ON public.payment_intents
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));
-- service_role bypasses RLS automatically; no policy needed.

-- 5) registrations: remove public exposure of PII
DROP POLICY IF EXISTS "Anyone can view confirmed registrations" ON public.registrations;

-- 6) profiles: remove overly-broad organizer→timer visibility
DROP POLICY IF EXISTS "Organizers can view timer user profiles" ON public.profiles;

-- 7) newsletter_subscribers: restrict management to admins only
DROP POLICY IF EXISTS "Admins and editors can manage all subscribers" ON public.newsletter_subscribers;
CREATE POLICY "Admins manage all subscribers" ON public.newsletter_subscribers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- 8) Fix trigger_process_gps_geofence: use format() and validation
CREATE OR REPLACE FUNCTION public.trigger_process_gps_geofence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  edge_function_url text;
BEGIN
  IF NEW.race_id IS NULL THEN
    RETURN NEW;
  END IF;
  edge_function_url := format(
    'https://rsahtxjpisnldxnsmupk.supabase.co/functions/v1/process-gps-geofence?race_id=%s&minutes_back=2',
    NEW.race_id
  );
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzYWh0eGpwaXNubGR4bnNtdXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2Mjg5MDAsImV4cCI6MjA3OTIwNDkwMH0.MwUTZs3BxPMsy0YtEgM92o4U3xw2SrMmpZ-GFNC03dE'
    ),
    body := jsonb_build_object(
      'race_id', NEW.race_id,
      'registration_id', NEW.registration_id,
      'gps_id', NEW.id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to trigger GPS geofence processing: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

-- 9) Fix mutable search_path in calculate_split_times
ALTER FUNCTION public.calculate_split_times(uuid) SET search_path TO 'public';

-- 10) Revoke public execute on SECURITY DEFINER functions that shouldn't be callable via API
--     Keep has_role/get_current_user_email/get_user_email/get_organizer_status/is_timer_for_race/
--     user_has_gps_registration*/user_has_moto_assignment*/get_registration_gender/get_race_category
--     usable by RLS (these are called from policies; SECURITY DEFINER runs regardless of EXECUTE grant
--     during policy evaluation, but we revoke anon/authenticated EXECUTE to close direct RPC access).
DO $$
DECLARE fname text;
BEGIN
  FOREACH fname IN ARRAY ARRAY[
    'get_users_with_emails()',
    'get_organizer_requests()',
    'process_event_results(uuid)',
    'calculate_race_results(uuid)',
    'calculate_split_times(uuid)',
    'calculate_split_positions(uuid)',
    'generate_split_times(uuid)',
    'get_live_gps_positions(uuid,uuid)',
    'seed_default_registration_fields(uuid)',
    'seed_default_registration_fields_for_distance(uuid)',
    'get_user_email(uuid)'
  ] LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon, authenticated, PUBLIC', fname);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;
