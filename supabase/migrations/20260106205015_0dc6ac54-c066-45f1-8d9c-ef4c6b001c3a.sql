-- Eliminar la foreign key redundante a auth.users que causa errores de permisos
-- La FK a profiles es suficiente para la relación

ALTER TABLE public.registrations 
DROP CONSTRAINT IF EXISTS registrations_user_id_fkey;