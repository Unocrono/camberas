-- SOS: poner cada cosa en su sitio
--
-- Comprobado contra produccion con pg_policies: gps_sos_alerts tiene UNA sola
-- politica de lectura, y es solo para admin.
--
--   SELECT | Admins read sos | has_role(auth.uid(), 'admin') | {authenticated}
--
-- Cruzando eso con quien lee cada mapa, el resultado estaba del reves:
--
--   * CamberasTrackMap (paneles de admin, de organizador y /org) lee la TABLA
--     directamente, asi que RLS le aplica: al ORGANIZADOR de la carrera le
--     vuelve vacio. Y no da error — le sale un panel que parece decir "no hay
--     ninguna alerta". Justo quien tiene que mandar la ayuda es el unico que
--     no la ve.
--   * LiveGPSMap (paginas publicas /:slug/gps y /:slug/live) lee por
--     get_race_sos_alerts, que es SECURITY DEFINER y por tanto se salta RLS.
--     Ahi si sale, y con dorsal y nombre, para cualquiera que abra la web sin
--     cuenta.
--
-- O sea que la alerta de socorro de una persona identificada se publicaba en
-- internet abierto, mientras el organizador se quedaba a ciegas. Ninguna de
-- las dos cosas es lo que nadie decidio: la lectura publica se hizo por RPC
-- saltandose RLS, y a RLS nunca se le anadio el organizador.
--
-- Esta migracion arregla las dos puntas.
--
-- EL CRITERIO para lo publico: el nombre y el dorsal NO ayudan a rescatar a
-- nadie. Quien va a socorrer necesita las coordenadas. La identidad solo sirve
-- a quien no esta ayudando — y convierte un dato de salud de una persona
-- concreta en algo que cualquiera puede leer y capturar. Se queda la posicion,
-- que es lo util, y se va la identidad, que es lo que expone.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Que el organizador vea las alertas de SU carrera
--
-- El camino es: gps_sos_alerts.token_id -> gps_tokens.id, y gps_tokens.event_id
-- es el race_distances.id (convencion del proyecto, ver 20260717120000:14).
-- ═════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Organizador lee sos de su carrera" ON public.gps_sos_alerts;
CREATE POLICY "Organizador lee sos de su carrera"
  ON public.gps_sos_alerts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM gps_tokens t
      JOIN race_distances d ON d.id::text = t.event_id::text
      JOIN races r          ON r.id = d.race_id
      WHERE t.id = gps_sos_alerts.token_id
        AND r.organizer_id = auth.uid()
    )
  );

-- ═════════════════════════════════════════════════════════════════════════
-- 2. El mapa publico ve el aviso, no a la persona
--
-- Se conserva el nombre y la firma de la funcion: LiveGPSMap la llama tal cual
-- y no hay que tocar nada del cliente para que siga funcionando. Lo unico que
-- cambia es que la identidad va SOLO a quien gestiona la carrera.
--
-- Para un visitante anonimo, bib_number y runner_name vuelven NULL. El mapa ya
-- lo aguanta: fetchSosAlerts hace `a.runner_name || 'Corredor'`
-- (LiveGPSMap.tsx:898), asi que el marcador seguira diciendo "SOS — Corredor"
-- con su hora y su posicion, que es lo que hace falta para acudir.
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_race_sos_alerts(p_race_id uuid)
RETURNS TABLE(
  id           uuid,
  lat          numeric,
  lng          numeric,
  triggered_at timestamptz,
  resolved_at  timestamptz,
  bib_number   text,
  runner_name  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_gestor boolean;
BEGIN
  -- ¿Quien pregunta gestiona esta carrera? Solo a ese se le dice quien es.
  v_gestor := public.has_role(auth.uid(), 'admin'::app_role)
              OR EXISTS (SELECT 1 FROM races r
                         WHERE r.id = p_race_id AND r.organizer_id = auth.uid());

  RETURN QUERY
  SELECT a.id,
         a.lat::numeric,
         a.lng::numeric,
         a.triggered_at,
         a.resolved_at,
         CASE WHEN v_gestor THEN gt.bib_number::text END,
         CASE WHEN v_gestor THEN COALESCE(gt.participant_name, 'Corredor') END
  FROM gps_sos_alerts a
  JOIN gps_tokens gt      ON gt.id = a.token_id
  JOIN race_distances rd  ON rd.id::text = gt.event_id::text
  WHERE rd.race_id = p_race_id
    AND a.triggered_at > now() - interval '24 hours'
  ORDER BY a.triggered_at DESC;
END;
$fn$;

COMMENT ON FUNCTION public.get_race_sos_alerts(uuid) IS
  'Alertas SOS de una carrera. La posicion es publica; el dorsal y el nombre, solo para admin u organizador.';

-- Publica a proposito: el aviso en el mapa es lo que permite que acuda quien
-- esta cerca. Lo que se ha quitado es la identidad, no la alerta.
GRANT EXECUTE ON FUNCTION public.get_race_sos_alerts(uuid) TO anon, authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- Comprobacion
--
-- 1) Politicas de lectura: deben salir DOS, la de admin y la del organizador.
--      SELECT policyname, cmd, roles FROM pg_policies
--       WHERE tablename = 'gps_sos_alerts' AND cmd = 'SELECT';
--
-- 2) Con la clave anonima, get_race_sos_alerts debe devolver las alertas con
--    bib_number y runner_name en NULL, y con lat/lng rellenos.
--
-- 3) En el panel del organizador, el mapa debe empezar a mostrar las alertas
--    de su carrera, que hasta hoy no veia.
-- ═════════════════════════════════════════════════════════════════════════
