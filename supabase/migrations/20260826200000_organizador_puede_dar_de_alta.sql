-- El organizador no podía dar de alta a nadie en su propia carrera
--
-- Sintoma: al pulsar "Nueva Inscripcion" en el panel, o "Anadir invitado" en
-- la app /org, salta
--
--   new row violates row-level security policy for table "registrations"
--
-- Causa: registrations tiene politicas de SELECT y de UPDATE para el
-- organizador (20251121174802:98-121), pero NINGUNA de INSERT. La unica
-- politica de insercion para usuarios con sesion es
--
--   CREATE POLICY "Users can create registrations" ... TO authenticated
--     WITH CHECK (user_id = auth.uid());   -- 20260716142415:52-56
--
-- o sea, con sesion solo puedes inscribirte a TI MISMO. El alta manual crea un
-- invitado, con user_id NULL, asi que el WITH CHECK falla siempre.
--
-- El admin no lo notaba porque tiene "Admins can manage all registrations"
-- FOR ALL (20251120135244:156), que si cubre el INSERT. Por eso el fallo ha
-- estado ahi desde julio de 2025 sin que nadie lo pisara: el panel se usa
-- casi siempre como admin.
--
-- Se concede lo mismo que ya tiene para ver y editar, ni un permiso mas: solo
-- puede dar de alta en carreras de las que el figura como organizador.

DROP POLICY IF EXISTS "Organizers can create registrations for their races" ON public.registrations;
CREATE POLICY "Organizers can create registrations for their races"
  ON public.registrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'organizer'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.races r
      WHERE r.id = registrations.race_id
        AND r.organizer_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Comprobacion: deben salir CUATRO politicas del organizador sobre
-- registrations — SELECT, UPDATE, el INSERT nuevo... y NO habra DELETE.
--
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename = 'registrations' AND policyname ILIKE '%organizer%';
--
-- Lo del DELETE es a proposito y queda dicho: el panel ofrece borrar
-- inscripciones y el organizador no puede. No se anade aqui porque borrar es
-- irreversible y arrastra en cascada seis tablas hijas; que se decida aparte
-- si el organizador debe poder, o si lo suyo es cancelar en vez de borrar.
-- ─────────────────────────────────────────────────────────────────────────
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'registrations'
ORDER BY cmd, policyname;
