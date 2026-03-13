-- =============================================================================
-- AUTO-VINCULACIÓN DE INSCRIPCIONES POR DNI
-- =============================================================================
-- Cuando un usuario crea su cuenta y rellena su DNI en el perfil, se vinculan
-- automáticamente todas las inscripciones de invitado que tengan el mismo DNI.
--
-- Invariante clave: el snapshot (first_name, last_name, email, etc.) NO se
-- modifica en ningún caso. El UPDATE solo toca user_id.
--
-- Flujo:
--   1. Admin importa CSV → registrations con user_id = NULL y dni_passport = X
--   2. Corredor se registra → perfil con dni_passport = X
--   3. Trigger AFTER INSERT OR UPDATE OF dni_passport en profiles
--      → llama a link_registrations_by_dni(NEW.id)
--      → UPDATE registrations SET user_id = NEW.id WHERE dni_passport = X AND user_id IS NULL
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. FUNCIÓN AUXILIAR: obtener el DNI del usuario actual (para RLS)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_current_user_dni()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dni_passport
  FROM public.profiles
  WHERE id = auth.uid()
$$;


-- -----------------------------------------------------------------------------
-- 2. FUNCIÓN PRINCIPAL: vincular inscripciones por DNI
--    Devuelve el número de inscripciones vinculadas.
--    Actualiza SOLO user_id — el snapshot queda intacto.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.link_registrations_by_dni(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dni     TEXT;
  v_linked  INTEGER;
BEGIN
  -- Obtener el DNI del perfil
  SELECT dni_passport INTO v_dni
  FROM public.profiles
  WHERE id = p_user_id;

  -- Si el perfil no tiene DNI, no hay nada que vincular
  IF v_dni IS NULL OR trim(v_dni) = '' THEN
    RETURN 0;
  END IF;

  -- Vincular todas las inscripciones de invitado con el mismo DNI.
  -- SOLO se actualiza user_id; el snapshot permanece congelado tal cual.
  UPDATE public.registrations
  SET user_id = p_user_id
  WHERE dni_passport = v_dni
    AND user_id IS NULL;

  GET DIAGNOSTICS v_linked = ROW_COUNT;

  RETURN v_linked;
END;
$$;


-- -----------------------------------------------------------------------------
-- 3. FUNCIÓN DEL TRIGGER en profiles
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_link_registrations_on_dni_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo actuar cuando el DNI tiene valor y es nuevo o ha cambiado
  IF NEW.dni_passport IS NOT NULL
     AND trim(NEW.dni_passport) <> ''
     AND (TG_OP = 'INSERT' OR NEW.dni_passport IS DISTINCT FROM OLD.dni_passport)
  THEN
    PERFORM public.link_registrations_by_dni(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 4. TRIGGER en profiles — AFTER INSERT OR UPDATE OF dni_passport
--    Se dispara cuando un corredor crea su cuenta o actualiza su DNI.
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_link_registrations_on_dni ON public.profiles;

CREATE TRIGGER trg_link_registrations_on_dni
  AFTER INSERT OR UPDATE OF dni_passport ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_link_registrations_on_dni_update();


-- -----------------------------------------------------------------------------
-- 5. POLÍTICAS RLS — reemplazar claim por email con claim por DNI
--
--    Mantenemos también la política de email como fallback para inscripciones
--    importadas sin DNI (e.g., migraciones antiguas que solo tenían email).
-- -----------------------------------------------------------------------------

-- Eliminar la política de email que se reemplaza
DROP POLICY IF EXISTS "Users can claim guest registrations" ON public.registrations;

-- Nueva política de reclamación por DNI
CREATE POLICY "Users can claim guest registrations by dni"
ON public.registrations
FOR UPDATE
USING (
  user_id IS NULL
  AND dni_passport IS NOT NULL
  AND dni_passport = public.get_current_user_dni()
);

-- Política de fallback por email (inscripciones sin DNI)
CREATE POLICY "Users can claim guest registrations by email"
ON public.registrations
FOR UPDATE
USING (
  user_id IS NULL
  AND email IS NOT NULL
  AND email = public.get_current_user_email()
);


-- -----------------------------------------------------------------------------
-- 6. BACKFILL — vincular inscripciones históricas con perfiles existentes
--    Para cada perfil con DNI, intenta vincular sus inscripciones de invitado.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_profile RECORD;
  v_count   INTEGER := 0;
  v_total   INTEGER := 0;
BEGIN
  FOR v_profile IN
    SELECT id
    FROM public.profiles
    WHERE dni_passport IS NOT NULL
      AND trim(dni_passport) <> ''
  LOOP
    v_count := public.link_registrations_by_dni(v_profile.id);
    v_total := v_total + v_count;
  END LOOP;

  RAISE NOTICE 'Backfill DNI completado: % inscripciones vinculadas', v_total;
END;
$$;
