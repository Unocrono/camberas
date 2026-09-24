-- ============================================================
-- MOSTRAR PLAZAS LIBRES: lo decide el organizador (24-sep-2026)
--
-- Nueva opción de la carrera, "Mostrar plazas libres". Desactivada de serie:
-- la mayoría de organizadores no quiere enseñar cuántas plazas le quedan.
-- Afecta a todo lo público:
--  - la ficha de la carrera ("N plazas disponibles" en cada recorrido);
--  - el widget para la web (widget.js).
-- "Completo" se sigue diciendo siempre: eso no es un número, es que no se
-- puede inscribir.
--
-- widget_carrera deja de DEVOLVER las plazas (null) si la carrera no las
-- muestra: si el organizador las oculta, no deben poder leerse llamando a la
-- función a mano. El estado 'completa' se sigue calculando en el servidor.
-- Precio: el tramo que empezó más tarde, la regla del cobro.
--
-- Editor SQL de Lovable: sentencias sueltas, cuerpos con $fn$ (no $$).
-- ============================================================

ALTER TABLE public.races
  ADD COLUMN IF NOT EXISTS show_available_places boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.races.show_available_places IS
  'Mostrar las plazas libres en la ficha pública y en el widget. Por defecto no.';

CREATE OR REPLACE FUNCTION public.widget_carrera(p_carrera text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'id',       ra.id,
    'slug',     COALESCE(NULLIF(ra.slug, ''), ra.id::text),
    'nombre',   ra.name,
    'fecha',    ra.date,
    'lugar',    ra.location,
    'logo',     ra.logo_url,
    'mostrar_plazas', ra.show_available_places,
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
               'plazas',    CASE WHEN ra.show_available_places THEN d.max_participants END,
               'libres',    CASE WHEN ra.show_available_places THEN public.plazas_libres(d.id) END,
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
    AND (ra.slug = p_carrera OR ra.id::text = lower(p_carrera))
  LIMIT 1;
$fn$;

GRANT EXECUTE ON FUNCTION public.widget_carrera(text) TO anon, authenticated;

-- Comprobación: el Desafío Sarrio sin plazas (libres = null)
SELECT public.widget_carrera('desafio-sarrio');
