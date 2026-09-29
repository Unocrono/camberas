-- Inscripciones: el navegador ya no puede confirmarlas ni marcarlas pagadas.
--
-- Hasta sep-2026 (comprobado en producción con ROLLBACK el 29-sep):
--  1. La política "Guests can create registrations" dejaba a anon (la clave
--     pública de la web) insertar inscripciones con cualquier estado: una
--     'confirmed' + 'paid' en un recorrido de pago, con el id que quisiera.
--     El flujo de invitado de verdad va por guest-register (clave de
--     servicio) y no la necesita.
--  2. "Users can update their own registrations" no limitaba columnas: un
--     corredor con cuenta podía poner su inscripción como pagada. La ficha de
--     la carrera (RaceDetail) confirmaba así las gratuitas; ahora lo hace la
--     edge function confirmar-inscripcion-gratuita, que recalcula el total.
--     Lo mismo al crearla: "Users can create registrations" aceptaba
--     cualquier estado.
--  3. Respuestas del formulario: anon añadía respuestas a cualquier
--     inscripción de invitado, y el corredor podía cambiar las suyas después
--     de pagar (extras de pago sin pagarlos).
--  4. assign_next_bib se podía llamar desde el navegador y gastar dorsales.
--
-- ORDEN: desplegar confirmar-inscripcion-gratuita y publicar la web ANTES de
-- aplicar esto. Con la web vieja, la inscripción gratuita con cuenta se
-- quedaría pendiente (su update de confirmación rebota aquí).
--
-- A quién NO afecta: a las edge functions (escriben con la clave de
-- servicio), a las funciones SQL que tocan inscripciones (todas SECURITY
-- DEFINER: corren como su dueño) ni al panel (admin u organizador de la
-- carrera, puede_gestionar_carrera).

-- ── 1. Sin inserciones de anon ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Guests can create registrations" ON public.registrations;
DROP POLICY IF EXISTS "Guests can create registration responses" ON public.registration_responses;

-- ── 2. Qué puede escribir el corredor en su inscripción ────────────────────
-- SECURITY INVOKER a propósito: current_user tiene que ser el de quien
-- escribe (anon/authenticated desde la web; service_role o el dueño desde el
-- servidor).
CREATE OR REPLACE FUNCTION public.registrations_limitar_corredor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- Sin sesión, nada: el invitado entra por guest-register (clave de servicio)
  IF current_user = 'anon' THEN
    RAISE EXCEPTION 'Sin sesión no se escriben inscripciones' USING ERRCODE = '42501';
  END IF;

  -- Panel: admin u organizador de la carrera (lo que ya dejan sus políticas)
  IF public.puede_gestionar_carrera(NEW.race_id)
     AND (TG_OP = 'INSERT' OR public.puede_gestionar_carrera(OLD.race_id)) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Se crea pendiente y sin nada de lo que pone el servidor o la organización
    IF NEW.status IS DISTINCT FROM 'pending'
       OR NEW.payment_status IS DISTINCT FROM 'pending'
       OR NEW.source IS NULL OR NEW.source NOT IN ('gateway', 'free')
       OR NEW.bib_number IS NOT NULL
       OR NEW.chip_code IS NOT NULL
       OR NEW.importe_manual IS NOT NULL
       OR NEW.external_id IS NOT NULL
       OR NEW.team_id IS NOT NULL
       OR NEW.team_member_id IS NOT NULL
       OR NEW.team_discount IS NOT NULL THEN
      RAISE EXCEPTION 'Una inscripción se crea pendiente: la confirman el pago o la organización'
        USING ERRCODE = '42501';
    END IF;
    -- Fechas y token, los del servidor: un created_at en el futuro reservaría
    -- plaza para siempre en el aforo (pendientes recientes)
    NEW.created_at := now();
    NEW.updated_at := now();
    NEW.token_inscripcion := gen_random_uuid();
    -- El email es el de la cuenta, nunca uno tecleado (permisos por email,
    -- límite de cupón por persona)
    v_email := lower(trim(auth.jwt() ->> 'email'));
    IF v_email IS NOT NULL AND v_email <> '' THEN
      NEW.email := v_email;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: lo único que puede hacer el corredor es anular la suya
  -- (Dashboard). Cualquier otra columna que cambie, fuera.
  IF NEW.status = 'cancelled'
     AND (to_jsonb(NEW) - 'status' - 'updated_at') = (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Solo la organización puede cambiar esta inscripción' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_registrations_limitar_corredor ON public.registrations;
CREATE TRIGGER trg_registrations_limitar_corredor
  BEFORE INSERT OR UPDATE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.registrations_limitar_corredor();

-- ── 3. Respuestas: solo mientras la inscripción está a medias ──────────────
-- Pendiente, sin intento de pago (individual ni de equipo) y no de equipo:
-- una vez el servidor ha calculado el importe, los extras quedan fijos.
CREATE OR REPLACE FUNCTION public.respuestas_editables_por_corredor(p_registration_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM registrations r
    WHERE r.id = p_registration_id
      AND r.user_id = auth.uid()
      AND r.status = 'pending'
      AND r.payment_status = 'pending'
      AND r.team_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM payment_intents pi WHERE pi.registration_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM payment_intent_items it WHERE it.registration_id = r.id)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.respuestas_editables_por_corredor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respuestas_editables_por_corredor(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can insert their own registration responses" ON public.registration_responses;
CREATE POLICY "Users can insert their own registration responses"
  ON public.registration_responses FOR INSERT TO authenticated
  WITH CHECK (public.respuestas_editables_por_corredor(registration_id));

DROP POLICY IF EXISTS "Users can update their own registration responses" ON public.registration_responses;
CREATE POLICY "Users can update their own registration responses"
  ON public.registration_responses FOR UPDATE TO authenticated
  USING (public.respuestas_editables_por_corredor(registration_id))
  WITH CHECK (public.respuestas_editables_por_corredor(registration_id));

-- ── 4. Dorsales: solo el servidor ──────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.assign_next_bib(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_next_bib(uuid) TO service_role;
