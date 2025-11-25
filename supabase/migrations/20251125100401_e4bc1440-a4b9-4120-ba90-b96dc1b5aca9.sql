-- First, ensure all user_ids in registrations have corresponding profiles
INSERT INTO public.profiles (id)
SELECT DISTINCT r.user_id
FROM public.registrations r
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = r.user_id
);

-- Now add the foreign key constraint
ALTER TABLE public.registrations
ADD CONSTRAINT registrations_user_id_profiles_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;