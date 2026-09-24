-- ============================================================
-- WIDGET DE INSCRIPCIÓN PARA LA WEB DE LA CARRERA (24-sep-2026)
--
-- El organizador pega en su web un <div> y el script
-- https://camberas.com/widget.js (sin iframe). El script pide aquí, con la
-- clave anónima, lo que tiene que enseñar: carrera, recorridos, precio
-- vigente, plazas libres y si la inscripción está abierta. Primer caso:
-- Desafío Sarrio.
--
-- Una sola función, calculada en el servidor:
--  - Mismas reglas de visibilidad que la web pública (RLS de races y
--    race_distances para anon): carrera y recorrido con is_visible.
--  - Precio vigente: el tramo de race_distance_prices que contiene "ahora";
--    si no hay, el precio base. Si dos tramos se solapan (una promo dentro
--    del periodo general), el que EMPEZÓ MÁS TARDE: la misma regla que el
--    cobro (redsys-init-payment, guest-register, team-register,
--    validate-coupon). Lo que anuncia el widget es lo que se cobra.
--  - Plazas libres: plazas_libres(), la regla común (las pendientes solo
--    ocupan durante los 30 min de pago). El navegador sin sesión no puede
--    leer registrations, así que contarlas ahí daría siempre "todas libres".
--  - No devuelve nada personal: solo datos públicos de la carrera.
--
-- Acepta el slug o el id. Carrera inexistente u oculta → NULL.
--
-- Editor SQL de Lovable: sentencias sueltas, cuerpos con $fn$ (no $$).
-- ============================================================

CREATE OR REPLACE FUNCTION public.widget_carrera(p_carrera text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'id',       ra.id,
    -- Sin slug (carreras antiguas nunca reguardadas), el id: /<id> también
    -- abre la carrera
    'slug',     COALESCE(NULLIF(ra.slug, ''), ra.id::text),
    'nombre',   ra.name,
    'fecha',    ra.date,
    'lugar',    ra.location,
    'logo',     ra.logo_url,
    'recorridos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id',        d.id,
               'nombre',    d.name,
               'km',        d.distance_km,
               'desnivel',  d.elevation_gain,
               'precio',    COALESCE((
                              SELECT p.price FROM race_distance_prices p
                              WHERE p.race_distance_id = d.id
                                AND now() BETWEEN p.start_datetime AND p.end_datetime
                              ORDER BY p.start_datetime DESC
                              LIMIT 1
                            ), d.price),
               'plazas',    d.max_participants,
               'libres',    public.plazas_libres(d.id),
               'abre',      d.registration_opens,
               'cierra',    d.registration_closes,
               'estado',    CASE
                              WHEN ra.date < current_date THEN 'cerrada'
                              WHEN d.registration_opens IS NOT NULL
                                   AND now() < d.registration_opens THEN 'proxima'
                              WHEN d.registration_closes IS NOT NULL
                                   AND now() > d.registration_closes THEN 'cerrada'
                              WHEN d.max_participants IS NOT NULL
                                   AND public.plazas_libres(d.id) <= 0 THEN 'completa'
                              ELSE 'abierta'
                            END
             ) ORDER BY d.display_order NULLS LAST, d.distance_km)
      FROM race_distances d
      WHERE d.race_id = ra.id
        AND d.is_visible = true
    ), '[]'::jsonb)
  )
  FROM races ra
  WHERE ra.is_visible = true
    -- El id se compara como texto: convertir p_carrera a uuid reventaría
    -- con un slug, y Postgres no garantiza el orden de evaluación del OR
    AND (ra.slug = p_carrera OR ra.id::text = lower(p_carrera))
  LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.widget_carrera(text) IS
  'Datos públicos de una carrera para el widget de inscripción (widget.js), por slug o id.';

-- La llama la web del organizador sin sesión (clave anónima). Solo datos
-- públicos: abrirla a anon es el propósito.
GRANT EXECUTE ON FUNCTION public.widget_carrera(text) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Entrada de menú del admin: Inscripciones › Widgets para la web
-- (inscripción y vuelo 3D). El grupo se copia de la fila de "Inscripciones"
-- (así coincide, emoji incluido) y va detrás de "Plantillas de email" (365).
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO menu_items (menu_type, group_label, title, view_name, icon, display_order, is_visible, requires_auth)
SELECT 'admin', m.group_label, 'Widgets para la web', 'widget-inscripcion', 'Code', 367, true, true
FROM menu_items m
WHERE m.menu_type = 'admin' AND m.view_name = 'registrations'
  AND NOT EXISTS (
    SELECT 1 FROM menu_items x WHERE x.menu_type = 'admin' AND x.view_name = 'widget-inscripcion'
  )
LIMIT 1;

-- Comprobación: debe salir el Desafío Sarrio con sus tres recorridos
SELECT public.widget_carrera('desafio-sarrio');
