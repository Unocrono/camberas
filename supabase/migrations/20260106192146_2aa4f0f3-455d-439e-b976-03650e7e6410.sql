-- Eliminar columnas de contacto de emergencia de la tabla registrations
ALTER TABLE public.registrations DROP COLUMN IF EXISTS guest_emergency_contact;
ALTER TABLE public.registrations DROP COLUMN IF EXISTS guest_emergency_phone;