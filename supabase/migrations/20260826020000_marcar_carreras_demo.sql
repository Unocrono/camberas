-- Marcar las carreras de prueba, para que los robots no les escriban
--
-- Lo destapó el ensayo de recuperar-pagos: los tres únicos carritos
-- abandonados del sistema eran de "Carrera Demo Camberas", con destinatarios
-- 1@equipo.es, 2@equipo.es y 3@equipo.es. El mecanismo funcionaba bien; el
-- problema es que iba a mandar tres correos a dominios que no existen.
--
-- Y no es un caso aislado que se resuelva borrando esas tres filas: las
-- carreras demo son permanentes (hacen falta para las revisiones de Apple y
-- de Google), así que cada prueba deja carritos nuevos y el robot volvería a
-- escribir a direcciones falsas. Cada intento es un rebote, y los rebotes
-- castigan la reputación del dominio: el precio lo acaban pagando los correos
-- de inscripción de verdad, que empiezan a caer en spam.
--
-- No había forma de distinguirlas: `races` no tenía ningún campo de demo ni
-- de prueba, solo el nombre. Ahora sí.
--
-- Ojo con lo que este interruptor NO hace: las demo siguen siendo visibles y
-- públicas (is_visible se queda como está), porque las tiendas tienen que
-- poder entrar a verlas. Esto solo dice "no le mandes correos a esta gente".

ALTER TABLE public.races
  ADD COLUMN IF NOT EXISTS es_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.races.es_demo IS
  'Carrera de pruebas (revisiones de tienda, ensayos). Los robots de aviso la ignoran.';

-- Las tres que existen hoy
UPDATE public.races
SET es_demo = true
WHERE slug IN ('carrera-demo', 'demo-apple', 'demo-google-review');

-- ─────────────────────────────────────────────────────────────────────────
-- Que la detección no las recoja
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_pagos_a_medias(p_ventana_horas integer DEFAULT 48)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_individuales integer := 0;
  v_equipos      integer := 0;
BEGIN
  -- Inscripciones sueltas
  INSERT INTO recuperacion_pagos (
    tipo, race_id, race_distance_id, registration_id, email, nombre, abandonada_at, caduca_at
  )
  SELECT 'individual', c.race_id, c.race_distance_id, c.id, c.email, c.first_name,
         c.created_at, c.caduca_at
  FROM (
    SELECT r.id, r.race_id, r.race_distance_id, r.email, r.first_name, r.created_at,
           LEAST(
             r.created_at + interval '7 days',
             COALESCE(d.registration_closes, ra.date::timestamptz)
           ) AS caduca_at
    FROM registrations r
    JOIN race_distances d ON d.id = r.race_distance_id
    JOIN races ra          ON ra.id = r.race_id
    WHERE r.payment_status = 'pending'
      AND r.status = 'pending'
      AND r.source = 'gateway'          -- nunca 'manual' ni 'external'
      AND r.team_id IS NULL
      AND r.email IS NOT NULL
      AND NOT ra.es_demo                -- las de prueba, fuera
      AND r.created_at < now() - interval '30 minutes'
      AND r.created_at > now() - make_interval(hours => p_ventana_horas)
      AND ra.date >= current_date
      AND (d.registration_closes IS NULL OR d.registration_closes > now())
  ) c
  WHERE c.caduca_at > now()
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_individuales = ROW_COUNT;

  -- Lotes de equipo: paga el capitán, así que el aviso va a su perfil
  INSERT INTO recuperacion_pagos (
    tipo, race_id, race_distance_id, team_id, email, nombre, abandonada_at, caduca_at
  )
  SELECT 'equipo', l.race_id, l.race_distance_id, l.team_id, p.email,
         COALESCE(p.first_name, t.name), l.abandonada_at, l.caduca_at
  FROM (
    SELECT r.team_id, r.race_distance_id, r.race_id,
           min(r.created_at) AS abandonada_at,
           LEAST(
             min(r.created_at) + interval '7 days',
             COALESCE(max(d.registration_closes), max(ra.date)::timestamptz)
           ) AS caduca_at
    FROM registrations r
    JOIN race_distances d ON d.id = r.race_distance_id
    JOIN races ra          ON ra.id = r.race_id
    WHERE r.payment_status = 'pending'
      AND r.status = 'pending'
      AND r.source = 'gateway'
      AND r.team_id IS NOT NULL
      AND NOT ra.es_demo                -- las de prueba, fuera
      AND r.created_at < now() - interval '30 minutes'
      AND r.created_at > now() - make_interval(hours => p_ventana_horas)
      AND ra.date >= current_date
      AND (d.registration_closes IS NULL OR d.registration_closes > now())
    GROUP BY r.team_id, r.race_distance_id, r.race_id
  ) l
  JOIN teams t    ON t.id = l.team_id
  JOIN profiles p ON p.id = t.captain_user_id
  WHERE p.email IS NOT NULL
    AND l.caduca_at > now()
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_equipos = ROW_COUNT;

  RETURN v_individuales + v_equipos;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pagos_a_medias(integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registrar_pagos_a_medias(integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Y que las que YA están detectadas tampoco reciban aviso
--
-- El filtro va también aquí, no solo en la detección: las tres filas de la
-- carrera demo ya existen, y borrarlas volvería a llenarse en la próxima
-- prueba. Filtrando en el envío se apagan sin tener que tocarlas.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.avisos_pago_pendientes()
RETURNS TABLE (
  id             uuid,
  token          uuid,
  ronda          integer,
  tipo           text,
  email          text,
  nombre         text,
  race_name      text,
  race_slug      text,
  race_date      date,
  race_location  text,
  distance_name  text,
  team_name      text,
  n_corredores   integer,
  importe        numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rp.id,
    rp.token,
    (CASE WHEN rp.aviso_1_at IS NULL THEN 1 ELSE 2 END)::integer AS ronda,
    rp.tipo,
    rp.email,
    rp.nombre,
    ra.name,
    ra.slug,
    ra.date,
    ra.location,
    d.name,
    t.name,
    vivas.n,
    CASE rp.tipo
      WHEN 'individual' THEN (
        SELECT pi.amount FROM payment_intents pi
        WHERE pi.registration_id = rp.registration_id
        ORDER BY pi.created_at DESC LIMIT 1
      )
      ELSE (
        SELECT pi.amount FROM payment_intents pi
        WHERE pi.registration_id IS NULL
          AND EXISTS (
            SELECT 1 FROM payment_intent_items pii
            JOIN registrations r ON r.id = pii.registration_id
            WHERE pii.payment_intent_id = pi.id
              AND r.team_id = rp.team_id
              AND r.race_distance_id = rp.race_distance_id
          )
        ORDER BY pi.created_at DESC LIMIT 1
      )
    END
  FROM recuperacion_pagos rp
  JOIN races ra          ON ra.id = rp.race_id
  JOIN race_distances d  ON d.id  = rp.race_distance_id
  LEFT JOIN teams t      ON t.id  = rp.team_id
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS n
    FROM registrations r
    WHERE r.payment_status = 'pending'
      AND r.status = 'pending'
      AND r.source = 'gateway'
      AND r.race_distance_id = rp.race_distance_id
      AND (
        (rp.tipo = 'individual' AND r.id = rp.registration_id)
        OR
        (rp.tipo = 'equipo' AND r.team_id = rp.team_id)
      )
  ) vivas
  WHERE rp.recuperado_at IS NULL
    AND rp.caduca_at > now()
    AND NOT ra.es_demo                                 -- las de prueba, fuera
    AND vivas.n > 0
    AND ra.date >= current_date
    AND (d.registration_closes IS NULL OR d.registration_closes > now())
    AND COALESCE(public.plazas_libres(rp.race_distance_id), vivas.n) >= vivas.n
    AND (
      (rp.aviso_1_at IS NULL AND now() >= rp.abandonada_at + interval '2 hours')
      OR
      (rp.aviso_1_at IS NOT NULL AND rp.aviso_2_at IS NULL
       AND now() >= rp.abandonada_at + interval '24 hours')
    )
  ORDER BY rp.abandonada_at;
$$;

COMMENT ON FUNCTION public.avisos_pago_pendientes() IS
  'Avisos de pago a medias que toca enviar ahora (ronda 1 a las 2 h, ronda 2 a las 24 h). Ignora las carreras demo.';

REVOKE EXECUTE ON FUNCTION public.avisos_pago_pendientes() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.avisos_pago_pendientes() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Comprobacion: las tres demo marcadas, y ninguna carrera real tocada
-- ─────────────────────────────────────────────────────────────────────────
SELECT name, slug, date, es_demo
FROM public.races
WHERE date >= current_date OR es_demo
ORDER BY es_demo DESC, date;
