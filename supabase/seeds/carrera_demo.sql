-- ============================================================
-- CARRERA DEMO + usuarios de prueba (Camberas)
-- ============================================================
-- Idempotente: repetible sin duplicar nada.
-- Credenciales (PUBLICAS a proposito, son de demo):
--   Corredor:    corredordemo@camberas.com    / 1234567
--   Organizador: organizadordemo@camberas.com / 1234567
-- OJO: los pagos de la demo van por la pasarela REAL de Redsys.
--      Trail 2 EUR / Speed 1 EUR / Marcha gratis (para probar ambos flujos).

-- 1) Usuario CORREDOR DEMO
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
  'authenticated', 'corredordemo@camberas.com',
  extensions.crypt('1234567', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}',
  '{"first_name":"Corredor","last_name":"Demo"}', now(), now(), '', '', '', ''
where not exists (select 1 from auth.users where email = 'corredordemo@camberas.com');

insert into auth.identities (id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email = 'corredordemo@camberas.com'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- 2) Usuario ORGANIZADOR DEMO
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
  'authenticated', 'organizadordemo@camberas.com',
  extensions.crypt('1234567', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}',
  '{"first_name":"Organizador","last_name":"Demo"}', now(), now(), '', '', '', ''
where not exists (select 1 from auth.users where email = 'organizadordemo@camberas.com');

insert into auth.identities (id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email = 'organizadordemo@camberas.com'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- 3) Perfiles (por si el trigger handle_new_user no los creo)
insert into public.profiles (id, email, first_name, last_name)
select u.id, u.email, 'Corredor', 'Demo' from auth.users u
where u.email = 'corredordemo@camberas.com'
on conflict (id) do nothing;

insert into public.profiles (id, email, first_name, last_name)
select u.id, u.email, 'Organizador', 'Demo' from auth.users u
where u.email = 'organizadordemo@camberas.com'
on conflict (id) do nothing;

-- 4) Rol de organizador (aprobado)
insert into public.user_roles (user_id, role, status)
select u.id, 'organizer'::app_role, 'approved' from auth.users u
where u.email = 'organizadordemo@camberas.com'
  and not exists (select 1 from public.user_roles r
                  where r.user_id = u.id and r.role = 'organizer'::app_role);

-- 5) La CARRERA DEMO (visible, asignada al organizador demo)
insert into public.races (name, subtitle, slug, description, location, date,
  max_participants, race_type, is_visible, is_featured,
  image_url, cover_image_url, poster_url, organizer_id, organizer_email)
select 'Carrera Demo Camberas', 'Aquí se prueba todo · nada es de verdad',
  'carrera-demo',
  'Carrera de pruebas de Camberas: inscríbete, paga (importes simbólicos), recibe tu dorsal y trastea sin miedo. Los datos de esta carrera se borran periódicamente.',
  'Valle Demo (Cantabria)', '2026-12-12', 300, 'trail', true, false,
  '/demo-principal.svg', '/demo-portada.svg', '/demo-cartel.svg',
  u.id, 'organizadordemo@camberas.com'
from auth.users u
where u.email = 'organizadordemo@camberas.com'
  and not exists (select 1 from public.races where slug = 'carrera-demo');

-- 6) Los 3 recorridos
insert into public.race_distances (race_id, name, distance_km, elevation_gain, price,
  max_participants, bib_start, bib_end, next_bib, is_visible, gps_tracking_enabled, display_order)
select r.id, 'Trail', 25, 900, 2, 100, 1, 100, 1, true, true, 1
from public.races r where r.slug = 'carrera-demo'
  and not exists (select 1 from public.race_distances d where d.race_id = r.id and d.name = 'Trail');

insert into public.race_distances (race_id, name, distance_km, elevation_gain, price,
  max_participants, bib_start, bib_end, next_bib, is_visible, gps_tracking_enabled, display_order)
select r.id, 'Speed', 15, 450, 1, 100, 101, 200, 101, true, true, 2
from public.races r where r.slug = 'carrera-demo'
  and not exists (select 1 from public.race_distances d where d.race_id = r.id and d.name = 'Speed');

insert into public.race_distances (race_id, name, distance_km, elevation_gain, price,
  max_participants, bib_start, bib_end, next_bib, is_visible, gps_tracking_enabled, display_order)
select r.id, 'Marcha', 15, 450, 0, 100, 201, 300, 201, true, true, 3
from public.races r where r.slug = 'carrera-demo'
  and not exists (select 1 from public.race_distances d where d.race_id = r.id and d.name = 'Marcha');
