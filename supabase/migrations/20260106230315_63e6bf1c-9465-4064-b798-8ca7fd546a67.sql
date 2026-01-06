-- Create genders reference table
CREATE TABLE public.genders (
  gender_id INTEGER PRIMARY KEY,
  gender_code TEXT NOT NULL,
  gender_name TEXT NOT NULL,
  gender_code2 TEXT,
  gender_name2 TEXT,
  gender_code3 TEXT,
  gender_name3 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.genders ENABLE ROW LEVEL SECURITY;

-- Anyone can view genders (reference table)
CREATE POLICY "Anyone can view genders"
ON public.genders
FOR SELECT
USING (true);

-- Only admins can manage genders
CREATE POLICY "Admins can manage genders"
ON public.genders
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert initial data
INSERT INTO public.genders (gender_id, gender_code, gender_name, gender_code2, gender_name2, gender_code3, gender_name3) VALUES
(1, 'M', 'Masculino', 'H', 'Hombre', 'M', 'Male'),
(2, 'F', 'Femenino', 'M', 'Mujer', 'F', 'Female'),
(3, 'X', 'Mixto', 'X', 'Mixto', 'X', 'Mixte');