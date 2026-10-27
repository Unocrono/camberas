-- El panel «Borrado de posiciones GPS» del admin pasa a gps_positions, donde
-- escribe la app Camberas Track desde julio (gps_tracking y moto_gps_tracking,
-- las tablas que leía, están vacías). Los admins ya podían LEER gps_positions
-- («Admins read gps_positions»); faltaba poder borrar. Solo añade.

DROP POLICY IF EXISTS "Admins delete gps_positions" ON public.gps_positions;
CREATE POLICY "Admins delete gps_positions"
  ON public.gps_positions
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ── Comprobaciones ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gps_positions' AND policyname = 'Admins delete gps_positions') THEN
    RAISE EXCEPTION 'falta la politica de borrado';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gps_positions' AND cmd = 'DELETE' AND roles::text LIKE '%anon%') THEN
    RAISE EXCEPTION 'anon no puede borrar posiciones';
  END IF;
  IF has_column_privilege('anon', 'public.gps_positions', 'lat', 'SELECT') THEN
    RAISE EXCEPTION 'el cierre de la fase 2 se ha abierto';
  END IF;
END $$;

DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;
