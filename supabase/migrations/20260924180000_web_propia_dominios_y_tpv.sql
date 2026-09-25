-- ============================================================
-- WEB PROPIA DE LA CARRERA: DOMINIOS, TPV DEL ORGANIZADOR Y evento_publico
-- (24-sep-2026, tras 20260924170000)
--
-- Objetivo: que camberas.com/{slug} sea la web de la carrera (plantilla con
-- libro de diseño), que se sirva también bajo el dominio del club
-- (desafio-sarrio.com → CNAME a Camberas) y que las inscripciones se cobren
-- en el TPV Redsys del organizador, con el dinero en su cuenta.
--
--  1) race_domains: hostname → carrera. Solo lo verifica el servidor.
--  2) race_tpv: comercio Redsys por carrera. La clave SHA-256 va al Vault,
--     nunca a la tabla. Las Edge Functions la leen con service_role; con
--     sesión de organizador solo se puede GUARDAR, no leer.
--  3) payment_intents recuerda con qué comercio se firmó cada pago, para que
--     el webhook verifique con esa clave aunque el organizador cambie de TPV.
--  4) RPCs públicas: evento_publico(slug) (el evento entero con la forma de
--     docs/eventos/evento.schema.json), carrera_por_dominio(hostname) y
--     estado_inscripcion_publica(id) para la página de vuelta del pago.
--  5) Entrada de menú «Web propia» en los paneles.
--
-- Editor SQL de Lovable: sentencias sueltas, cuerpos con $fn$ (no $$).
-- ============================================================

-- ── 1) Dominios ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.race_domains (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id       uuid NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  hostname      text NOT NULL UNIQUE,
  principal     boolean NOT NULL DEFAULT true,
  verificado    boolean NOT NULL DEFAULT false,
  verificado_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- minúsculas, sin "www." ni punto final, con TLD
  CONSTRAINT race_domains_hostname_formato CHECK (
    hostname = lower(hostname)
    AND hostname !~ '^www\.'
    AND hostname ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$'
  ),
  -- nunca un dominio de la propia plataforma o del hosting
  CONSTRAINT race_domains_hostname_ajeno CHECK (
    hostname !~ '(^|\.)(camberas\.com|lovable\.app|lovableproject\.com|pages\.dev|vercel\.app|workers\.dev)$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS race_domains_principal_unico
  ON public.race_domains(race_id) WHERE principal;

COMMENT ON TABLE public.race_domains IS
  'Dominio propio de la web de una carrera (CNAME a Camberas). verificado solo lo pone el servidor (Edge Function verificar-dominio) tras comprobar el DNS.';

ALTER TABLE public.race_domains ENABLE ROW LEVEL SECURITY;

-- Lectura pública NO por tabla: va por carrera_por_dominio(). Aquí solo el
-- organizador de la carrera o un admin.
DROP POLICY IF EXISTS "race_domains: organizador o admin" ON public.race_domains;
CREATE POLICY "race_domains: organizador o admin"
  ON public.race_domains FOR ALL
  TO authenticated
  USING (public.puede_gestionar_carrera(race_id))
  WITH CHECK (public.puede_gestionar_carrera(race_id));

DROP TRIGGER IF EXISTS update_race_domains_updated_at ON public.race_domains;
CREATE TRIGGER update_race_domains_updated_at
  BEFORE UPDATE ON public.race_domains
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Solo el servidor (service_role, sin auth.uid()) o un admin pueden marcar
-- verificado. Cambiar el hostname lo desverifica. Así un organizador puede
-- escribir su dominio pero no darlo por bueno.
CREATE OR REPLACE FUNCTION public.race_domains_proteger_verificado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  NEW.hostname := lower(regexp_replace(trim(NEW.hostname), '^www\.', ''));
  IF TG_OP = 'UPDATE' AND NEW.hostname IS DISTINCT FROM OLD.hostname THEN
    NEW.verificado := false;
    NEW.verificado_at := NULL;
  END IF;
  IF NEW.verificado = true
     AND (TG_OP = 'INSERT' OR OLD.verificado IS DISTINCT FROM true)
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo el servidor puede marcar un dominio como verificado';
  END IF;
  IF NEW.verificado = true AND NEW.verificado_at IS NULL THEN
    NEW.verificado_at := now();
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS race_domains_proteger_verificado ON public.race_domains;
CREATE TRIGGER race_domains_proteger_verificado
  BEFORE INSERT OR UPDATE ON public.race_domains
  FOR EACH ROW EXECUTE FUNCTION public.race_domains_proteger_verificado();

-- ── 2) TPV del organizador ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.race_tpv (
  race_id       uuid PRIMARY KEY REFERENCES public.races(id) ON DELETE CASCADE,
  merchant_code text NOT NULL CHECK (merchant_code ~ '^[0-9]{6,15}$'),   -- FUC
  terminal      text NOT NULL DEFAULT '1' CHECK (terminal ~ '^[0-9]{1,3}$'),
  secret_ref    text NOT NULL,                     -- nombre del secreto en vault.secrets
  entorno       text NOT NULL DEFAULT 'test' CHECK (entorno IN ('test', 'prod')),
  activo        boolean NOT NULL DEFAULT false,
  titular       text,                             -- nombre del comercio, informativo
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.race_tpv IS
  'Comercio Redsys propio de la carrera: los cobros van a la cuenta del organizador. La clave SHA-256 vive en el Vault (secret_ref); la tabla nunca la contiene. Sin fila activa se usa el TPV de UNO (secretos REDSYS_* de las funciones).';

ALTER TABLE public.race_tpv ENABLE ROW LEVEL SECURITY;

-- El organizador ve y edita su fila (sin la clave, que no está aquí). La
-- escritura normal va por tpv_guardar(), que además mete la clave en el Vault.
DROP POLICY IF EXISTS "race_tpv: organizador o admin" ON public.race_tpv;
CREATE POLICY "race_tpv: organizador o admin"
  ON public.race_tpv FOR ALL
  TO authenticated
  USING (public.puede_gestionar_carrera(race_id))
  WITH CHECK (public.puede_gestionar_carrera(race_id));

DROP TRIGGER IF EXISTS update_race_tpv_updated_at ON public.race_tpv;
CREATE TRIGGER update_race_tpv_updated_at
  BEFORE UPDATE ON public.race_tpv
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Guardar el TPV: escribe la clave en el Vault (crea o actualiza el secreto
-- 'redsys_<race_id>') y la fila. Solo organizador de la carrera o admin.
-- Clave vacía = conservar la que hay (permite cambiar terminal/entorno sin
-- volver a teclearla).
CREATE OR REPLACE FUNCTION public.tpv_guardar(
  p_race_id       uuid,
  p_merchant_code text,
  p_terminal      text,
  p_clave         text,
  p_entorno       text,
  p_activo        boolean,
  p_titular       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ref text := 'redsys_' || p_race_id::text;
  v_secret_id uuid;
BEGIN
  IF NOT public.puede_gestionar_carrera(p_race_id) THEN
    RAISE EXCEPTION 'Sin permiso sobre esta carrera';
  END IF;

  IF p_clave IS NOT NULL AND length(trim(p_clave)) > 0 THEN
    SELECT id INTO v_secret_id FROM vault.secrets WHERE name = v_ref;
    IF v_secret_id IS NULL THEN
      PERFORM vault.create_secret(trim(p_clave), v_ref, 'Clave SHA-256 del comercio Redsys de la carrera ' || p_race_id::text);
    ELSE
      PERFORM vault.update_secret(v_secret_id, trim(p_clave));
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = v_ref) THEN
    RAISE EXCEPTION 'Falta la clave del comercio';
  END IF;

  INSERT INTO public.race_tpv (race_id, merchant_code, terminal, secret_ref, entorno, activo, titular)
  VALUES (p_race_id, trim(p_merchant_code), COALESCE(NULLIF(trim(p_terminal), ''), '1'), v_ref, p_entorno, p_activo, NULLIF(trim(p_titular), ''))
  ON CONFLICT (race_id) DO UPDATE
    SET merchant_code = EXCLUDED.merchant_code,
        terminal      = EXCLUDED.terminal,
        entorno       = EXCLUDED.entorno,
        activo        = EXCLUDED.activo,
        titular       = EXCLUDED.titular;

  RETURN jsonb_build_object('ok', true, 'secret_ref', v_ref);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.tpv_guardar(uuid, text, text, text, text, boolean, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.tpv_guardar(uuid, text, text, text, text, boolean, text) TO authenticated;

-- Leer el TPV con su clave: SOLO service_role (Edge Functions de pago).
-- Devuelve NULL si la carrera no tiene TPV propio activo: el que llama usa
-- entonces el de UNO.
CREATE OR REPLACE FUNCTION public.tpv_de_carrera(p_race_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
           'merchant_code', t.merchant_code,
           'terminal',      t.terminal,
           'secret_key',    s.decrypted_secret,
           'secret_ref',    t.secret_ref,
           'entorno',       t.entorno
         )
  FROM public.race_tpv t
  JOIN vault.decrypted_secrets s ON s.name = t.secret_ref
  WHERE t.race_id = p_race_id AND t.activo = true
  LIMIT 1;
$fn$;

-- Cerrar del todo: anon, authenticated Y PUBLIC (ver CLAUDE.md), y abrir solo
-- a service_role.
REVOKE EXECUTE ON FUNCTION public.tpv_de_carrera(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.tpv_de_carrera(uuid) TO service_role;

-- La clave de un pago ya iniciado: el webhook la busca por el secret_ref que
-- guardó el intent, no por la carrera (el organizador puede cambiar de TPV
-- con pagos en curso). También solo service_role.
CREATE OR REPLACE FUNCTION public.clave_tpv(p_secret_ref text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT s.decrypted_secret FROM vault.decrypted_secrets s WHERE s.name = p_secret_ref LIMIT 1;
$fn$;

REVOKE EXECUTE ON FUNCTION public.clave_tpv(text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.clave_tpv(text) TO service_role;

-- ── 3) Qué comercio firmó cada pago ──────────────────────────────────────
ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS merchant_code text,
  ADD COLUMN IF NOT EXISTS secret_ref    text;

COMMENT ON COLUMN public.payment_intents.secret_ref IS
  'Secreto del Vault con la clave del comercio que firmó este pago (NULL = TPV de UNO). El webhook verifica la firma con esta clave.';

-- ── 4) RPCs públicas ─────────────────────────────────────────────────────

-- 4a) evento_publico(slug): el evento completo con la forma de
-- docs/eventos/evento.schema.json (claves en español, las de la plantilla).
-- NULL si no existe o está oculta.
--
-- Decisiones:
--  - Precio vigente por recorrido: tramo de race_distance_prices que contiene
--    now(); si no hay, precio base. Se devuelven TODOS los tramos como
--    tarifas[].periodos[] para que la web pinte la tabla de precios.
--  - Hora de salida: la primera oleada del recorrido (race_waves), en hora de
--    Madrid "HH:MM"; sin oleada, null (la web no inventa horas).
--  - Estado del recorrido y de la carrera: la misma escalera que widget_carrera.
--  - Plazas: solo si el organizador activó «Mostrar plazas libres»
--    (races.show_available_places, 20260924140000).
--  - Campos del formulario: los visibles de la carrera y del recorrido, con
--    field_options tal cual (ahí van fee_enabled/fees para los suplementos).
--    Sin valores de nadie: son definiciones, no respuestas.
--  - web: plantilla, activa, dominio verificado principal, tpvPropio.
--  - marca: race_web.tema (libro de diseño) o, si está vacío, contenido.marca.
--  - Todo lo de race_web.contenido se fusiona al final (contenido || calculado):
--    lo que el organizador escriba pisa lo calculado, salvo pruebas,
--    inscripcion.tarifas y campos, que siempre salen de las tablas.
CREATE OR REPLACE FUNCTION public.evento_publico(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH ra AS (
    SELECT r.*
    FROM races r
    WHERE r.is_visible = true
      AND (r.slug = p_slug OR r.id::text = lower(p_slug))
    LIMIT 1
  ),
  web AS (
    -- Sub-objetos saneados: si el organizador guardó "inscripcion": null (o un
    -- texto) en race_web, el || de abajo reventaría. Solo se fusiona lo que es objeto.
    SELECT c, plantilla, tema, activa,
           CASE WHEN jsonb_typeof(c->'inscripcion') = 'object' THEN c->'inscripcion' ELSE '{}'::jsonb END AS ins,
           CASE WHEN jsonb_typeof(c->'lugar')       = 'object' THEN c->'lugar'       ELSE '{}'::jsonb END AS lug,
           CASE WHEN jsonb_typeof(c->'organizador') = 'object' THEN c->'organizador' ELSE '{}'::jsonb END AS org,
           CASE WHEN jsonb_typeof(c->'contacto')    = 'object' THEN c->'contacto'    ELSE '{}'::jsonb END AS con,
           CASE WHEN jsonb_typeof(c->'imagenes')    = 'object' THEN c->'imagenes'    ELSE '{}'::jsonb END AS img
    FROM (
      SELECT COALESCE(w.contenido, '{}'::jsonb) AS c,
             COALESCE(w.plantilla, 'gurriana')  AS plantilla,
             COALESCE(w.tema, '{}'::jsonb)      AS tema,
             COALESCE(w.activa, false)          AS activa
      FROM ra LEFT JOIN race_web w ON w.race_id = ra.id
    ) s
  ),
  dist AS (
    SELECT d.*,
           public.plazas_libres(d.id) AS libres,
           (SELECT to_char(min(w.start_time) AT TIME ZONE 'Europe/Madrid', 'HH24:MI')
              FROM race_waves w WHERE w.race_distance_id = d.id AND w.start_time IS NOT NULL) AS salida,
           COALESCE((
             SELECT p.price FROM race_distance_prices p
             WHERE p.race_distance_id = d.id
               AND now() BETWEEN p.start_datetime AND p.end_datetime
             ORDER BY p.start_datetime LIMIT 1
           ), d.price) AS precio_vigente,
           CASE
             WHEN ra.date < current_date THEN 'celebrada'
             WHEN d.registration_opens IS NOT NULL AND now() < d.registration_opens THEN 'proximamente'
             WHEN d.registration_closes IS NOT NULL AND now() > d.registration_closes THEN 'cerrada'
             WHEN d.max_participants IS NOT NULL AND public.plazas_libres(d.id) <= 0 THEN 'agotada'
             ELSE 'abierta'
           END AS estado
    FROM race_distances d, ra
    WHERE d.race_id = ra.id AND d.is_visible = true
  ),
  calculado AS (
    SELECT jsonb_build_object(
      'id',          ra.id,
      'slug',        ra.slug,
      'tenant',      ra.organizer_id,
      'nombre',      ra.name,
      'subtitulo',   ra.subtitle,
      'descripcion', ra.description,
      'deporte',     ra.race_type,
      'fecha',       ra.date,
      'lugar',       jsonb_build_object('nombre', ra.location),
      'organizador', jsonb_build_object('email', ra.organizer_email, 'web', ra.official_website_url),
      'estado',      CASE
                       WHEN ra.date < current_date THEN 'celebrada'
                       WHEN EXISTS (SELECT 1 FROM dist WHERE dist.estado = 'abierta') THEN 'abierta'
                       WHEN EXISTS (SELECT 1 FROM dist WHERE dist.estado = 'proximamente') THEN 'proximamente'
                       WHEN EXISTS (SELECT 1 FROM dist WHERE dist.estado = 'agotada') THEN 'agotada'
                       ELSE 'cerrada'
                     END,
      'imagenes',    jsonb_strip_nulls(jsonb_build_object(
                       'logo', ra.logo_url, 'cartel', ra.poster_url,
                       'hero', ra.cover_image_url, 'imagen', ra.image_url)),
      'web',         jsonb_build_object(
                       'plantilla', web.plantilla,
                       'activa',    web.activa,
                       'dominio',   (SELECT dm.hostname FROM race_domains dm
                                     WHERE dm.race_id = ra.id AND dm.principal AND dm.verificado LIMIT 1),
                       'tpvPropio', EXISTS (SELECT 1 FROM race_tpv t WHERE t.race_id = ra.id AND t.activo)),
      'marca',       COALESCE(NULLIF(web.tema, '{}'::jsonb), web.c->'marca'),
      'inscripcion', jsonb_build_object(
        'apertura',          ra.registration_opens,
        'cierre',            ra.registration_closes,
        'limiteDorsales',    ra.max_participants,
        'plazasDisponibles', CASE WHEN ra.show_available_places
                               THEN (SELECT CASE WHEN bool_and(libres IS NULL) THEN NULL ELSE sum(libres) END FROM dist)
                             END,
        'mostrarPlazas',     ra.show_available_places,
        'modalidades',       (SELECT jsonb_agg(m) FROM (
                                SELECT 'individual' AS m
                                UNION ALL
                                SELECT 'equipo' WHERE EXISTS (SELECT 1 FROM race_team_discount_tiers t WHERE t.race_id = ra.id)
                              ) x),
        'tarifas', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',       d.id,
                   'nombre',   d.name,
                   'pruebas',  jsonb_build_array(d.id),
                   'precio',   d.precio_vigente,
                   'periodos', COALESCE((
                     SELECT jsonb_agg(jsonb_build_object(
                              'desde', p.start_datetime, 'hasta', p.end_datetime, 'precio', p.price,
                              'vigente', now() BETWEEN p.start_datetime AND p.end_datetime)
                            ORDER BY p.start_datetime)
                     FROM race_distance_prices p WHERE p.race_distance_id = d.id
                   ), jsonb_build_array(jsonb_build_object('precio', d.price, 'vigente', true)))
                 ) ORDER BY d.display_order NULLS LAST, d.distance_km)
          FROM dist d
        ), '[]'::jsonb),
        'equipo', (SELECT jsonb_agg(jsonb_build_object(
                            'minMiembros', t.min_members, 'tipo', t.discount_type, 'valor', t.discount_value)
                          ORDER BY t.min_members)
                   FROM race_team_discount_tiers t WHERE t.race_id = ra.id),
        'devolucion', (SELECT jsonb_agg(jsonb_build_object(
                                'diasAntes', c.days_before, 'porcentaje', c.refund_percent)
                              ORDER BY c.days_before DESC)
                       FROM race_cancellation_tiers c WHERE c.race_id = ra.id),
        'cupones', EXISTS (SELECT 1 FROM coupons c WHERE c.race_id = ra.id AND c.active = true
                             AND (c.valid_until IS NULL OR c.valid_until > now())),
        'campos', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',           f.id,
                   'nombre',       f.field_name,
                   'etiqueta',     f.field_label,
                   'tipo',         f.field_type,
                   'opciones',     f.field_options,
                   'obligatorio',  f.is_required,
                   'sistema',      f.is_system_field,
                   'ayuda',        f.help_text,
                   'placeholder',  f.placeholder,
                   'prueba',       f.race_distance_id,
                   'dependeDe',    f.depends_on_field_id,
                   'dependeValor', f.depends_on_value)
                 ORDER BY f.field_order)
          FROM registration_form_fields f
          WHERE f.is_visible = true
            AND (f.race_id = ra.id OR f.race_distance_id IN (SELECT id FROM dist))
        ), '[]'::jsonb),
        'pasarela', jsonb_build_object('proveedor', 'camberas',
                                       'url', 'https://camberas.com/race/' || COALESCE(ra.slug, ra.id::text))
      ),
      'pruebas', COALESCE((
        SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'id',             d.id,
                 'nombre',         d.name,
                 'tipo',           d.kind,
                 'competitiva',    d.competitive,
                 'chip',           d.chip,
                 'distancia',      round(d.distance_km * 1000),
                 -- "12,2 km", "6 km", "10 km": dos decimales, sin ceros de relleno
                 'distanciaTexto', replace(rtrim(rtrim(to_char(d.distance_km, 'FM999990.00'), '0'), '.'), '.', ',') || ' km',
                 'desnivelPos',    d.elevation_gain,
                 'desnivelNeg',    d.elevation_loss,
                 'altMax',         d.alt_max,
                 'altMin',         d.alt_min,
                 'salida',         d.salida,
                 'limite',         d.cutoff_time,
                 'lugarSalida',    d.start_location,
                 'lugarMeta',      d.finish_location,
                 'plazas',         CASE WHEN ra.show_available_places THEN d.max_participants END,
                 'plazasLibres',   CASE WHEN ra.show_available_places THEN d.libres END,
                 'estado',         d.estado,
                 'precio',         d.precio_vigente,
                 'apertura',       d.registration_opens,
                 'cierre',         d.registration_closes,
                 'imagen',         d.image_url,
                 'track',          CASE WHEN d.gpx_file_url IS NULL THEN NULL
                                        ELSE jsonb_build_object('gpx', d.gpx_file_url) END,
                 'categorias',     (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                                             'id', c.id, 'nombre', c.name, 'corto', c.short_name,
                                             'sexo', c.gender, 'edadMin', c.min_age, 'edadMax', c.max_age))
                                           ORDER BY c.display_order)
                                    FROM race_categories c
                                    WHERE c.race_distance_id = d.id),
                 'avituallamientos', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                                               'km', k.distance_km, 'nombre', k.name, 'lugar', k.lugar,
                                               'tipo', lower(k.checkpoint_type), 'corte', k.max_time))
                                             ORDER BY k.checkpoint_order)
                                      FROM race_checkpoints k
                                      WHERE k.race_distance_id = d.id)
               )) ORDER BY d.display_order NULLS LAST, d.distance_km)
        FROM dist d, ra
      ), '[]'::jsonb),
      'categorias', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                              'id', c.id, 'nombre', c.name, 'corto', c.short_name,
                              'sexo', c.gender, 'edadMin', c.min_age, 'edadMax', c.max_age,
                              'criterio', ra.category_age_reference))
                            ORDER BY c.display_order)
                     FROM race_categories c
                     WHERE c.race_id = ra.id AND c.race_distance_id IS NULL),
      'reglamento', (SELECT jsonb_build_object(
                              'version', g.version,
                              'secciones', (SELECT jsonb_agg(jsonb_build_object(
                                                     'titulo', s.title, 'tipo', s.section_type, 'texto', s.content)
                                                   ORDER BY s.section_order)
                                            FROM race_regulation_sections s WHERE s.regulation_id = g.id))
                     FROM race_regulations g
                     WHERE g.race_id = ra.id AND g.published = true
                     ORDER BY g.version DESC LIMIT 1),
      'infoPractica', jsonb_strip_nulls(jsonb_build_object(
                        'faq', (SELECT jsonb_agg(jsonb_build_object('p', q.question, 'r', q.answer)
                                               ORDER BY q.display_order)
                                FROM race_faqs q WHERE q.race_id = ra.id))),
      'patrocinadores', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                                  'nombre', s.name, 'logo', s.logo_url, 'web', s.website, 'nivel', s.level))
                                ORDER BY s.display_order, s.name)
                         FROM race_sponsors s WHERE s.race_id = ra.id),
      'clasificaciones', jsonb_build_object(
                           'url', 'https://camberas.com/' || COALESCE(ra.slug, ra.id::text) || '/live',
                           'tiempoReal', true),
      'gps', jsonb_build_object('activo', COALESCE(ra.gps_tracking_enabled, false),
                                'url', 'https://camberas.com/' || COALESCE(ra.slug, ra.id::text) || '/gps'),
      'contacto', jsonb_strip_nulls(jsonb_build_object('email', ra.organizer_email)),
      'fuente', jsonb_build_object('origen', 'camberas', 'generado', now())
    ) AS j
    FROM ra, web
  )
  -- race_web pisa lo calculado clave a clave; inscripcion, lugar, organizador,
  -- contacto e imagenes se fusionan un nivel más adentro para no perder lo
  -- calculado; pruebas/tarifas/campos/web siempre son los de las tablas.
  SELECT jsonb_strip_nulls(
           calculado.j
           || (web.c - 'pruebas' - 'inscripcion' - 'lugar' - 'organizador' - 'contacto' - 'imagenes' - 'web' - 'marca')
           || jsonb_build_object(
                'inscripcion', (calculado.j->'inscripcion') || web.ins
                                 || jsonb_build_object('tarifas', calculado.j->'inscripcion'->'tarifas',
                                                       'campos',  calculado.j->'inscripcion'->'campos'),
                'lugar',       (calculado.j->'lugar')       || web.lug,
                'organizador', (calculado.j->'organizador') || web.org,
                'contacto',    (calculado.j->'contacto')    || web.con,
                'imagenes',    (calculado.j->'imagenes')    || web.img
              )
         )
  FROM calculado, web;
$fn$;

COMMENT ON FUNCTION public.evento_publico(text) IS
  'Evento completo (forma de docs/eventos/evento.schema.json) para la web de la carrera, por slug o id. Solo carreras visibles; sin datos personales ni claves.';

-- La llama la web de la carrera sin sesión (clave anónima): abrirla a anon es
-- el propósito. Solo devuelve datos públicos.
GRANT EXECUTE ON FUNCTION public.evento_publico(text) TO anon, authenticated;

-- 4b) carrera_por_dominio(hostname): lo mínimo para arrancar la web bajo un
-- dominio propio (antes de montar React). Acepta "www." y mayúsculas. Por
-- defecto solo dominios verificados; el modo desarrollo pide también los no
-- verificados (p_solo_verificados = false) para probar antes del DNS.
CREATE OR REPLACE FUNCTION public.carrera_por_dominio(p_hostname text, p_solo_verificados boolean DEFAULT true)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
           'race_id',    r.id,
           'slug',       r.slug,
           'nombre',     r.name,
           'logo',       r.logo_url,
           'hostname',   d.hostname,
           'verificado', d.verificado,
           'plantilla',  COALESCE(w.plantilla, 'gurriana'),
           'tema',       COALESCE(w.tema, '{}'::jsonb)
         )
  FROM race_domains d
  JOIN races r ON r.id = d.race_id AND r.is_visible = true
  LEFT JOIN race_web w ON w.race_id = r.id
  WHERE d.hostname = lower(regexp_replace(trim(p_hostname), '^www\.', ''))
    AND (d.verificado = true OR p_solo_verificados = false)
  LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.carrera_por_dominio(text, boolean) IS
  'Carrera servida bajo un dominio propio (para arrancar la web). Solo datos públicos.';

GRANT EXECUTE ON FUNCTION public.carrera_por_dominio(text, boolean) TO anon, authenticated;

-- 4c) estado_inscripcion_publica(id): para la página /inscripcion/ok a la que
-- vuelve Redsys. El UUID de la inscripción viaja en la URL de retorno; no se
-- devuelve nada personal (ni email, ni nombre, ni token).
CREATE OR REPLACE FUNCTION public.estado_inscripcion_publica(p_registration_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE((
    SELECT jsonb_build_object(
             'estado',  CASE
                          WHEN r.status = 'cancelled' THEN 'anulada'
                          WHEN r.payment_status IN ('paid', 'not_required') THEN 'pagada'
                          WHEN EXISTS (SELECT 1 FROM payment_intents pi
                                       WHERE pi.registration_id = r.id AND pi.status = 'failed'
                                         AND NOT EXISTS (SELECT 1 FROM payment_intents ok
                                                         WHERE ok.registration_id = r.id AND ok.status IN ('pending', 'completed')
                                                           AND ok.created_at > pi.created_at))
                            THEN 'fallida'
                          ELSE 'pendiente'
                        END,
             'dorsal',  r.bib_number,
             'prueba',  d.name,
             'carrera', ra.name,
             'slug',    ra.slug
           )
    FROM registrations r
    JOIN race_distances d ON d.id = r.race_distance_id
    JOIN races ra ON ra.id = r.race_id
    WHERE r.id = p_registration_id
  ), jsonb_build_object('estado', 'no_existe'));
$fn$;

COMMENT ON FUNCTION public.estado_inscripcion_publica(uuid) IS
  'Estado de pago de una inscripción para la página de vuelta del TPV. Sin datos personales.';

GRANT EXECUTE ON FUNCTION public.estado_inscripcion_publica(uuid) TO anon, authenticated;

-- ── 5) Menú «Web propia» (patrón de 20260922180000_menu_mesas_y_pantallas) ──
-- El grupo se copia de la fila vecina de FAQs de la carrera.
INSERT INTO public.menu_items
  (menu_type, title, icon, route, view_name, parent_id, group_label, display_order, is_visible, requires_auth)
SELECT v.menu_type, v.title, v.icon, NULL, v.view_name, NULL,
       (SELECT m.group_label FROM public.menu_items m
        WHERE m.menu_type = v.menu_type AND m.view_name = v.vecino
        LIMIT 1),
       v.display_order, true, true
FROM (VALUES
  ('admin',     'Web propia', 'Globe', 'web-propia', 'race-faqs', 368),
  ('organizer', 'Web propia', 'Globe', 'web-propia', 'race-faqs', 368)
) AS v(menu_type, title, icon, view_name, vecino, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items m
  WHERE m.menu_type = v.menu_type AND m.view_name = v.view_name
);

-- ── 6) Comprobaciones (ejecutar tras aplicar) ────────────────────────────
-- Permisos: las tres públicas abiertas a anon; tpv_de_carrera y clave_tpv
-- cerradas a anon y authenticated; tpv_guardar solo authenticated.
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_role
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('evento_publico', 'carrera_por_dominio', 'estado_inscripcion_publica', 'tpv_guardar', 'tpv_de_carrera', 'clave_tpv')
ORDER BY p.proname;

SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('race_domains', 'race_tpv', 'race_web', 'race_sponsors');

-- Menú: dos filas con el grupo de FAQs
SELECT menu_type, group_label, display_order, title, view_name
FROM public.menu_items WHERE view_name = 'web-propia' ORDER BY menu_type;

-- Datos: Loiu con Trail (carrera) y Martxa (marcha), bloque web, y una que no existe → NULL
SELECT jsonb_pretty(public.evento_publico('loiu-500-trail-2026')->'web');
SELECT jsonb_pretty(public.evento_publico('ii-pena-prieta-skyrace')->'pruebas');
SELECT public.evento_publico('no-existe') IS NULL AS carrera_inexistente_da_null;
SELECT public.carrera_por_dominio('www.desafio-sarrio.com', false) AS dominio_sin_dar_de_alta_da_null;
SELECT public.estado_inscripcion_publica(gen_random_uuid()) AS inscripcion_inexistente;
