-- =============================================================================
-- SNAPSHOT DESNORMALIZADO DE CORREDOR EN INSCRIPCIONES
-- =============================================================================
-- Objetivo: congelar los datos del corredor (perfil + auth) en el momento
-- exacto de la inscripción, independientemente de cambios posteriores
-- en su perfil.
--
-- Estado previo: los campos first_name, last_name, email, phone, dni_passport,
-- birth_date, gender, gender_id, club, team, address, city, province,
-- autonomous_community, country, tshirt_size ya existen en registrations
-- (migración 20260106200411) pero NO hay trigger que los rellene
-- automáticamente. Cada nueva inscripción llega con esos campos a NULL
-- a menos que el código del cliente los envíe explícitamente.
--
-- Esta migración añade los campos faltantes, crea el trigger automático,
-- y hace backfill de los datos históricos.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. NUEVOS CAMPOS EN registrations
-- -----------------------------------------------------------------------------

-- Campos de contacto de emergencia (obligatorio para trail/MTB por seguridad)
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
  ADD COLUMN IF NOT EXISTS emergency_phone   TEXT;

-- Auditoría: cuándo se tomó el snapshot
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS snapshot_taken_at TIMESTAMPTZ;


-- -----------------------------------------------------------------------------
-- 2. NUEVOS CAMPOS EN profiles (si no existen)
--    El trigger los leerá desde aquí para copiarlos al snapshot
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
  ADD COLUMN IF NOT EXISTS emergency_phone   TEXT;


-- -----------------------------------------------------------------------------
-- 3. FUNCIÓN DEL TRIGGER
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fill_registration_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_email   TEXT;
BEGIN
  -- -----------------------------------------------------------------
  -- Caso A: inscripción de usuario autenticado (user_id IS NOT NULL)
  -- Completar campos NULL con datos del perfil actual
  -- -----------------------------------------------------------------
  IF NEW.user_id IS NOT NULL THEN

    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = NEW.user_id;

    -- Email: buscar en auth.users como fuente autoritativa
    SELECT au.email INTO v_email
    FROM auth.users au
    WHERE au.id = NEW.user_id;

    -- COALESCE: solo rellenar si el campo viene NULL en el INSERT.
    -- Si el formulario ya envió un valor explícito, se respeta.
    NEW.first_name           := COALESCE(NEW.first_name,           v_profile.first_name);
    NEW.last_name            := COALESCE(NEW.last_name,            v_profile.last_name);
    NEW.email                := COALESCE(NEW.email,                v_profile.email, v_email);
    NEW.phone                := COALESCE(NEW.phone,                v_profile.phone);
    NEW.dni_passport         := COALESCE(NEW.dni_passport,         v_profile.dni_passport);
    NEW.birth_date           := COALESCE(NEW.birth_date,           v_profile.birth_date);
    NEW.gender               := COALESCE(NEW.gender,               v_profile.gender);
    NEW.gender_id            := COALESCE(NEW.gender_id,            v_profile.gender_id);
    NEW.club                 := COALESCE(NEW.club,                 v_profile.club);
    NEW.team                 := COALESCE(NEW.team,                 v_profile.team);
    NEW.address              := COALESCE(NEW.address,              v_profile.address);
    NEW.city                 := COALESCE(NEW.city,                 v_profile.city);
    NEW.province             := COALESCE(NEW.province,             v_profile.province);
    NEW.autonomous_community := COALESCE(NEW.autonomous_community, v_profile.autonomous_community);
    NEW.country              := COALESCE(NEW.country,              v_profile.country);
    NEW.emergency_contact    := COALESCE(NEW.emergency_contact,    v_profile.emergency_contact);
    NEW.emergency_phone      := COALESCE(NEW.emergency_phone,      v_profile.emergency_phone);

  END IF;

  -- -----------------------------------------------------------------
  -- Caso B: inscripción de invitado (user_id IS NULL)
  -- Los datos ya vienen en el INSERT desde el formulario.
  -- No hay perfil que consultar; solo normalizamos gender.
  -- -----------------------------------------------------------------

  -- Resolver gender_id desde texto si solo llega gender (ej: "Masculino")
  IF NEW.gender_id IS NULL AND NEW.gender IS NOT NULL THEN
    NEW.gender_id := public.get_gender_id_from_text(NEW.gender);
  END IF;

  -- Resolver gender desde gender_id si solo llega el id numérico
  IF NEW.gender IS NULL AND NEW.gender_id IS NOT NULL THEN
    NEW.gender := CASE NEW.gender_id
      WHEN 1 THEN 'Masculino'
      WHEN 2 THEN 'Femenino'
      WHEN 3 THEN 'Mixto'
      ELSE NULL
    END;
  END IF;

  -- Marcar el instante exacto del snapshot
  NEW.snapshot_taken_at := now();

  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 4. TRIGGER — solo BEFORE INSERT, nunca en UPDATE
--    El snapshot se toma una vez y queda congelado.
--    Las correcciones posteriores del admin son UPDATEs directos
--    que no disparan este trigger.
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_fill_registration_snapshot ON public.registrations;

CREATE TRIGGER trg_fill_registration_snapshot
  BEFORE INSERT ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_registration_snapshot();


-- -----------------------------------------------------------------------------
-- 5. BACKFILL — registros históricos sin snapshot_taken_at
-- -----------------------------------------------------------------------------

-- 5a. Rellenar emergency_contact / emergency_phone desde profiles
--     (solo para usuarios con perfil y que tengan el campo vacío)
UPDATE public.registrations r
SET
  emergency_contact = COALESCE(r.emergency_contact, p.emergency_contact),
  emergency_phone   = COALESCE(r.emergency_phone,   p.emergency_phone)
FROM public.profiles p
WHERE r.user_id = p.id
  AND r.user_id IS NOT NULL
  AND (r.emergency_contact IS NULL OR r.emergency_phone IS NULL);

-- 5b. Marcar todos los registros históricos con su created_at como snapshot_taken_at
--     Esto distingue registros pre-trigger (snapshot_taken_at = created_at)
--     de registros post-trigger (snapshot_taken_at = instante real del INSERT,
--     que puede ser ligeramente posterior a created_at por el orden de operaciones)
UPDATE public.registrations
SET snapshot_taken_at = created_at
WHERE snapshot_taken_at IS NULL;


-- -----------------------------------------------------------------------------
-- 6. ÍNDICES
-- -----------------------------------------------------------------------------

-- Para consultas de emergencia rápidas (buscar por nombre/DNI sin JOIN)
CREATE INDEX IF NOT EXISTS idx_registrations_dni_passport
  ON public.registrations (dni_passport)
  WHERE dni_passport IS NOT NULL;

-- Para auditoría y debugging del trigger
CREATE INDEX IF NOT EXISTS idx_registrations_snapshot_taken_at
  ON public.registrations (snapshot_taken_at);
