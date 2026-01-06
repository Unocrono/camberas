-- Eliminar el campo category (texto) de registrations
-- Ya no es necesario porque usamos race_category_id (FK)
ALTER TABLE public.registrations DROP COLUMN IF EXISTS category;