-- El registro de usuario (/auth) pide ya el teléfono, obligatorio: es lo que
-- identifica a la persona en el asistente de WhatsApp (Maika solo atiende a
-- teléfonos que estén en un perfil). Llega en raw_user_meta_data->>'phone' y
-- el trigger lo copia a profiles.phone al crear el perfil.
--
-- Misma función que 20261027120000_alta_organizador_pendiente.sql, solo
-- cambia el INSERT en profiles (añade phone).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      phone = COALESCE(public.profiles.phone, EXCLUDED.phone);

  -- Solicitud de organizador (desde /organizer/auth): pendiente de que el
  -- admin la apruebe en «Solicitudes de organizadores»
  IF (NEW.raw_user_meta_data->>'is_organizer')::boolean = true THEN
    INSERT INTO public.user_roles (user_id, role, status)
    VALUES (NEW.id, 'organizer', 'pending');
  END IF;

  -- Alta de Capo (desde /grupetta): rol aprobado al instante
  IF (NEW.raw_user_meta_data->>'is_capo')::boolean = true THEN
    INSERT INTO public.user_roles (user_id, role, status)
    VALUES (NEW.id, 'capo', 'approved');
  END IF;

  RETURN NEW;
END;
$function$;
