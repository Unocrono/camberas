-- Tabla para vincular chips RFID con dorsales por evento
CREATE TABLE public.bib_chips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  race_distance_id UUID NOT NULL REFERENCES race_distances(id) ON DELETE CASCADE,
  bib_number INTEGER NOT NULL,
  chip_code TEXT NOT NULL,
  chip_code_2 TEXT,
  chip_code_3 TEXT,
  chip_code_4 TEXT,
  chip_code_5 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Un dorsal solo puede tener una fila por evento
  UNIQUE(race_distance_id, bib_number)
);

-- Índices para búsquedas rápidas por chip
CREATE INDEX idx_bib_chips_chip_code ON bib_chips(chip_code);
CREATE INDEX idx_bib_chips_chip_code_2 ON bib_chips(chip_code_2) WHERE chip_code_2 IS NOT NULL;
CREATE INDEX idx_bib_chips_chip_code_3 ON bib_chips(chip_code_3) WHERE chip_code_3 IS NOT NULL;
CREATE INDEX idx_bib_chips_chip_code_4 ON bib_chips(chip_code_4) WHERE chip_code_4 IS NOT NULL;
CREATE INDEX idx_bib_chips_chip_code_5 ON bib_chips(chip_code_5) WHERE chip_code_5 IS NOT NULL;
CREATE INDEX idx_bib_chips_race_distance ON bib_chips(race_distance_id);

-- Trigger para updated_at
CREATE TRIGGER update_bib_chips_updated_at
  BEFORE UPDATE ON bib_chips
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- Habilitar RLS
ALTER TABLE bib_chips ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Anyone can view bib_chips"
  ON bib_chips FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage all bib_chips"
  ON bib_chips FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can manage bib_chips for their races"
  ON bib_chips FOR ALL
  USING (
    has_role(auth.uid(), 'organizer') AND
    EXISTS (
      SELECT 1 FROM races
      WHERE races.id = bib_chips.race_id
      AND races.organizer_id = auth.uid()
    )
  );

-- Añadir campo chip_code a registrations para el chip principal
ALTER TABLE registrations ADD COLUMN chip_code TEXT;