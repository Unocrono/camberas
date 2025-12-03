-- Primero actualizar los valores existentes al formato de códigos
UPDATE public.race_results SET status = 'FIN' WHERE status = 'finished';
UPDATE public.race_results SET status = 'DNF' WHERE status = 'dnf';
UPDATE public.race_results SET status = 'DNS' WHERE status = 'dns';
UPDATE public.race_results SET status = 'DSQ' WHERE status = 'dsq';
UPDATE public.race_results SET status = 'INS' WHERE status = 'pending' OR status = 'inscrito';

-- Cambiar el default a 'INS' (Inscrito)
ALTER TABLE public.race_results ALTER COLUMN status SET DEFAULT 'INS';

-- Añadir la foreign key constraint
ALTER TABLE public.race_results 
ADD CONSTRAINT race_results_status_fkey 
FOREIGN KEY (status) REFERENCES public.race_results_status(code);