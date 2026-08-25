-- CESIÓN DE DORSAL — cambio de titular de una inscripción
--
-- El problema real: hoy esto pasa por WhatsApp entre particulares, y el
-- organizador acaba con alguien en meta que no es quien figura en el seguro.
-- No falta una tabla: falta un camino oficial que sea MÁS CÓMODO que el
-- WhatsApp, porque si no lo es, nadie lo usa y seguimos igual.
--
-- LA DECISIÓN DE DISEÑO CENTRAL: la plaza ES la fila de registrations, así
-- que ceder es un UPDATE de identidad sobre la MISMA fila. Nunca cancelar y
-- reinscribir, porque:
--   · assign_next_bib no recicla dorsales (20260716200000:13-18): el nuevo
--     titular recibiría un número distinto del que ya está impreso.
--   · seis tablas hijas cuelgan de registrations.id.
--   · get_organizer_race_summary filtra status <> 'cancelled', así que
--     cancelar borraría ese cobro del informe del organizador.
--
-- Se reescriben 17 columnas de identidad más race_category_id recalculado.
-- NO se tocan: id, bib_number, chip_code, status, payment_status, source,
-- coupon_id, coupon_discount, team_discount, external_id, created_at, ni el
-- payment_intent original.
--
-- DECISIONES DE PRODUCTO TOMADAS (25-ago-2026):
--   1. v1 SIN COBRAR. La columna de tasa existe y queda a 0; el cobro es una
--      segunda entrega, porque es lo único que obliga a tocar el camino del
--      dinero y exige antes blindar las columnas de registrations.
--   2. Camberas NO intermedia el dinero de la inscripción entre particulares.
--      Se muestra lo que pagó el cedente como referencia y se lo apañan ellos.
--      Motivo: en toda la plataforma no existe una sola devolución automática.
--   3. Fecha límite absoluta por carrera, independiente de la de cancelación
--      (así lo escriben los organizadores: Peña Prieta permite cancelar hasta
--      el 15-sep y cambiar titular hasta el 20-sep), y UNA sola cesión por
--      dorsal, para no montar un mercado secundario.
--   4. Los suplementos con importe SE PREGUNTAN al que recibe. Si su respuesta
--      coincide, se hereda; si difiere, la cesión por autoservicio SE PARA y
--      se le manda a la organización. El caso que importa es el seguro de día:
--      un federado que cede a un no federado dejaría al nuevo corriendo sin
--      el seguro que nadie ha pagado, que es justo el problema a resolver.
--
-- FUERA DE ESTA ENTREGA, dicho explícitamente: plazas de equipo, inscripciones
-- importadas de uno.es (eventbooking-sync las deshace), devoluciones, cambio
-- de recorrido dentro de la cesión y cobro de diferencias de tarifa.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Política de cesión, por carrera
-- ═════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.race_cesion_config (
  race_id             uuid PRIMARY KEY REFERENCES public.races(id) ON DELETE CASCADE,
  -- Apagado por defecto: si el organizador no lo enciende, para él no cambia nada
  permitida           boolean NOT NULL DEFAULT false,
  -- Fecha límite absoluta. Si es NULL, vale hasta la fecha de la carrera.
  fecha_limite        timestamptz,
  -- v1: siempre 0. La columna existe para no tener que migrar cuando se cobre.
  tasa                numeric NOT NULL DEFAULT 0 CHECK (tasa >= 0),
  quien_paga_tasa     text NOT NULL DEFAULT 'cesionario'
                        CHECK (quien_paga_tasa IN ('cesionario', 'cedente')),
  max_cesiones        integer NOT NULL DEFAULT 1 CHECK (max_cesiones >= 1),
  -- Creada sin interfaz a propósito: en la v1 al organizador solo se le avisa.
  -- Existe porque en carreras federadas puede ser requisito de su normativa.
  requiere_aprobacion boolean NOT NULL DEFAULT false,
  texto_extra         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.race_cesion_config IS
  'Política de cesión de dorsal de una carrera. No se apoya en race_cancellation_tiers: son cosas distintas y se escriben distinto en la vida real.';

ALTER TABLE public.race_cesion_config ENABLE ROW LEVEL SECURITY;

-- Lectura pública: hace falta para pintar el apartado del reglamento
DROP POLICY IF EXISTS "cesion_config_lectura_publica" ON public.race_cesion_config;
CREATE POLICY "cesion_config_lectura_publica"
  ON public.race_cesion_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "cesion_config_escritura_gestor" ON public.race_cesion_config;
CREATE POLICY "cesion_config_escritura_gestor"
  ON public.race_cesion_config FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.races r
               WHERE r.id = race_cesion_config.race_id AND r.organizer_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.races r
               WHERE r.id = race_cesion_config.race_id AND r.organizer_id = auth.uid())
  );

GRANT SELECT ON public.race_cesion_config TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.race_cesion_config TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. El acta: una fila por cesión
-- ═════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cesiones_dorsal (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- El enlace que se manda por WhatsApp lleva este token
  token               uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  -- SET NULL y no CASCADE: el borrado del panel es un DELETE real, y el acta
  -- tiene que sobrevivir justo cuando hace falta
  registration_id     uuid REFERENCES public.registrations(id) ON DELETE SET NULL,
  race_id             uuid REFERENCES public.races(id) ON DELETE SET NULL,
  race_distance_id    uuid REFERENCES public.race_distances(id) ON DELETE SET NULL,
  dorsal              integer,

  estado              text NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente','datos_completos','completada','caducada','anulada')),

  -- Quién cede
  cedente_user_id     uuid,
  cedente_email       text,
  cedente_nombre      text,
  -- Copia congelada de las 17 columnas de identidad y de TODAS sus respuestas
  -- del formulario. Este es el rastro de quién figuraba en el seguro.
  titular_anterior    jsonb NOT NULL,

  -- Quién recibe
  cesionario_email    text,
  datos_nuevos        jsonb,
  respuestas_nuevas   jsonb,
  -- Tutor, solo si el cesionario es menor de edad
  tutor               jsonb,

  -- Consentimiento, con la versión exacta del reglamento aceptada
  reglamento_id       uuid,
  reglamento_version  integer,
  acepta_reglamento_at timestamptz,
  acepta_privacidad_at timestamptz,

  tasa                numeric NOT NULL DEFAULT 0,
  importe_referencia  numeric,

  creada_at           timestamptz NOT NULL DEFAULT now(),
  caduca_at           timestamptz NOT NULL,
  completada_at       timestamptz,
  anulada_at          timestamptz,
  motivo_anulacion    text,
  -- Acta autosuficiente: lleva dentro carrera, fecha, recorrido, dorsal e
  -- identidades copiadas, no referenciadas. Si se borra la carrera, sigue valiendo.
  acta                jsonb
);

COMMENT ON TABLE public.cesiones_dorsal IS
  'Acta de cambio de titular de un dorsal. Las filas completadas son inmutables.';

-- Una sola cesión viva por inscripción
CREATE UNIQUE INDEX IF NOT EXISTS cesiones_dorsal_viva_uk
  ON public.cesiones_dorsal (registration_id)
  WHERE estado IN ('pendiente', 'datos_completos');

CREATE INDEX IF NOT EXISTS cesiones_dorsal_race_idx ON public.cesiones_dorsal (race_id);

ALTER TABLE public.cesiones_dorsal ENABLE ROW LEVEL SECURITY;

-- Ninguna política de INSERT/UPDATE/DELETE: todo entra por RPC
DROP POLICY IF EXISTS "cesiones_lectura" ON public.cesiones_dorsal;
CREATE POLICY "cesiones_lectura"
  ON public.cesiones_dorsal FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    -- El cedente solo ve su cesion mientras esta VACIA. En cuanto el otro
    -- rellena, datos_nuevos, tutor y acta son datos de un tercero: su DNI, su
    -- direccion, su telefono, y los del tutor si es menor. Que cedas un dorsal
    -- no te da derecho a la ficha de quien lo recibe.
    OR (cedente_user_id = auth.uid() AND estado = 'pendiente')
    OR EXISTS (SELECT 1 FROM public.races r
               WHERE r.id = cesiones_dorsal.race_id AND r.organizer_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Lo que convierte el registro en acta y no en un apunte editable
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cesiones_dorsal_inmutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.estado <> 'completada' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Un acta sellada no se edita ni se borra. La UNICA excepcion es el
  -- ON DELETE SET NULL de las tres FK de arriba: PostgreSQL lo ejecuta como un
  -- UPDATE normal sobre esta tabla, que dispara este mismo trigger. Sin esta
  -- salida, una sola cesion completada dejaria la inscripcion, la carrera y el
  -- recorrido IMPOSIBLES de borrar desde el panel — y en el borrado en lote
  -- reventaria la operacion entera sin decir cual de las filas tiene la culpa.
  -- No es una edicion del acta: es el acta desenganchandose de algo que se
  -- borra, que es justo para lo que se declararon SET NULL. Se exige que no
  -- cambie NADA mas y que las FK solo puedan ir a NULL, nunca a otro id.
  IF TG_OP = 'UPDATE' THEN
    IF to_jsonb(NEW) - 'registration_id' - 'race_id' - 'race_distance_id'
         = to_jsonb(OLD) - 'registration_id' - 'race_id' - 'race_distance_id'
       AND (NEW.registration_id  IS NULL OR NEW.registration_id  IS NOT DISTINCT FROM OLD.registration_id)
       AND (NEW.race_id          IS NULL OR NEW.race_id          IS NOT DISTINCT FROM OLD.race_id)
       AND (NEW.race_distance_id IS NULL OR NEW.race_distance_id IS NOT DISTINCT FROM OLD.race_distance_id)
    THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'Una cesión completada no se puede modificar ni borrar (acta %)', OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS cesiones_dorsal_inmutable_trg ON public.cesiones_dorsal;
CREATE TRIGGER cesiones_dorsal_inmutable_trg
  BEFORE UPDATE OR DELETE ON public.cesiones_dorsal
  FOR EACH ROW EXECUTE FUNCTION public.cesiones_dorsal_inmutable();

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Categoría del nuevo titular
--
-- No existía nada equivalente: get_race_category (20251230002124) devuelve el
-- NOMBRE en text y resuelve por race_id, así que no sirve para escribir
-- registrations.race_category_id. Esta es su hermana: devuelve el id y filtra
-- también por recorrido.
--
-- Devolver NULL es significativo: quiere decir que esa persona no encaja en
-- ninguna categoría del recorrido por su edad o su sexo, y eso PARA la cesión.
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resolver_race_category_id(
  p_race_distance_id uuid,
  p_birth_date       date,
  p_gender           text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_race_id   uuid;
  v_race_date date;
  v_ref       text;
  v_edad      integer;
  v_sexo      text;
  v_id        uuid;
BEGIN
  IF p_birth_date IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT d.race_id, r.date, r.category_age_reference
    INTO v_race_id, v_race_date, v_ref
  FROM race_distances d
  JOIN races r ON r.id = d.race_id
  WHERE d.id = p_race_distance_id;

  IF v_race_date IS NULL THEN
    RETURN NULL;
  END IF;

  -- Misma referencia de edad que get_race_category, para no tener dos verdades
  IF v_ref = 'year_end' THEN
    v_edad := EXTRACT(YEAR FROM v_race_date) - EXTRACT(YEAR FROM p_birth_date);
  ELSE
    v_edad := EXTRACT(YEAR FROM age(v_race_date, p_birth_date));
  END IF;

  v_sexo := CASE
    WHEN p_gender IN ('Masculino', 'M', 'Male', 'masculino') THEN 'M'
    WHEN p_gender IN ('Femenino', 'F', 'Female', 'femenino')  THEN 'F'
    ELSE NULL
  END;

  SELECT rc.id INTO v_id
  FROM race_categories rc
  WHERE rc.race_id = v_race_id
    -- Las categorías del recorrido, más las generales de la carrera
    AND (rc.race_distance_id IS NULL OR rc.race_distance_id = p_race_distance_id)
    AND (rc.gender IS NULL OR rc.gender = v_sexo)
    AND (rc.min_age IS NULL OR v_edad >= rc.min_age)
    AND (rc.max_age IS NULL OR v_edad <= rc.max_age)
  ORDER BY
    -- Primero la del recorrido, luego la que define sexo, luego el orden puesto
    CASE WHEN rc.race_distance_id IS NOT NULL THEN 0 ELSE 1 END,
    CASE WHEN rc.gender IS NOT NULL THEN 0 ELSE 1 END,
    rc.display_order
  LIMIT 1;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.resolver_race_category_id(uuid, date, text) IS
  'Categoría (id) que corresponde a una edad y sexo en un recorrido. NULL si no encaja en ninguna.';

REVOKE EXECUTE ON FUNCTION public.resolver_race_category_id(uuid, date, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resolver_race_category_id(uuid, date, text) TO authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 4. Hora real de salida
--
-- "La carrera ya empezó" NO se puede decidir con races.date, que es un DATE:
-- con eso, una cesión podría completarse con la gente corriendo. La hora vive
-- en race_waves.start_time, y este es el mismo patrón que ya usa
-- gps_capture_window (20260803100000:38-47).
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.hora_salida_recorrido(p_distance_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
           w.start_time,
           (r.date::text || ' 23:59')::timestamp AT TIME ZONE 'Europe/Madrid'
         )
  FROM race_distances d
  JOIN races r ON r.id = d.race_id
  LEFT JOIN race_waves w ON w.race_distance_id = d.id
  WHERE d.id = p_distance_id
  ORDER BY w.start_time NULLS LAST
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.hora_salida_recorrido(uuid) IS
  'Hora de salida del recorrido (oleada), o el final del día de carrera si no hay oleada.';

GRANT EXECUTE ON FUNCTION public.hora_salida_recorrido(uuid) TO anon, authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 5. cesion_crear — el cedente abre la puerta
--
-- Toda la validación vive AQUÍ, en servidor. No se repite el error de la
-- política de cancelación, que decide en el navegador (Dashboard.tsx:122-137)
-- mientras RLS deja al usuario poner status='cancelled' cuando le apetece.
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cesion_crear(p_registration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg     registrations%ROWTYPE;
  v_race    races%ROWTYPE;
  v_cfg     race_cesion_config%ROWTYPE;
  v_limite  timestamptz;
  v_hechas  integer;
  v_id      uuid;
  v_token   uuid;
  v_caduca  timestamptz;
  v_importe numeric;
  v_snap    jsonb;
BEGIN
  SELECT * INTO v_reg FROM registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe');
  END IF;

  SELECT * INTO v_race FROM races WHERE id = v_reg.race_id;

  -- ── Quién puede abrirla ──────────────────────────────────────────────
  -- Con sesión: el titular, un admin o el organizador dueño.
  -- Sin sesión solo llega service_role, que es la edge function del cedente
  -- sin cuenta, y esa valida el email por su lado antes de llamar.
  IF auth.uid() IS NOT NULL
     AND v_reg.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin')
     AND v_race.organizer_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_es_tuya');
  END IF;

  -- ── ¿La carrera lo permite? ──────────────────────────────────────────
  SELECT * INTO v_cfg FROM race_cesion_config WHERE race_id = v_reg.race_id;
  IF NOT FOUND OR NOT v_cfg.permitida THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_permitida');
  END IF;

  -- Plazo: la fecha que puso el organizador, o como muy tarde la salida
  v_limite := LEAST(
    COALESCE(v_cfg.fecha_limite, 'infinity'::timestamptz),
    public.hora_salida_recorrido(v_reg.race_distance_id)
  );
  IF now() >= v_limite THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fuera_de_plazo',
                              'limite', v_limite);
  END IF;

  -- ── ¿Es una inscripción cedible? ─────────────────────────────────────
  IF v_reg.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cancelada');
  END IF;
  IF v_reg.payment_status NOT IN ('paid', 'not_required') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_pagar');
  END IF;
  -- Fuera de la v1: los lotes de equipo arrastran team_members, que guarda su
  -- propia copia de la identidad, y las importadas las deshace eventbooking-sync
  IF v_reg.team_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'es_de_equipo');
  END IF;
  IF v_reg.external_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'es_importada');
  END IF;

  -- Nadie cede una plaza que ya ha corrido. Esto es lo que impide reescribir
  -- el histórico a posteriori para tapar un problema en meta, y va SIEMPRE,
  -- sea cual sea el plazo configurado.
  IF EXISTS (SELECT 1 FROM timing_readings t WHERE t.registration_id = p_registration_id)
     OR EXISTS (SELECT 1 FROM race_results rr WHERE rr.registration_id = p_registration_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ya_ha_corrido');
  END IF;

  -- ── ¿Queda cupo de cesiones? ─────────────────────────────────────────
  SELECT count(*) INTO v_hechas
  FROM cesiones_dorsal
  WHERE registration_id = p_registration_id AND estado = 'completada';
  IF v_hechas >= v_cfg.max_cesiones THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tope_alcanzado',
                              'max', v_cfg.max_cesiones);
  END IF;

  -- Cerrar antes las vencidas. Nadie mas escribe 'caducada' —no hay ningun
  -- job— y el indice unico parcial cubre 'pendiente' y 'datos_completos', asi
  -- que un enlace que nadie abrio en 72 h dejaria el dorsal ATASCADO: no se
  -- podria crear otra cesion y la vieja ya no valdria. Se dispara con
  -- seguridad con el primer enlace que se ignore.
  UPDATE cesiones_dorsal
     SET estado = 'caducada'
   WHERE registration_id = p_registration_id
     AND estado IN ('pendiente', 'datos_completos')
     AND caduca_at <= now();

  -- ¿Ya hay una viva? Se devuelve esa, no se crea otra
  SELECT id, token, caduca_at INTO v_id, v_token, v_caduca
  FROM cesiones_dorsal
  WHERE registration_id = p_registration_id
    AND estado IN ('pendiente', 'datos_completos')
    AND caduca_at > now();
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'token', v_token,
                              'caduca_at', v_caduca, 'reutilizada', true);
  END IF;

  -- ── Congelar quién figuraba hasta ahora ──────────────────────────────
  -- Las 17 columnas de identidad MÁS todas sus respuestas del formulario.
  -- Este es el rastro de quién constaba en el seguro.
  v_snap := jsonb_build_object(
    'user_id', v_reg.user_id, 'first_name', v_reg.first_name, 'last_name', v_reg.last_name,
    'email', v_reg.email, 'phone', v_reg.phone, 'dni_passport', v_reg.dni_passport,
    'birth_date', v_reg.birth_date, 'gender', v_reg.gender, 'gender_id', v_reg.gender_id,
    'address', v_reg.address, 'city', v_reg.city, 'province', v_reg.province,
    'autonomous_community', v_reg.autonomous_community, 'country', v_reg.country,
    'club', v_reg.club, 'team', v_reg.team, 'tshirt_size', v_reg.tshirt_size,
    'race_category_id', v_reg.race_category_id,
    'respuestas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('field_id', rr.field_id, 'field_value', rr.field_value))
      FROM registration_responses rr WHERE rr.registration_id = p_registration_id
    ), '[]'::jsonb)
  );

  -- Lo que pagó, solo como referencia informativa: Camberas no mueve ese dinero
  SELECT pi.amount INTO v_importe
  FROM payment_intents pi
  WHERE pi.registration_id = p_registration_id AND pi.status = 'completed'
  ORDER BY pi.completed_at DESC NULLS LAST LIMIT 1;

  v_caduca := LEAST(now() + interval '72 hours', v_limite);

  INSERT INTO cesiones_dorsal (
    registration_id, race_id, race_distance_id, dorsal,
    cedente_user_id, cedente_email, cedente_nombre, titular_anterior,
    tasa, importe_referencia, caduca_at
  ) VALUES (
    p_registration_id, v_reg.race_id, v_reg.race_distance_id, v_reg.bib_number,
    v_reg.user_id, v_reg.email, v_reg.first_name, v_snap,
    v_cfg.tasa, v_importe, v_caduca
  )
  RETURNING id, token INTO v_id, v_token;

  RETURN jsonb_build_object(
    'ok', true, 'token', v_token, 'caduca_at', v_caduca,
    'tasa', v_cfg.tasa, 'importe_referencia', v_importe
  );
END;
$$;

COMMENT ON FUNCTION public.cesion_crear(uuid) IS
  'Abre una cesión de dorsal y devuelve el token del enlace. Valida todo en servidor.';

REVOKE EXECUTE ON FUNCTION public.cesion_crear(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cesion_crear(uuid) TO authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 6. cesion_info — lo que ve quien abre el enlace desde WhatsApp
--
-- Solo lo justo para decidir: qué hereda y qué tiene que rellenar. Del
-- cedente, únicamente el nombre de pila. Nunca su email, su teléfono ni su DNI.
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cesion_info(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c        cesiones_dorsal%ROWTYPE;
  v_race   races%ROWTYPE;
  v_dist   race_distances%ROWTYPE;
  v_estado text;
  v_choque boolean := false;
  v_serv   jsonb;
BEGIN
  SELECT * INTO c FROM cesiones_dorsal WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'no_existe');
  END IF;

  SELECT * INTO v_race FROM races          WHERE id = c.race_id;
  SELECT * INTO v_dist FROM race_distances WHERE id = c.race_distance_id;

  v_estado := CASE
    WHEN c.estado = 'completada'                    THEN 'completada'
    WHEN c.estado = 'anulada'                       THEN 'anulada'
    WHEN c.estado = 'caducada'                      THEN 'caducado'
    WHEN c.caduca_at <= now()                       THEN 'caducado'
    WHEN now() >= public.hora_salida_recorrido(c.race_distance_id) THEN 'cerrado'
    -- Se comprueba otra vez: entre crear el enlace y abrirlo pueden haberle
    -- fichado en un control, y entonces ya no hay nada que ceder
    WHEN EXISTS (SELECT 1 FROM timing_readings t WHERE t.registration_id = c.registration_id)
      OR EXISTS (SELECT 1 FROM race_results rr WHERE rr.registration_id = c.registration_id)
                                                    THEN 'ya_ha_corrido'
    ELSE 'ok'
  END;

  -- Lo que ya está pagado y hereda: los campos del formulario con importe
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'field_id', f.id, 'etiqueta', f.field_label, 'valor', rr.field_value)), '[]'::jsonb)
    INTO v_serv
  FROM registration_responses rr
  JOIN registration_form_fields f ON f.id = rr.field_id
  WHERE rr.registration_id = c.registration_id
    AND (f.field_options->>'fee_enabled')::boolean IS TRUE
    AND COALESCE(rr.field_value, '') <> '';

  -- Aviso temprano del choque con UNIQUE(user_id, race_id): ese constraint no
  -- distingue estado, así que ni siquiera una cancelada deja sitio. Mejor
  -- decirlo ANTES de que rellene el formulario entero.
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM registrations r
      WHERE r.user_id = auth.uid() AND r.race_id = c.race_id
        AND r.id IS DISTINCT FROM c.registration_id
    ) INTO v_choque;
  END IF;

  RETURN jsonb_build_object(
    'estado',             v_estado,
    'race_name',          v_race.name,
    'race_slug',          v_race.slug,
    'race_date',          v_race.date,
    'race_location',      v_race.location,
    'race_id',            v_race.id,
    'distance_name',      v_dist.name,
    'race_distance_id',   c.race_distance_id,
    'dorsal',             c.dorsal,
    'cedente_nombre',     c.cedente_nombre,
    'tasa',               c.tasa,
    'importe_referencia', c.importe_referencia,
    'caduca_at',          c.caduca_at,
    'servicios',          COALESCE(v_serv, '[]'::jsonb),
    'ya_inscrito',        v_choque
  );
END;
$$;

COMMENT ON FUNCTION public.cesion_info(uuid) IS
  'Datos públicos de un enlace de cesión, por token. Sin datos personales del cedente.';

-- La abre quien recibe el WhatsApp, tenga cuenta o no
GRANT EXECUTE ON FUNCTION public.cesion_info(uuid) TO anon, authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 7. cesion_ejecutar — el traspaso, todo en una transacción
--
-- Solo servidor: la llama cesion_aceptar por dentro (y, cuando haya cobro,
-- el webhook). Ningún cliente la alcanza.
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cesion_ejecutar(p_cesion_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c        cesiones_dorsal%ROWTYPE;
  v_reg    registrations%ROWTYPE;
  d        jsonb;
  v_race   races%ROWTYPE;
  v_dist   race_distances%ROWTYPE;
  v_cat    uuid;
  v_uid    uuid;
  v_nombre text;
BEGIN
  SELECT * INTO c FROM cesiones_dorsal WHERE id = p_cesion_id FOR UPDATE;
  IF NOT FOUND OR c.estado <> 'datos_completos' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'estado_incorrecto');
  END IF;

  -- La plaza otra vez, y bajo llave. Entre abrir la cesion y este momento
  -- pueden pasar 72 horas, y el cedente puede cancelar su inscripcion desde su
  -- panel por RLS, sin pasar por ninguna RPC. Las comprobaciones de
  -- cesion_crear valian para ABRIR la cesion; estas valen para EJECUTARLA, que
  -- es cuando se escribe. El FOR UPDATE es ademas lo unico que serializa
  -- contra esa cancelacion concurrente.
  SELECT * INTO v_reg FROM registrations WHERE id = c.registration_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'inscripcion_no_existe');
  END IF;
  IF v_reg.status = 'cancelled'
     OR v_reg.payment_status NOT IN ('paid', 'not_required')
     OR v_reg.team_id IS NOT NULL
     OR v_reg.external_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'inscripcion_ya_no_es_cedible');
  END IF;

  d := c.datos_nuevos;
  SELECT * INTO v_race FROM races          WHERE id = c.race_id;
  SELECT * INTO v_dist FROM race_distances WHERE id = c.race_distance_id;

  v_cat := public.resolver_race_category_id(
    c.race_distance_id, (d->>'birth_date')::date, d->>'gender');

  -- Si el cesionario ya tiene otra inscripción en esta carrera, chocaría con
  -- UNIQUE(user_id, race_id). Se completa con user_id NULL: la inscripción es
  -- suya igual, pero la gestiona por email en vez de desde su cuenta. Es peor
  -- que nada, pero infinitamente mejor que reventar con el traspaso a medias.
  v_uid := NULLIF(d->>'user_id', '')::uuid;
  IF v_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM registrations r
    WHERE r.user_id = v_uid AND r.race_id = c.race_id
      AND r.id IS DISTINCT FROM c.registration_id
  ) THEN
    v_uid := NULL;
  END IF;

  -- ── El cambio de titular ─────────────────────────────────────────────
  UPDATE registrations SET
    user_id              = v_uid,
    first_name           = d->>'first_name',
    last_name            = d->>'last_name',
    email                = lower(d->>'email'),
    phone                = d->>'phone',
    dni_passport         = d->>'dni_passport',
    birth_date           = NULLIF(d->>'birth_date', '')::date,
    gender               = d->>'gender',
    gender_id            = CASE
                             WHEN d->>'gender' IN ('Masculino','M','Male','masculino') THEN 1
                             WHEN d->>'gender' IN ('Femenino','F','Female','femenino')  THEN 2
                             ELSE 3 END,
    address              = d->>'address',
    city                 = d->>'city',
    province             = d->>'province',
    autonomous_community = d->>'autonomous_community',
    country              = d->>'country',
    club                 = d->>'club',
    team                 = d->>'team',
    tshirt_size          = d->>'tshirt_size',
    race_category_id     = COALESCE(v_cat, race_category_id),
    updated_at           = now()
  WHERE id = c.registration_id;

  -- ── Respuestas del formulario ────────────────────────────────────────
  -- Se borran TODAS menos las que llevan importe, y se meten las nuevas. La
  -- regla va al revés de lo intuitivo a propósito: el contacto de emergencia,
  -- las alergias o el grupo sanguíneo NO son campos de sistema, viven como
  -- campo personalizado del organizador, y quedarse con los del que no corre
  -- es exactamente lo que arruina la defensa ante la aseguradora.
  -- Las de importe se conservan porque su valor está firmado en el cobro:
  -- tocarlas descuadraría lo ya pagado.
  DELETE FROM registration_responses rr
  USING registration_form_fields f
  WHERE rr.registration_id = c.registration_id
    AND f.id = rr.field_id
    AND (f.field_options->>'fee_enabled')::boolean IS DISTINCT FROM true;

  INSERT INTO registration_responses (registration_id, field_id, field_value)
  SELECT c.registration_id, (e->>'field_id')::uuid, e->>'field_value'
  FROM jsonb_array_elements(COALESCE(c.respuestas_nuevas, '[]'::jsonb)) e
  WHERE (e->>'field_id') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM registration_form_fields f
      WHERE f.id = (e->>'field_id')::uuid
        AND (f.field_options->>'fee_enabled')::boolean IS DISTINCT FROM true
    );

  -- ── El nombre que sale en el mapa y en la tele ───────────────────────
  -- gps_tokens no cuelga de registrations: guarda bib_number y el nombre
  -- COPIADO, y en dos sitios (participant_name y name_tv, este último es el
  -- que rotulan los overlays de retransmisión). Sin esto, la televisión
  -- rotularía al que no corre.
  -- No se revoca ni se regenera el token: eso invalidaría el QR ya impreso.
  -- El traspaso del QR al móvil del cesionario ya lo resuelve link_gps_token
  -- con needs_transfer.
  v_nombre := trim(COALESCE(d->>'first_name','') || ' ' || COALESCE(d->>'last_name',''));
  UPDATE gps_tokens t
  SET participant_name = v_nombre,
      name_tv          = CASE WHEN t.name_tv IS NOT NULL THEN upper(v_nombre) ELSE t.name_tv END,
      email            = lower(d->>'email'),
      phone            = d->>'phone'
  WHERE t.bib_number::text = c.dorsal::text
    AND t.event_id::text = c.race_distance_id::text;

  -- Si tenía un aviso de pago a medias abierto, se cierra: ya no va con ella
  UPDATE recuperacion_pagos
  SET recuperado_at = now()
  WHERE registration_id = c.registration_id AND recuperado_at IS NULL;

  -- ── Sellar el acta ───────────────────────────────────────────────────
  UPDATE cesiones_dorsal SET
    estado        = 'completada',
    completada_at = now(),
    acta = jsonb_build_object(
      'carrera',              v_race.name,
      'fecha_carrera',        v_race.date,
      'lugar',                v_race.location,
      'recorrido',            v_dist.name,
      'dorsal',               c.dorsal,
      'cede',                 c.titular_anterior,
      'recibe',               c.datos_nuevos,
      'tutor',                c.tutor,
      'reglamento_id',        c.reglamento_id,
      'reglamento_version',   c.reglamento_version,
      'acepta_reglamento_at', c.acepta_reglamento_at,
      'acepta_privacidad_at', c.acepta_privacidad_at,
      'tasa',                 c.tasa,
      'sellada_at',           now(),
      'user_id_final',        v_uid
    )
  WHERE id = p_cesion_id;

  RETURN jsonb_build_object('ok', true, 'dorsal', c.dorsal, 'sin_cuenta', (v_uid IS NULL));
END;
$$;

COMMENT ON FUNCTION public.cesion_ejecutar(uuid) IS
  'Ejecuta el traspaso de titular de forma atómica y sella el acta. Solo servidor.';

REVOKE EXECUTE ON FUNCTION public.cesion_ejecutar(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cesion_ejecutar(uuid) TO service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 8. cesion_aceptar — el que recibe rellena sus datos
--
-- El token es la credencial, como en /retomar-pago: quien recibe el WhatsApp
-- puede no tener cuenta, y obligarle a crearse una es la forma más rápida de
-- que vuelva al WhatsApp de siempre.
--
-- Aquí es donde se para todo lo que no debe seguir, y se para ANTES de tocar
-- la inscripción: categoría que no encaja, menor de edad sin tutor, suplemento
-- distinto del pagado, o alguien que ya está inscrito en esa carrera.
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cesion_aceptar(
  p_token              uuid,
  p_datos              jsonb,
  p_respuestas         jsonb DEFAULT '[]'::jsonb,
  p_acepta_reglamento  boolean DEFAULT false,
  p_acepta_privacidad  boolean DEFAULT false,
  p_tutor              jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c          cesiones_dorsal%ROWTYPE;
  v_race     races%ROWTYPE;
  v_nac      date;
  v_edad     integer;
  v_cat      uuid;
  v_reg_id   uuid;
  v_reg_ver  integer;
  v_distinto text;
  v_dni      text;
BEGIN
  SELECT * INTO c FROM cesiones_dorsal WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe');
  END IF;
  IF c.estado NOT IN ('pendiente', 'datos_completos') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'estado_' || c.estado);
  END IF;
  IF c.caduca_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'caducado');
  END IF;
  IF now() >= public.hora_salida_recorrido(c.race_distance_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cerrado');
  END IF;
  IF EXISTS (SELECT 1 FROM timing_readings t WHERE t.registration_id = c.registration_id)
     OR EXISTS (SELECT 1 FROM race_results rr WHERE rr.registration_id = c.registration_id) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ya_ha_corrido');
  END IF;

  SELECT * INTO v_race FROM races WHERE id = c.race_id;

  -- ── Consentimiento ───────────────────────────────────────────────────
  -- Es la diferencia real con el WhatsApp: aquí alguien acepta el reglamento
  -- de su propia mano y queda registrado con qué versión exacta.
  IF NOT p_acepta_reglamento OR NOT p_acepta_privacidad THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'falta_consentimiento');
  END IF;

  -- ── Datos mínimos ────────────────────────────────────────────────────
  IF COALESCE(p_datos->>'first_name','') = ''
     OR COALESCE(p_datos->>'last_name','') = ''
     OR COALESCE(p_datos->>'email','') = ''
     OR COALESCE(p_datos->>'birth_date','') = ''
     OR COALESCE(p_datos->>'gender','') = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'faltan_datos');
  END IF;

  v_nac := (p_datos->>'birth_date')::date;
  -- Para el tutor manda la edad REAL el día de la carrera, no la referencia
  -- de categoría de la carrera: es una cuestión legal, no deportiva.
  v_edad := EXTRACT(YEAR FROM age(v_race.date, v_nac));

  -- ── Menores ──────────────────────────────────────────────────────────
  -- Todo esto se apoya en que el cesionario acepta de su propia mano. Un
  -- menor de 14 no puede prestar ese consentimiento (RGPD art. 8 y LOPDGDD
  -- art. 7), así que el autoservicio no vale y tiene que hacerlo la
  -- organización con la documentación delante. Entre 14 y 17 firma el tutor.
  IF v_edad < 14 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'menor_de_14');
  END IF;
  IF v_edad < 18 THEN
    IF p_tutor IS NULL
       OR COALESCE(p_tutor->>'nombre','') = ''
       OR COALESCE(p_tutor->>'dni','') = ''
       OR COALESCE(p_tutor->>'telefono','') = ''
       OR COALESCE(p_tutor->>'email','') = ''
       OR (p_tutor->>'acepta')::boolean IS DISTINCT FROM true THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'falta_tutor', 'edad', v_edad);
    END IF;
  END IF;

  -- ── Categoría ────────────────────────────────────────────────────────
  -- Si su edad o su sexo no encajan en ninguna categoría del recorrido, la
  -- cesión no puede seguir. La edad mínima real vive aquí, en
  -- race_categories.min_age: no existe race_distances.min_age.
  v_cat := public.resolver_race_category_id(c.race_distance_id, v_nac, p_datos->>'gender');
  IF v_cat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_categoria');
  END IF;

  -- ── Suplementos con importe ──────────────────────────────────────────
  -- Decisión de producto: se le preguntan, y si su respuesta difiere de la
  -- que se pagó, la cesión por autoservicio SE PARA. El caso que importa es
  -- el seguro de día: heredarlo a ciegas dejaría al nuevo corriendo sin el
  -- seguro que le corresponde, que es justo el problema a resolver.
  -- LEFT JOIN y no INNER, y a proposito: con INNER solo se comparaban los
  -- campos que el CEDENTE contesto. El caso que mas duele es justo el
  -- contrario — el cedente iba federado y no marco el seguro de dia, el
  -- cesionario si lo necesita: no habia fila que comparar, la cesion pasaba
  -- limpia y el nuevo corria sin seguro. Que es exactamente lo que esto venia
  -- a evitar. Se recorre el FORMULARIO, no las respuestas.
  SELECT string_agg(DISTINCT f.field_label, ', ')
    INTO v_distinto
  FROM registration_form_fields f
  LEFT JOIN registration_responses rr
    ON rr.field_id = f.id AND rr.registration_id = c.registration_id
  WHERE (f.field_options->>'fee_enabled')::boolean IS TRUE
    AND (f.race_distance_id = c.race_distance_id
         OR (f.race_distance_id IS NULL AND f.race_id = c.race_id))
    AND COALESCE(rr.field_value, '') IS DISTINCT FROM COALESCE((
      SELECT e->>'field_value'
      FROM jsonb_array_elements(COALESCE(p_respuestas, '[]'::jsonb)) e
      WHERE (e->>'field_id')::uuid = f.id
      LIMIT 1
    ), '');

  IF v_distinto IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'suplemento_distinto',
                              'campos', v_distinto);
  END IF;

  -- ── ¿Ya está inscrito en esta carrera? ───────────────────────────────
  -- Por DNI normalizado y por email, y contra TODA la carrera, no solo el
  -- recorrido: no hay índice único por dni_passport que lo impida.
  v_dni := upper(regexp_replace(COALESCE(p_datos->>'dni_passport',''), '[^A-Za-z0-9]', '', 'g'));
  IF EXISTS (
    SELECT 1 FROM registrations r
    WHERE r.race_id = c.race_id
      AND r.id IS DISTINCT FROM c.registration_id
      AND r.status IS DISTINCT FROM 'cancelled'
      AND (
        lower(r.email) = lower(p_datos->>'email')
        OR (v_dni <> '' AND upper(regexp_replace(COALESCE(r.dni_passport,''), '[^A-Za-z0-9]', '', 'g')) = v_dni)
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ya_inscrito');
  END IF;

  -- ── Reglamento aceptado, con su versión ──────────────────────────────
  SELECT id, version INTO v_reg_id, v_reg_ver
  FROM race_regulations
  WHERE race_id = c.race_id AND published IS TRUE
  ORDER BY version DESC NULLS LAST
  LIMIT 1;

  UPDATE cesiones_dorsal SET
    estado               = 'datos_completos',
    cesionario_email     = lower(p_datos->>'email'),
    datos_nuevos         = p_datos || jsonb_build_object('user_id', auth.uid()),
    respuestas_nuevas    = COALESCE(p_respuestas, '[]'::jsonb),
    tutor                = p_tutor,
    reglamento_id        = v_reg_id,
    reglamento_version   = v_reg_ver,
    acepta_reglamento_at = now(),
    acepta_privacidad_at = now()
  WHERE id = c.id;

  -- v1 sin cobro: con tasa 0 se ejecuta aquí mismo y no hay pantalla de pago
  IF c.tasa <= 0 THEN
    RETURN public.cesion_ejecutar(c.id) || jsonb_build_object('siguiente', 'hecho');
  END IF;

  RETURN jsonb_build_object('ok', true, 'siguiente', 'pagar', 'tasa', c.tasa);
END;
$$;

COMMENT ON FUNCTION public.cesion_aceptar(uuid, jsonb, jsonb, boolean, boolean, jsonb) IS
  'El cesionario acepta la cesión con sus datos y su consentimiento. Con tasa 0 la ejecuta.';

-- El token es la credencial: quien recibe el enlace puede no tener cuenta
GRANT EXECUTE ON FUNCTION public.cesion_aceptar(uuid, jsonb, jsonb, boolean, boolean, jsonb)
  TO anon, authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 9. cesion_anular — arrepentirse antes de que sea firme
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cesion_anular(p_cesion_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c      cesiones_dorsal%ROWTYPE;
  v_race races%ROWTYPE;
BEGIN
  SELECT * INTO c FROM cesiones_dorsal WHERE id = p_cesion_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_existe');
  END IF;
  IF c.estado = 'completada' THEN
    -- El trigger de inmutabilidad lo impediría igual; mejor un mensaje claro
    RETURN jsonb_build_object('ok', false, 'motivo', 'ya_completada');
  END IF;

  SELECT * INTO v_race FROM races WHERE id = c.race_id;

  IF auth.uid() IS NOT NULL
     AND c.cedente_user_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin')
     AND v_race.organizer_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_es_tuya');
  END IF;

  UPDATE cesiones_dorsal
  SET estado = 'anulada', anulada_at = now(), motivo_anulacion = p_motivo
  WHERE id = p_cesion_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cesion_anular(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cesion_anular(uuid, text) TO authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- 10. Lo que ve el organizador
-- ═════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cesiones_carrera(p_race_id uuid)
RETURNS TABLE (
  id            uuid,
  estado        text,
  dorsal        integer,
  recorrido     text,
  cede          text,
  recibe        text,
  creada_at     timestamptz,
  completada_at timestamptz,
  tasa          numeric,
  reglamento_version integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.estado, c.dorsal, d.name,
         trim(COALESCE(c.titular_anterior->>'first_name','') || ' ' ||
              COALESCE(c.titular_anterior->>'last_name','')),
         trim(COALESCE(c.datos_nuevos->>'first_name','') || ' ' ||
              COALESCE(c.datos_nuevos->>'last_name','')),
         c.creada_at, c.completada_at, c.tasa, c.reglamento_version
  FROM cesiones_dorsal c
  LEFT JOIN race_distances d ON d.id = c.race_distance_id
  WHERE c.race_id = p_race_id
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM races r WHERE r.id = p_race_id AND r.organizer_id = auth.uid())
    )
  ORDER BY c.creada_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.cesiones_carrera(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cesiones_carrera(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resumen_cesiones(p_race_id uuid)
RETURNS TABLE (
  iniciadas   integer,
  completadas integer,
  caducadas   integer,
  tasas       numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE c.estado = 'completada')::integer,
    count(*) FILTER (WHERE c.estado = 'caducada' OR (c.estado <> 'completada' AND c.caduca_at <= now()))::integer,
    COALESCE(sum(c.tasa) FILTER (WHERE c.estado = 'completada'), 0)
  FROM cesiones_dorsal c
  WHERE c.race_id = p_race_id
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM races r WHERE r.id = p_race_id AND r.organizer_id = auth.uid())
    );
$$;

REVOKE EXECUTE ON FUNCTION public.resumen_cesiones(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.resumen_cesiones(uuid) TO authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════
-- Comprobación de permisos. Debería devolver exactamente esto:
--
--   cesion_aceptar               | t | t
--   cesion_anular                | f | t
--   cesion_crear                 | f | t
--   cesion_ejecutar              | f | f
--   cesion_info                  | t | t
--   cesiones_carrera             | f | t
--   hora_salida_recorrido        | t | t
--   resolver_race_category_id    | f | t
--   resumen_cesiones             | f | t
-- ═════════════════════════════════════════════════════════════════════════
SELECT p.proname                                                 AS funcion,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS con_sesion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('cesion_crear','cesion_info','cesion_aceptar','cesion_ejecutar',
                    'cesion_anular','cesiones_carrera','resumen_cesiones',
                    'resolver_race_category_id','hora_salida_recorrido')
ORDER BY p.proname;
