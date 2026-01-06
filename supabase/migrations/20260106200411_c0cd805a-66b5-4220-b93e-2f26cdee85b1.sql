-- 1. AÑADIR NUEVOS CAMPOS (16 campos) en registrations
ALTER TABLE public.registrations
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS last_name text,
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS dni_passport text,
ADD COLUMN IF NOT EXISTS birth_date date,
ADD COLUMN IF NOT EXISTS gender text,
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS club text,
ADD COLUMN IF NOT EXISTS team text,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS province text,
ADD COLUMN IF NOT EXISTS autonomous_community text,
ADD COLUMN IF NOT EXISTS country text,
ADD COLUMN IF NOT EXISTS tshirt_size text;

-- 2. MIGRAR DATOS DESDE CAMPOS guest_* (para inscripciones de invitados)
UPDATE public.registrations
SET 
  first_name = COALESCE(first_name, guest_first_name),
  last_name = COALESCE(last_name, guest_last_name),
  email = COALESCE(email, guest_email),
  phone = COALESCE(phone, guest_phone),
  dni_passport = COALESCE(dni_passport, guest_dni_passport),
  birth_date = COALESCE(birth_date, guest_birth_date)
WHERE guest_first_name IS NOT NULL 
   OR guest_last_name IS NOT NULL 
   OR guest_email IS NOT NULL;

-- 3. MIGRAR DATOS DESDE profiles (para usuarios registrados)
UPDATE public.registrations r
SET 
  first_name = COALESCE(r.first_name, p.first_name),
  last_name = COALESCE(r.last_name, p.last_name),
  phone = COALESCE(r.phone, p.phone),
  dni_passport = COALESCE(r.dni_passport, p.dni_passport),
  birth_date = COALESCE(r.birth_date, p.birth_date),
  gender = COALESCE(r.gender, p.gender),
  club = COALESCE(r.club, p.club),
  team = COALESCE(r.team, p.team),
  address = COALESCE(r.address, p.address),
  city = COALESCE(r.city, p.city),
  province = COALESCE(r.province, p.province),
  autonomous_community = COALESCE(r.autonomous_community, p.autonomous_community),
  country = COALESCE(r.country, p.country)
FROM public.profiles p
WHERE r.user_id = p.id
  AND r.user_id IS NOT NULL;

-- 4. MIGRAR EMAIL DESDE auth.users (para usuarios registrados)
UPDATE public.registrations r
SET email = COALESCE(r.email, get_user_email(r.user_id))
WHERE r.user_id IS NOT NULL AND r.email IS NULL;

-- 5. MIGRAR DATOS DESDE registration_responses
-- 5a. Gender desde registration_responses
UPDATE public.registrations r
SET gender = COALESCE(r.gender, rr.field_value)
FROM public.registration_responses rr
JOIN public.registration_form_fields rff ON rff.id = rr.field_id
WHERE rr.registration_id = r.id
  AND rff.profile_field = 'gender'
  AND r.gender IS NULL;

-- 5b. Tshirt size desde registration_responses
UPDATE public.registrations r
SET tshirt_size = COALESCE(r.tshirt_size, rr.field_value)
FROM public.registration_responses rr
JOIN public.registration_form_fields rff ON rff.id = rr.field_id
WHERE rr.registration_id = r.id
  AND rff.field_name = 'tshirt_size'
  AND r.tshirt_size IS NULL;

-- 5c. Club desde registration_responses
UPDATE public.registrations r
SET club = COALESCE(r.club, rr.field_value)
FROM public.registration_responses rr
JOIN public.registration_form_fields rff ON rff.id = rr.field_id
WHERE rr.registration_id = r.id
  AND (rff.profile_field = 'club' OR rff.field_name = 'club')
  AND r.club IS NULL;

-- 5d. Team desde registration_responses
UPDATE public.registrations r
SET team = COALESCE(r.team, rr.field_value)
FROM public.registration_responses rr
JOIN public.registration_form_fields rff ON rff.id = rr.field_id
WHERE rr.registration_id = r.id
  AND (rff.profile_field = 'team' OR rff.field_name = 'team')
  AND r.team IS NULL;

-- 5e. Address desde registration_responses
UPDATE public.registrations r
SET address = COALESCE(r.address, rr.field_value)
FROM public.registration_responses rr
JOIN public.registration_form_fields rff ON rff.id = rr.field_id
WHERE rr.registration_id = r.id
  AND (rff.profile_field = 'address' OR rff.field_name = 'address')
  AND r.address IS NULL;

-- 5f. City desde registration_responses
UPDATE public.registrations r
SET city = COALESCE(r.city, rr.field_value)
FROM public.registration_responses rr
JOIN public.registration_form_fields rff ON rff.id = rr.field_id
WHERE rr.registration_id = r.id
  AND (rff.profile_field = 'city' OR rff.field_name = 'city')
  AND r.city IS NULL;

-- 5g. Province desde registration_responses
UPDATE public.registrations r
SET province = COALESCE(r.province, rr.field_value)
FROM public.registration_responses rr
JOIN public.registration_form_fields rff ON rff.id = rr.field_id
WHERE rr.registration_id = r.id
  AND (rff.profile_field = 'province' OR rff.field_name = 'province')
  AND r.province IS NULL;

-- 5h. Autonomous community desde registration_responses
UPDATE public.registrations r
SET autonomous_community = COALESCE(r.autonomous_community, rr.field_value)
FROM public.registration_responses rr
JOIN public.registration_form_fields rff ON rff.id = rr.field_id
WHERE rr.registration_id = r.id
  AND (rff.profile_field = 'autonomous_community' OR rff.field_name = 'autonomous_community')
  AND r.autonomous_community IS NULL;

-- 5i. Country desde registration_responses
UPDATE public.registrations r
SET country = COALESCE(r.country, rr.field_value)
FROM public.registration_responses rr
JOIN public.registration_form_fields rff ON rff.id = rr.field_id
WHERE rr.registration_id = r.id
  AND (rff.profile_field = 'country' OR rff.field_name = 'country')
  AND r.country IS NULL;

-- 6. CALCULAR CATEGORÍAS para registros que no la tienen
UPDATE public.registrations r
SET category = get_race_category(r.race_id, r.birth_date, r.gender)
WHERE r.category IS NULL 
  AND r.birth_date IS NOT NULL 
  AND r.gender IS NOT NULL;

-- 7. CREAR ÍNDICES para optimizar queries frecuentes
CREATE INDEX IF NOT EXISTS idx_registrations_email ON public.registrations(email);
CREATE INDEX IF NOT EXISTS idx_registrations_gender ON public.registrations(gender);
CREATE INDEX IF NOT EXISTS idx_registrations_category ON public.registrations(category);
CREATE INDEX IF NOT EXISTS idx_registrations_tshirt_size ON public.registrations(tshirt_size);
CREATE INDEX IF NOT EXISTS idx_registrations_club ON public.registrations(club);