-- Recuperar inscripciones a medias (carrito abandonado)
--
-- Quien empieza una inscripción de pago YA existe en `registrations` con
-- payment_status='pending' y source='gateway': la fila se crea antes de ir a
-- la pasarela. Si no vuelve, esa fila se queda ahí y la plaza se libera sola
-- pasados 30 minutos (la retención de checkout que aplica RaceDetail.tsx).
-- Nadie le escribe. Esto lo arregla: dos avisos, a las 2 h y a las 24 h, con
-- un enlace para retomar el pago donde lo dejó.
--
-- El email sale de `registrations.email`, que el invitado sin cuenta también
-- rellena (guest-register lo exige). En los lotes de equipo paga el capitán,
-- así que ahí el email sale de su perfil.
--
-- FILTRO CRÍTICO: source='gateway'. Las altas manuales del panel también se
-- guardan como 'pending' a propósito (source='manual') y las importaciones de
-- EventBooking como 'external'. Sin este filtro el robot escribiría a gente
-- que el organizador dio de alta a mano.

-- ─────────────────────────────────────────────────────────────────────────
-- Plazas libres de un recorrido, con la MISMA regla que la web
-- (RaceDetail.tsx → occupiesPlace): las canceladas no ocupan, las pagadas y
-- las gratuitas sí, y las pendientes solo durante los 30 minutos de
-- retención de checkout. NULL = sin tope de plazas.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.plazas_libres(p_distance_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN d.max_participants IS NULL THEN NULL
    ELSE GREATEST(0, d.max_participants - (
      SELECT count(*)
      FROM registrations r
      WHERE r.race_distance_id = d.id
        AND r.status IS DISTINCT FROM 'cancelled'
        AND (
          r.payment_status IN ('paid', 'not_required')
          OR r.created_at > now() - interval '30 minutes'
        )
    ))::integer
  END
  FROM race_distances d
  WHERE d.id = p_distance_id;
$$;

COMMENT ON FUNCTION public.plazas_libres(uuid) IS
  'Plazas libres de un recorrido (NULL = sin tope). Misma regla que occupiesPlace en RaceDetail.tsx.';

GRANT EXECUTE ON FUNCTION public.plazas_libres(uuid) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Registro de recuperaciones: una fila por abandono detectado
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recuperacion_pagos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- El enlace del email lleva este token, no el id de la inscripción
  token             uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tipo              text NOT NULL CHECK (tipo IN ('individual', 'equipo')),
  race_id           uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  race_distance_id  uuid NOT NULL REFERENCES public.race_distances(id) ON DELETE CASCADE,
  -- individual: la inscripción suelta. equipo: el lote del capitán, cuyos
  -- integrantes se recalculan al abrir el enlace (pueden haber cambiado).
  registration_id   uuid REFERENCES public.registrations(id) ON DELETE CASCADE,
  team_id           uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  email             text NOT NULL,
  nombre            text,
  -- Momento del abandono (created_at de la inscripción), no de la detección:
  -- de él cuelgan las 2 h y las 24 h de los avisos
  abandonada_at     timestamptz NOT NULL,
  -- Importe anunciado en el último aviso, para saber si luego cambió
  importe_avisado   numeric,
  aviso_1_at        timestamptz,
  aviso_2_at        timestamptz,
  recuperado_at     timestamptz,
  caduca_at         timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recuperacion_pagos_tipo_ck CHECK (
    (tipo = 'individual' AND registration_id IS NOT NULL AND team_id IS NULL)
    OR
    (tipo = 'equipo' AND team_id IS NOT NULL AND registration_id IS NULL)
  )
);

COMMENT ON TABLE public.recuperacion_pagos IS
  'Inscripciones que se quedaron a medias en la pasarela y su seguimiento de avisos.';

-- Una recuperación por inscripción suelta; una por lote (equipo + recorrido)
CREATE UNIQUE INDEX IF NOT EXISTS recuperacion_pagos_individual_uk
  ON public.recuperacion_pagos (registration_id) WHERE tipo = 'individual';
CREATE UNIQUE INDEX IF NOT EXISTS recuperacion_pagos_equipo_uk
  ON public.recuperacion_pagos (team_id, race_distance_id) WHERE tipo = 'equipo';
CREATE INDEX IF NOT EXISTS recuperacion_pagos_pendientes_idx
  ON public.recuperacion_pagos (caduca_at) WHERE recuperado_at IS NULL;

ALTER TABLE public.recuperacion_pagos ENABLE ROW LEVEL SECURITY;

-- Nadie lee la tabla directamente desde el cliente: el corredor entra por
-- token (RPC de abajo) y el gestor ve el resumen agregado. Aun así, admin y
-- organizador de la carrera pueden mirar el detalle.
DROP POLICY IF EXISTS "recuperacion_pagos_lectura_gestor" ON public.recuperacion_pagos;
CREATE POLICY "recuperacion_pagos_lectura_gestor"
  ON public.recuperacion_pagos FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.races r
      WHERE r.id = recuperacion_pagos.race_id AND r.organizer_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Detectar abandonos y darlos de alta (idempotente por los índices únicos)
--
-- La ventana de 48 h por defecto es deliberada: en la primera ejecución
-- evita escribir de golpe a meses de carritos viejos. Ampliarla es una
-- decisión consciente, no el comportamiento por defecto.
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
  SELECT 'equipo', l.race_id, l.race_distance_id, l.team_id, p.email, COALESCE(p.first_name, t.name),
         l.abandonada_at, l.caduca_at
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

COMMENT ON FUNCTION public.registrar_pagos_a_medias(integer) IS
  'Da de alta los abandonos de pasarela de las últimas p_ventana_horas. Idempotente.';

GRANT EXECUTE ON FUNCTION public.registrar_pagos_a_medias(integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Qué avisos tocan ahora
--
-- Vuelve a comprobar el estado real antes de dar por bueno el aviso: entre
-- la detección y el envío la persona puede haber pagado, haber cancelado, o
-- el recorrido puede haberse llenado. No se invita a pagar una plaza que ya
-- no existe.
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
    -- El importe que estaba a punto de cobrarse. RedsysPaymentForm lanza
    -- el intent nada más abrirse, así que casi todo abandono tiene uno; si
    -- no lo tiene queda NULL y el email sale sin importe.
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
    AND vivas.n > 0                                    -- sigue sin pagar
    AND ra.date >= current_date
    AND (d.registration_closes IS NULL OR d.registration_closes > now())
    -- Que quepan: sin tope de plazas, o con sitio para todo el lote
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
  'Avisos de pago a medias que toca enviar ahora (ronda 1 a las 2 h, ronda 2 a las 24 h).';

GRANT EXECUTE ON FUNCTION public.avisos_pago_pendientes() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Sellar el aviso enviado
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.marcar_aviso_pago(
  p_id      uuid,
  p_ronda   integer,
  p_importe numeric DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE recuperacion_pagos
  SET aviso_1_at      = CASE WHEN p_ronda = 1 THEN now() ELSE aviso_1_at END,
      aviso_2_at      = CASE WHEN p_ronda = 2 THEN now() ELSE aviso_2_at END,
      importe_avisado = COALESCE(p_importe, importe_avisado)
  WHERE id = p_id;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_aviso_pago(uuid, integer, numeric) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Cerrar las que ya se pagaron (para poder medir cuánto rescata esto)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cerrar_recuperaciones_pagadas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer := 0;
BEGIN
  UPDATE recuperacion_pagos rp
  SET recuperado_at = now()
  WHERE rp.recuperado_at IS NULL
    AND (
      (rp.tipo = 'individual' AND EXISTS (
        SELECT 1 FROM registrations r
        WHERE r.id = rp.registration_id
          AND r.payment_status IN ('paid', 'not_required')
      ))
      OR
      (rp.tipo = 'equipo'
       AND NOT EXISTS (
         SELECT 1 FROM registrations r
         WHERE r.team_id = rp.team_id
           AND r.race_distance_id = rp.race_distance_id
           AND r.payment_status = 'pending'
           AND r.status = 'pending'
       )
       AND EXISTS (
         SELECT 1 FROM registrations r
         WHERE r.team_id = rp.team_id
           AND r.race_distance_id = rp.race_distance_id
           AND r.payment_status = 'paid'
       ))
    );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cerrar_recuperaciones_pagadas() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Qué ve quien abre el enlace del email
--
-- Devuelve solo lo justo para pintar la página: ni el email ni el resto de
-- datos personales. Los ids de inscripción del lote se recalculan AQUÍ, no
-- se guardan: entre el aviso y el clic el equipo puede haber cambiado.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recuperacion_pago_info(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rp        recuperacion_pagos%ROWTYPE;
  v_race    races%ROWTYPE;
  v_dist    race_distances%ROWTYPE;
  v_team    teams%ROWTYPE;
  v_ids     uuid[];
  v_pagadas integer;
  v_libres  integer;
  v_estado  text;
BEGIN
  SELECT * INTO rp FROM recuperacion_pagos WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  SELECT * INTO v_race FROM races           WHERE id = rp.race_id;
  SELECT * INTO v_dist FROM race_distances  WHERE id = rp.race_distance_id;
  IF rp.team_id IS NOT NULL THEN
    SELECT * INTO v_team FROM teams WHERE id = rp.team_id;
  END IF;

  -- Las que siguen sin pagar ahora mismo
  SELECT array_agg(r.id ORDER BY r.created_at)
    INTO v_ids
  FROM registrations r
  WHERE r.payment_status = 'pending'
    AND r.status = 'pending'
    AND r.source = 'gateway'
    AND r.race_distance_id = rp.race_distance_id
    AND (
      (rp.tipo = 'individual' AND r.id = rp.registration_id)
      OR
      (rp.tipo = 'equipo' AND r.team_id = rp.team_id)
    );

  -- Si ya no queda ninguna pendiente hay que distinguir si se pagó o si se
  -- canceló: las dos dejan la lista vacía y no dicen lo mismo
  SELECT count(*) INTO v_pagadas
  FROM registrations r
  WHERE r.race_distance_id = rp.race_distance_id
    AND r.payment_status IN ('paid', 'not_required')
    AND (
      (rp.tipo = 'individual' AND r.id = rp.registration_id)
      OR
      (rp.tipo = 'equipo' AND r.team_id = rp.team_id)
    );

  v_libres := public.plazas_libres(rp.race_distance_id);

  v_estado := CASE
    WHEN (v_ids IS NULL OR array_length(v_ids, 1) IS NULL)
         AND v_pagadas > 0                               THEN 'pagado'
    WHEN v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN 'cancelado'
    WHEN rp.caduca_at <= now()                           THEN 'caducado'
    WHEN v_race.date < current_date                      THEN 'cerrado'
    WHEN v_dist.registration_closes IS NOT NULL
         AND v_dist.registration_closes <= now()         THEN 'cerrado'
    WHEN v_libres IS NOT NULL
         AND v_libres < array_length(v_ids, 1)           THEN 'completo'
    ELSE 'ok'
  END;

  RETURN jsonb_build_object(
    'estado',          v_estado,
    'tipo',            rp.tipo,
    'nombre',          rp.nombre,
    'race_name',       v_race.name,
    'race_slug',       v_race.slug,
    'race_date',       v_race.date,
    'race_location',   v_race.location,
    'distance_name',   v_dist.name,
    'team_name',       v_team.name,
    -- Solo el capitán puede lanzar el cobro del lote (team-init-payment)
    'es_capitan',      (rp.tipo = 'equipo' AND v_team.captain_user_id = auth.uid()),
    'n_corredores',    COALESCE(array_length(v_ids, 1), 0),
    'registration_ids', CASE WHEN v_estado = 'ok' THEN to_jsonb(v_ids) ELSE NULL END
  );
END;
$$;

COMMENT ON FUNCTION public.recuperacion_pago_info(uuid) IS
  'Datos públicos de un enlace de recuperación de pago, por token.';

-- La abre quien recibe el email, tenga cuenta o no
GRANT EXECUTE ON FUNCTION public.recuperacion_pago_info(uuid) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Resumen para el organizador: cuánto se estaba perdiendo y cuánto vuelve
--
-- Solo cuenta como recuperado lo que se pagó DESPUÉS del primer aviso. Lo
-- que iba a pagarse igual no es mérito de esto.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resumen_recuperacion_pagos(p_race_id uuid)
RETURNS TABLE (
  detectadas          integer,
  avisadas            integer,
  recuperadas         integer,
  importe_recuperado  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE rp.aviso_1_at IS NOT NULL)::integer,
    count(*) FILTER (
      WHERE rp.aviso_1_at IS NOT NULL AND rp.recuperado_at > rp.aviso_1_at
    )::integer,
    COALESCE(sum(cobro.importe) FILTER (
      WHERE rp.aviso_1_at IS NOT NULL AND rp.recuperado_at > rp.aviso_1_at
    ), 0)
  FROM recuperacion_pagos rp
  CROSS JOIN LATERAL (
    SELECT CASE rp.tipo
      WHEN 'individual' THEN (
        SELECT COALESCE(sum(pi.amount), 0)
        FROM payment_intents pi
        WHERE pi.registration_id = rp.registration_id
          AND pi.status = 'completed'
          AND pi.completed_at > rp.aviso_1_at
      )
      ELSE (
        SELECT COALESCE(sum(pii.amount), 0)
        FROM payment_intent_items pii
        JOIN payment_intents pi ON pi.id = pii.payment_intent_id
        JOIN registrations r    ON r.id  = pii.registration_id
        WHERE pi.status = 'completed'
          AND pi.completed_at > rp.aviso_1_at
          AND r.team_id = rp.team_id
          AND r.race_distance_id = rp.race_distance_id
      )
    END AS importe
  ) cobro
  WHERE rp.race_id = p_race_id
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM races r WHERE r.id = p_race_id AND r.organizer_id = auth.uid())
    );
$$;

COMMENT ON FUNCTION public.resumen_recuperacion_pagos(uuid) IS
  'Detectadas, avisadas, recuperadas e importe rescatado de una carrera.';

GRANT EXECUTE ON FUNCTION public.resumen_recuperacion_pagos(uuid) TO authenticated;
