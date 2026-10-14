-- ============================================================
-- RECEPTOR ULTRA: REPLICAR LAS LECTURAS A VARIOS SERVIDORES. Petición del
-- dueño, 14-oct: «una pantalla para poder replicar las lecturas a varios
-- servidores» (hoy el Ultra → nuestro VPS 212.227.159.123:23023 → el servidor
-- original de RFID Timing 82.113.145.105:11111). SOLO ADMIN.
--
-- ultra_receptores: uno por VPS. Su `clave` va en /root/ultra/config.json
--   ("clave_receptor"); con ella el receptor se sincroniza cada ~15 s: deja su
--   `estado` (Ultras conectados, pendientes de cada destino…) y se lleva la
--   lista de destinos activos.
-- ultra_destinos: a quién se reenvían las lecturas.
--   · contesta = true (como mucho uno): recibe el tráfico del Ultra EN
--     DIRECTO y es quien le confirma las lecturas (como hacía Outreach).
--   · el resto son COPIAS: el receptor les manda las lecturas desde su disco
--     y lleva la cuenta de lo que cada una ha confirmado; si una está caída,
--     al volver recibe lo pendiente.
--   · si ninguno contesta, contesta el propio receptor.
--
-- Horas: visto_en es un instante real («ahora»: now()); las horas de las
-- lecturas que vengan en `estado` son de pared y la pantalla las enseña tal
-- cual.
--
-- PENDIENTE DE APLICAR en producción (panel de Supabase).
-- ============================================================

SET client_encoding = 'UTF8';

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.ultra_receptores (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text        NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  clave       uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  visto_en    timestamptz,
  estado      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ultra_destinos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  receptor_id  uuid        NOT NULL REFERENCES public.ultra_receptores(id) ON DELETE CASCADE,
  nombre       text        NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  host         text        NOT NULL CHECK (host ~ '^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$'),
  puerto       integer     NOT NULL CHECK (puerto BETWEEN 1 AND 65535),
  contesta     boolean     NOT NULL DEFAULT false,
  activo       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receptor_id, host, puerto)
);

-- Al Ultra solo le contesta uno
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ultra_destinos_contesta
  ON public.ultra_destinos (receptor_id) WHERE contesta;

-- Marcar uno como «contesta» se lo quita a los demás (la pantalla hace un solo update)
CREATE OR REPLACE FUNCTION public.ultra_destinos_uno_contesta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at := now();
  IF NEW.contesta THEN
    UPDATE ultra_destinos SET contesta = false
     WHERE receptor_id = NEW.receptor_id AND id <> NEW.id AND contesta;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS ultra_destinos_uno_contesta ON public.ultra_destinos;
CREATE TRIGGER ultra_destinos_uno_contesta
  BEFORE INSERT OR UPDATE ON public.ultra_destinos
  FOR EACH ROW EXECUTE FUNCTION public.ultra_destinos_uno_contesta();

-- La función del trigger no la llama nadie a mano
REVOKE EXECUTE ON FUNCTION public.ultra_destinos_uno_contesta() FROM anon, authenticated, PUBLIC;

-- Solo admin (la clave del receptor es secreta)
ALTER TABLE public.ultra_receptores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ultra_destinos   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ultra_receptores, public.ultra_destinos FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ultra_receptores, public.ultra_destinos TO authenticated;

DROP POLICY IF EXISTS "Solo admin gestiona receptores Ultra" ON public.ultra_receptores;
CREATE POLICY "Solo admin gestiona receptores Ultra" ON public.ultra_receptores
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Solo admin gestiona destinos Ultra" ON public.ultra_destinos;
CREATE POLICY "Solo admin gestiona destinos Ultra" ON public.ultra_destinos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- El receptor se sincroniza: deja su estado y se lleva los destinos activos.
-- Entra con la clave pública; la puerta es la clave del receptor.
CREATE OR REPLACE FUNCTION public.ultra_receptor_sincronizar(
  p_clave   uuid,
  p_estado  jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id      uuid;
  v_nombre  text;
BEGIN
  IF p_estado IS NOT NULL
     AND (jsonb_typeof(p_estado) <> 'object' OR octet_length(p_estado::text) > 65536) THEN
    RAISE EXCEPTION 'Estado del receptor no válido';
  END IF;

  UPDATE ultra_receptores
     SET visto_en = now(), estado = coalesce(p_estado, estado)
   WHERE clave = p_clave
  RETURNING id, nombre INTO v_id, v_nombre;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clave de receptor no válida';
  END IF;

  RETURN jsonb_build_object(
    'nombre', v_nombre,
    'destinos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', d.id, 'nombre', d.nombre, 'host', d.host,
                                          'puerto', d.puerto, 'contesta', d.contesta)
                       ORDER BY d.contesta DESC, d.created_at)
        FROM ultra_destinos d
       WHERE d.receptor_id = v_id AND d.activo), '[]'::jsonb));
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.ultra_receptor_sincronizar(uuid, jsonb) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ultra_receptor_sincronizar(uuid, jsonb) TO anon, authenticated;

-- Lo de hoy: nuestro VPS, que reenvía al servidor original de RFID Timing
INSERT INTO public.ultra_receptores (nombre)
SELECT 'VPS streaming (212.227.159.123)'
 WHERE NOT EXISTS (SELECT 1 FROM public.ultra_receptores);

INSERT INTO public.ultra_destinos (receptor_id, nombre, host, puerto, contesta)
SELECT r.id, 'RFID Timing (Outreach)', '82.113.145.105', 11111, true
  FROM public.ultra_receptores r
 WHERE NOT EXISTS (SELECT 1 FROM public.ultra_destinos)
 ORDER BY r.created_at
 LIMIT 1;

-- Menú: SOLO admin, en el grupo de Cronometraje, al final
INSERT INTO public.menu_items
  (menu_type, title, icon, route, view_name, parent_id, group_label, display_order, is_visible, requires_auth)
SELECT 'admin', 'Receptor Ultra', 'Router', NULL, 'receptor-ultra', NULL,
       g.group_label, g.ultimo + 1, true, true
  FROM (SELECT (SELECT m.group_label FROM public.menu_items m
                 WHERE m.menu_type = 'admin' AND m.view_name = 'timing-readings' LIMIT 1) AS group_label,
               coalesce((SELECT max(m.display_order) FROM public.menu_items m
                          WHERE m.menu_type = 'admin'
                            AND m.group_label = (SELECT m2.group_label FROM public.menu_items m2
                                                  WHERE m2.menu_type = 'admin' AND m2.view_name = 'timing-readings'
                                                  LIMIT 1)), 37) AS ultimo) g
 WHERE NOT EXISTS (SELECT 1 FROM public.menu_items m
                    WHERE m.menu_type = 'admin' AND m.view_name = 'receptor-ultra');

-- Comprobaciones: si algo falla, se deshace todo
DO $$
DECLARE malas text;
BEGIN
  IF NOT has_function_privilege('anon', 'public.ultra_receptor_sincronizar(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'El receptor (anon) no podría sincronizarse';
  END IF;
  IF has_function_privilege('anon', 'public.ultra_destinos_uno_contesta()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon puede ejecutar ultra_destinos_uno_contesta';
  END IF;
  IF has_table_privilege('anon', 'public.ultra_receptores', 'SELECT')
     OR has_table_privilege('anon', 'public.ultra_destinos', 'SELECT') THEN
    RAISE EXCEPTION 'anon puede leer las tablas del receptor Ultra';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.ultra_destinos', 'SELECT,INSERT,UPDATE,DELETE')
     OR NOT has_table_privilege('authenticated', 'public.ultra_receptores', 'SELECT') THEN
    RAISE EXCEPTION 'La pantalla (authenticated) no podría leer o editar los destinos';
  END IF;
  IF EXISTS (SELECT 1 FROM public.menu_items
              WHERE view_name = 'receptor-ultra' AND menu_type <> 'admin') THEN
    RAISE EXCEPTION 'Receptor Ultra tiene que estar solo en el menú de admin';
  END IF;

  -- Guardia de horas (CLAUDE.md): ningún FALLO
  SELECT string_agg(nombre || ' [' || left(regla, 2) || ']', ', ') INTO malas
    FROM public.guardia_horas() WHERE nivel = 'FALLO';
  IF malas IS NOT NULL THEN RAISE EXCEPTION 'Siguen convirtiendo horas: %', malas; END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Comprobación: el receptor sembrado (su clave va en config.json) y sus destinos
SELECT r.nombre AS receptor, r.clave, d.nombre AS destino, d.host, d.puerto, d.contesta, d.activo
  FROM public.ultra_receptores r
  LEFT JOIN public.ultra_destinos d ON d.receptor_id = r.id
 ORDER BY r.created_at, d.contesta DESC, d.created_at;
