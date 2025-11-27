-- Make race_id nullable since we now use race_distance_id
ALTER TABLE public.registration_form_fields 
ALTER COLUMN race_id DROP NOT NULL;