-- 1. Añadir race_distance_id a race_results para consultas más eficientes
ALTER TABLE public.race_results
ADD COLUMN race_distance_id uuid REFERENCES public.race_distances(id);

-- 2. Añadir gender_position para clasificación por sexo
ALTER TABLE public.race_results
ADD COLUMN gender_position integer;

-- 3. Poblar race_distance_id desde las registrations existentes
UPDATE public.race_results rr
SET race_distance_id = r.race_distance_id
FROM public.registrations r
WHERE rr.registration_id = r.id;

-- 4. Crear índices para mejorar rendimiento de consultas de clasificación
CREATE INDEX idx_race_results_distance ON public.race_results(race_distance_id);
CREATE INDEX idx_race_results_positions ON public.race_results(race_distance_id, overall_position);
CREATE INDEX idx_race_results_gender ON public.race_results(race_distance_id, gender_position);
CREATE INDEX idx_race_results_category ON public.race_results(race_distance_id, category_position);