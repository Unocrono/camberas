
-- =========================================================
-- SECURITY HARDENING MIGRATION
-- =========================================================

-- ---------- finish_photos: remove public writes/dup reads ----------
DROP POLICY IF EXISTS "public insert" ON public.finish_photos;
DROP POLICY IF EXISTS "allow_update" ON public.finish_photos;
DROP POLICY IF EXISTS "public read" ON public.finish_photos;

-- ---------- gps_positions: no public writes ----------
DROP POLICY IF EXISTS "Allow insert gps_positions" ON public.gps_positions;
DROP POLICY IF EXISTS "Allow select gps_positions" ON public.gps_positions;

-- Public/authenticated may read live position rows (non-PII: lat/lng/speed) for the live map
CREATE POLICY "Public can read gps_positions"
  ON public.gps_positions FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only service_role (edge functions / device webhook) may insert
CREATE POLICY "Service role inserts gps_positions"
  ON public.gps_positions FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ---------- gps_sos_alerts: no public writes ----------
DROP POLICY IF EXISTS "Allow insert gps_sos_alerts" ON public.gps_sos_alerts;

CREATE POLICY "Service role inserts gps_sos_alerts"
  ON public.gps_sos_alerts FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ---------- gps_tokens: no public writes; restrict PII columns ----------
DROP POLICY IF EXISTS "Allow update gps_tokens" ON public.gps_tokens;
DROP POLICY IF EXISTS "Allow select gps_tokens" ON public.gps_tokens;

-- Row visibility remains public for the live map; PostgREST field access is
-- restricted via column-level GRANTs below, so email/phone/token are hidden.
CREATE POLICY "Public can read gps_tokens rows"
  ON public.gps_tokens FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE SELECT ON public.gps_tokens FROM anon, authenticated;
GRANT SELECT (id, event_id, bib_number, participant_name, active, linked_at, created_at)
  ON public.gps_tokens TO anon, authenticated;
GRANT ALL ON public.gps_tokens TO service_role;

-- ---------- registrations: tighten authenticated INSERT ----------
DROP POLICY IF EXISTS "Users can create registrations" ON public.registrations;
CREATE POLICY "Users can create registrations"
  ON public.registrations FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ---------- registration_responses: scope guest inserts to guest registrations ----------
DROP POLICY IF EXISTS "Guests can create registration responses" ON public.registration_responses;
CREATE POLICY "Guests can create registration responses"
  ON public.registration_responses FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.registrations r
      WHERE r.id = registration_responses.registration_id
        AND r.user_id IS NULL
    )
  );

-- ---------- start_list / racetec_athletes / overlay_riders: restrict SELECT to authenticated ----------
DROP POLICY IF EXISTS "anyone_read_start_list" ON public.start_list;
CREATE POLICY "authenticated_read_start_list"
  ON public.start_list FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "anyone_read_racetec_athletes" ON public.racetec_athletes;
CREATE POLICY "authenticated_read_racetec_athletes"
  ON public.racetec_athletes FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "anyone_read_overlay_riders" ON public.overlay_riders;
CREATE POLICY "authenticated_read_overlay_riders"
  ON public.overlay_riders FOR SELECT
  TO authenticated
  USING (true);

-- ---------- Storage: finish-photos bucket writes restricted ----------
DROP POLICY IF EXISTS "finish-photos insert" ON storage.objects;
DROP POLICY IF EXISTS "finish-photos update" ON storage.objects;

CREATE POLICY "finish-photos admin/organizer insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'finish-photos'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'organizer'::public.app_role))
  );

CREATE POLICY "finish-photos admin/organizer update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'finish-photos'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'organizer'::public.app_role))
  )
  WITH CHECK (
    bucket_id = 'finish-photos'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'organizer'::public.app_role))
  );

CREATE POLICY "finish-photos admin/organizer delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'finish-photos'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'organizer'::public.app_role))
  );

-- ---------- Storage: gpx-files bucket writes restricted ----------
DROP POLICY IF EXISTS "allow_all_gpx" ON storage.objects;

CREATE POLICY "gpx-files public read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'gpx-files');

CREATE POLICY "gpx-files admin/organizer insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'gpx-files'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'organizer'::public.app_role))
  );

CREATE POLICY "gpx-files admin/organizer update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'gpx-files'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'organizer'::public.app_role))
  )
  WITH CHECK (
    bucket_id = 'gpx-files'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'organizer'::public.app_role))
  );

CREATE POLICY "gpx-files admin/organizer delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'gpx-files'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role)
         OR public.has_role(auth.uid(), 'organizer'::public.app_role))
  );

-- ---------- SECURITY DEFINER functions: revoke EXECUTE from anon/authenticated ----------
-- Trigger-only functions (executed as table owner via triggers; no need for role EXECUTE)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_conversation_last_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_reading_time() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_create_wave_for_distance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_create_distance_checkpoints() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_seed_registration_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_blog_slug() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_race_slug() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_process_gps_geofence() FROM PUBLIC, anon, authenticated;

-- Internal helpers that shouldn't be RPC-callable
REVOKE EXECUTE ON FUNCTION public.get_user_email(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_registration_fields(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_registration_fields_for_distance(uuid) FROM PUBLIC, anon, authenticated;

-- Heavy compute / admin-only RPCs — keep authenticated (they check has_role internally) but drop anon
REVOKE EXECUTE ON FUNCTION public.get_users_with_emails() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_organizer_requests() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_event_results(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.calculate_race_results(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.calculate_split_times(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.calculate_split_positions(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_split_times(uuid) FROM PUBLIC, anon;
