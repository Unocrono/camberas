-- ============================================================
-- CLASIFICACIÓN POR SPLIT EN DIRECTO
--
-- LB.aspx acepta SplitId: devuelve la clasificación EN ese punto de
-- cronometraje (posiciones y tiempos que calcula RaceTec allí), distinta
-- de la general. No puede convivir con el leaderboard general en
-- racetec_leaderboard porque comparten clave (eid, bib): se machacarían.
--
-- El importador añade una llamada por cada split que el operador elija
-- seguir (una más en la rotación de 5 s, sin coste extra de rate limit),
-- y el ticker/overlays leen de aquí cuando hay un split seleccionado.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.racetec_leaderboard_split (
  id               bigserial PRIMARY KEY,
  eid              text NOT NULL,
  split_id         integer NOT NULL,
  bib              text NOT NULL,
  athlete_id       bigint,
  position         integer,
  cat_position     integer,
  gender_position  integer,
  firstname        text,
  lastname         text,
  gender           text,
  category         text,
  team             text,
  country          text,
  gun_time_secs    integer,
  gun_time_display text,
  gap_secs         integer,
  gap_display      text,
  status           text,
  last_split       text,
  split_tod        text,
  updated_at       timestamptz DEFAULT now(),
  CONSTRAINT racetec_leaderboard_split_unico UNIQUE (eid, split_id, bib)
);

CREATE INDEX IF NOT EXISTS idx_rt_lb_split_eid_split
  ON public.racetec_leaderboard_split (eid, split_id, gender_position);

ALTER TABLE public.racetec_leaderboard_split ENABLE ROW LEVEL SECURITY;

-- Mismo régimen que el resto de tablas racetec_*: lectura pública para los
-- overlays y escritura anon para el panel (ver 20260805100000).
DROP POLICY IF EXISTS "lectura publica racetec_leaderboard_split" ON public.racetec_leaderboard_split;
CREATE POLICY "lectura publica racetec_leaderboard_split"
  ON public.racetec_leaderboard_split FOR SELECT USING (true);

DROP POLICY IF EXISTS "panel anon inserta racetec_leaderboard_split" ON public.racetec_leaderboard_split;
CREATE POLICY "panel anon inserta racetec_leaderboard_split"
  ON public.racetec_leaderboard_split FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "panel anon actualiza racetec_leaderboard_split" ON public.racetec_leaderboard_split;
CREATE POLICY "panel anon actualiza racetec_leaderboard_split"
  ON public.racetec_leaderboard_split FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "panel anon borra racetec_leaderboard_split" ON public.racetec_leaderboard_split;
CREATE POLICY "panel anon borra racetec_leaderboard_split"
  ON public.racetec_leaderboard_split FOR DELETE TO anon, authenticated USING (true);
