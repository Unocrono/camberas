-- =============================================================================
-- Recogida de dorsales: la ficha enseña género, categoría y equipo
-- (27-oct-2026, pedido por el promotor en la entrega de Viñedos).
--
-- recogida_buscar y recogida_por_qr devuelven tres columnas más:
--   genero     nombre corto (Hombre / Mujer / Mixto) por gender_id o, si no
--              hay id, por el texto de la inscripción
--   categoria  short_name de la categoría asignada (o el nombre completo)
--   equipo     team y, si no hay, club (en las carreras populares nadie
--              rellena equipo y sí el club)
-- RETURNS TABLE no admite columnas nuevas con CREATE OR REPLACE: DROP y
-- CREATE, y se reponen los mismos permisos que tenían (anon, authenticated y
-- service_role: la mesa entra con el token de la mesa, sin sesión; el token
-- se valida dentro). No toca horas. Ensayada en seco y APLICADA el 27-oct.
-- =============================================================================

DROP FUNCTION IF EXISTS public.recogida_buscar(uuid, text);
DROP FUNCTION IF EXISTS public.recogida_por_qr(uuid, uuid);

CREATE FUNCTION public.recogida_buscar(p_token uuid, p_texto text)
RETURNS TABLE(registration_id uuid, nombre text, apellidos text, dorsal integer, recorrido text,
              talla text, dni_final text, pago text, edad_carrera integer,
              entregado_at timestamptz, entregado_mesa text, recogido_por text,
              genero text, categoria text, equipo text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_race uuid;
  v_fecha date;
  v_txt  text := trim(COALESCE(p_texto, ''));
BEGIN
  SELECT m.race_id, ra.date INTO v_race, v_fecha
  FROM mesas_recogida m JOIN races ra ON ra.id = m.race_id
  WHERE m.token = p_token AND m.activa IS TRUE;
  IF v_race IS NULL OR v_txt = '' THEN
    RETURN;  -- token inválido/revocado o búsqueda vacía: ni una fila
  END IF;

  RETURN QUERY
  SELECT r.id,
         COALESCE(NULLIF(r.first_name, ''), pr.first_name, '')          AS nombre,
         COALESCE(NULLIF(r.last_name, ''),  pr.last_name,  '')          AS apellidos,
         r.bib_number                                                    AS dorsal,
         d.name                                                          AS recorrido,
         r.tshirt_size                                                   AS talla,
         right(regexp_replace(COALESCE(NULLIF(r.dni_passport, ''), pr.dni_passport, ''),
                              '[^A-Za-z0-9]', '', 'g'), 5)               AS dni_final,
         r.payment_status                                                AS pago,
         CASE WHEN COALESCE(r.birth_date, pr.birth_date) IS NOT NULL
              THEN EXTRACT(YEAR FROM age(v_fecha, COALESCE(r.birth_date, pr.birth_date)))::integer
         END                                                             AS edad_carrera,
         e.entregado_at,
         me.nombre                                                       AS entregado_mesa,
         e.recogido_por,
         COALESCE(g.gender_name2,
                  CASE upper(left(COALESCE(NULLIF(r.gender, ''), pr.gender, ''), 1))
                       WHEN 'M' THEN 'Hombre' WHEN 'F' THEN 'Mujer' WHEN 'X' THEN 'Mixto' END) AS genero,
         COALESCE(NULLIF(c.short_name, ''), c.name)                      AS categoria,
         COALESCE(NULLIF(r.team, ''), NULLIF(r.club, ''), pr.team, pr.club) AS equipo
  FROM registrations r
  JOIN race_distances d   ON d.id = r.race_distance_id
  LEFT JOIN profiles pr   ON pr.id = r.user_id
  LEFT JOIN genders g     ON g.gender_id = COALESCE(r.gender_id, pr.gender_id)
  LEFT JOIN race_categories c ON c.id = r.race_category_id
  LEFT JOIN entregas_dorsal e ON e.registration_id = r.id
  LEFT JOIN mesas_recogida me ON me.id = e.mesa_id
  WHERE r.race_id = v_race
    AND r.status IS DISTINCT FROM 'cancelled'
    AND (
      r.bib_number::text = v_txt
      OR COALESCE(NULLIF(r.first_name, ''), pr.first_name, '') ILIKE '%' || v_txt || '%'
      OR COALESCE(NULLIF(r.last_name, ''),  pr.last_name,  '') ILIKE '%' || v_txt || '%'
      OR upper(regexp_replace(COALESCE(NULLIF(r.dni_passport, ''), pr.dni_passport, ''), '[^A-Za-z0-9]', '', 'g'))
         LIKE '%' || upper(regexp_replace(v_txt, '[^A-Za-z0-9]', '', 'g')) || '%'
    )
  ORDER BY r.bib_number NULLS LAST,
           COALESCE(NULLIF(r.last_name, ''), pr.last_name, '')
  LIMIT 20;
END;
$fn$;

CREATE FUNCTION public.recogida_por_qr(p_token uuid, p_token_inscripcion uuid)
RETURNS TABLE(registration_id uuid, nombre text, apellidos text, dorsal integer, recorrido text,
              talla text, dni_final text, pago text, edad_carrera integer,
              entregado_at timestamptz, entregado_mesa text, recogido_por text,
              genero text, categoria text, equipo text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_race uuid;
  v_fecha date;
BEGIN
  SELECT m.race_id, ra.date INTO v_race, v_fecha
  FROM mesas_recogida m JOIN races ra ON ra.id = m.race_id
  WHERE m.token = p_token AND m.activa IS TRUE;
  IF v_race IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.id,
         COALESCE(NULLIF(r.first_name, ''), pr.first_name, ''),
         COALESCE(NULLIF(r.last_name, ''),  pr.last_name,  ''),
         r.bib_number,
         d.name,
         r.tshirt_size,
         right(regexp_replace(COALESCE(NULLIF(r.dni_passport, ''), pr.dni_passport, ''),
                              '[^A-Za-z0-9]', '', 'g'), 5),
         r.payment_status,
         CASE WHEN COALESCE(r.birth_date, pr.birth_date) IS NOT NULL
              THEN EXTRACT(YEAR FROM age(v_fecha, COALESCE(r.birth_date, pr.birth_date)))::integer
         END,
         e.entregado_at,
         me.nombre,
         e.recogido_por,
         COALESCE(g.gender_name2,
                  CASE upper(left(COALESCE(NULLIF(r.gender, ''), pr.gender, ''), 1))
                       WHEN 'M' THEN 'Hombre' WHEN 'F' THEN 'Mujer' WHEN 'X' THEN 'Mixto' END),
         COALESCE(NULLIF(c.short_name, ''), c.name),
         COALESCE(NULLIF(r.team, ''), NULLIF(r.club, ''), pr.team, pr.club)
  FROM registrations r
  JOIN race_distances d   ON d.id = r.race_distance_id
  LEFT JOIN profiles pr   ON pr.id = r.user_id
  LEFT JOIN genders g     ON g.gender_id = COALESCE(r.gender_id, pr.gender_id)
  LEFT JOIN race_categories c ON c.id = r.race_category_id
  LEFT JOIN entregas_dorsal e ON e.registration_id = r.id
  LEFT JOIN mesas_recogida me ON me.id = e.mesa_id
  WHERE r.token_inscripcion = p_token_inscripcion
    AND r.race_id = v_race            -- un QR de otra carrera no abre ficha aquí
    AND r.status IS DISTINCT FROM 'cancelled';
END;
$fn$;

-- Mismos permisos que tenían: la mesa entra con el token de la mesa, sin sesión
REVOKE EXECUTE ON FUNCTION public.recogida_buscar(uuid, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recogida_buscar(uuid, text) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.recogida_por_qr(uuid, uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recogida_por_qr(uuid, uuid) TO anon, authenticated, service_role;

-- Guardia de horas (CLAUDE.md): ningún FALLO
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel='FALLO') THEN RAISE EXCEPTION 'horas'; END IF; END $$;

NOTIFY pgrst, 'reload schema';

-- Comprobación: una versión de cada función y permisos como antes
SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('recogida_buscar', 'recogida_por_qr') ORDER BY 1;
