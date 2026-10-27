-- Las solicitudes de organizador no llegaban al panel (27-oct-2026).
--
-- /organizer/auth da de alta al usuario con metadata is_organizer=true y el
-- trigger handle_new_user tenía que crear su fila en user_roles (organizer,
-- pending), que es lo que lista get_organizer_requests en «Solicitudes de
-- organizadores». La función se reescribió sin esa rama en enero
-- (20260112175720) y las versiones posteriores (20260716142415, rol_capo
-- 20260801100000) la copiaron sin ella: el correo de aviso
-- (send-organizer-request-notification) seguía llegando, pero la solicitud
-- no existía en ningún sitio. Único caso real encontrado: Blanca María
-- Quevedo Merino, Club de Montaña Iguñanievas, 27-oct 01:09 (los demás
-- organizadores desde enero los dio de alta el admin desde Usuarios).
--
-- 1) La rama vuelve. 2) Se recuperan las solicitudes perdidas (altas con
-- is_organizer y sin rol organizer desde agosto; antes no hay ninguna salvo
-- una cuenta propia de diciembre de 2025, que se deja como está).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email;

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

-- Las que se perdieron mientras faltaba la rama (desde el 1-ago-2026)
INSERT INTO public.user_roles (user_id, role, status)
SELECT u.id, 'organizer', 'pending'
  FROM auth.users u
 WHERE (u.raw_user_meta_data->>'is_organizer')::boolean = true
   AND u.created_at >= '2026-08-01'
   AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'organizer');
