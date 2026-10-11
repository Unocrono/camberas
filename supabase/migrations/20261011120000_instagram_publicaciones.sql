-- Instagram, fase 1: publicar en la cuenta de Camberas.
--
-- · instagram_publicaciones: historial de todo lo que se publica (a mano desde
--   el panel o, en la fase 3, las historias automáticas), con el error si falla.
--   Escribe solo la edge function instagram-publicar con la service role; los
--   admins leen.
-- · Bucket «instagram», PÚBLICO: Meta no admite subir la imagen, la descarga de
--   una URL. Solo JPEG y hasta 8 MB, que es lo que acepta Instagram.
--
-- Alta en Meta y secrets: docs/instagram-alta-meta.md.

CREATE TABLE IF NOT EXISTS public.instagram_publicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('cartel_grupetta', 'resultados', 'historia', 'otro')),
  formato text NOT NULL DEFAULT 'feed' CHECK (formato IN ('feed', 'historia')),
  race_id uuid REFERENCES public.races(id) ON DELETE SET NULL,
  -- Una clave repetida no se publica dos veces. La llevan siempre las
  -- historias automáticas (una pasada del robot que se solape con otra no
  -- duplica); las publicaciones a mano van sin clave.
  clave text UNIQUE,
  imagenes text[] NOT NULL,
  pie text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'publicada', 'error')),
  media_id text,
  permalink text,
  error text,
  creada_por uuid,          -- auth.uid() de quien publicó; NULL si fue el robot
  created_at timestamptz NOT NULL DEFAULT now(),
  publicada_at timestamptz
);

CREATE INDEX IF NOT EXISTS instagram_publicaciones_fecha_idx
  ON public.instagram_publicaciones (created_at DESC);
CREATE INDEX IF NOT EXISTS instagram_publicaciones_carrera_idx
  ON public.instagram_publicaciones (race_id, created_at DESC);

COMMENT ON TABLE public.instagram_publicaciones IS
  'Historial de publicaciones en el Instagram de Camberas (edge function instagram-publicar). Escribe solo la service role; leen los admins.';

ALTER TABLE public.instagram_publicaciones ENABLE ROW LEVEL SECURITY;
-- Los privilegios por defecto dan ALL a anon y authenticated (y TRUNCATE no
-- pasa por RLS): se quita todo y se deja solo lectura, filtrada por la política
REVOKE ALL ON public.instagram_publicaciones FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.instagram_publicaciones TO authenticated;

DROP POLICY IF EXISTS "instagram_publicaciones lee admin" ON public.instagram_publicaciones;
CREATE POLICY "instagram_publicaciones lee admin" ON public.instagram_publicaciones
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Bucket público: la URL pública no pasa por RLS, así que no hace falta
-- política de lectura (y sin ella nadie puede listar el bucket)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('instagram', 'instagram', true, 8388608, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE
  SET public = true, file_size_limit = 8388608, allowed_mime_types = ARRAY['image/jpeg'];

-- Suben los admins desde el panel (nombres únicos, sin upsert: basta INSERT).
-- El robot de las historias sube con la service role.
DROP POLICY IF EXISTS "instagram sube admin" ON storage.objects;
CREATE POLICY "instagram sube admin" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'instagram' AND public.has_role(auth.uid(), 'admin'::app_role));

-- ─────────────────────────────────────────────────────────────────────────
-- Grupettas para el panel de Instagram. mis_grupettas solo da las del capo
-- que llama; el admin necesita las de todos para sacar y publicar su cartel.
-- La hora es la PREVISTA (lo que se anuncia), leída tal cual: hora de pared.
-- Un recorrido y una salida por grupetta: se toman el primero y la primera.
-- Solo admins: a cualquier otro le devuelve cero filas.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.grupettas_instagram()
RETURNS TABLE(
  race_id uuid, nombre text, slug text, join_code text, fecha date, hora text,
  lugar text, publicada boolean, imagen text, gpx text, capo text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT r.id, r.name, r.slug, r.join_code, r.date,
         to_char(w.salida AT TIME ZONE 'UTC', 'HH24:MI'),
         r.location, r.is_visible, r.image_url, d.gpx_file_url,
         COALESCE(NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email)
  FROM races r
  LEFT JOIN LATERAL (
    SELECT rd.gpx_file_url FROM race_distances rd
    WHERE rd.race_id = r.id ORDER BY rd.created_at LIMIT 1
  ) d ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(rw.hora_prevista, rw.start_time) AS salida FROM race_waves rw
    WHERE rw.race_id = r.id ORDER BY 1 LIMIT 1
  ) w ON true
  LEFT JOIN profiles p ON p.id = r.organizer_id
  WHERE r.group_type = 'grupetta'
    AND r.date >= public.hoy_local() - 7
    AND public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY r.date, r.created_at;
$fn$;

-- Nace con permiso explícito para anon (privilegios por defecto): se cierra a
-- los tres y se abre solo a authenticated
REVOKE EXECUTE ON FUNCTION public.grupettas_instagram() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.grupettas_instagram() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Entrada de menú «Instagram», solo en el de admin, junto a la newsletter.
-- El grupo (con emoji) se copia de la fila vecina: el SQL queda sin emojis.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.menu_items
  (menu_type, title, icon, route, view_name, parent_id, group_label, display_order, is_visible, requires_auth)
SELECT 'admin', 'Instagram', 'Instagram', NULL, 'instagram', NULL, g.grupo,
       COALESCE((SELECT max(m.display_order) FROM public.menu_items m
                 WHERE m.menu_type = 'admin' AND m.group_label IS NOT DISTINCT FROM g.grupo), 900) + 1,
       true, true
FROM (SELECT (SELECT m.group_label FROM public.menu_items m
              WHERE m.menu_type = 'admin' AND m.view_name IN ('newsletter-campaigns', 'blog-posts')
              ORDER BY (m.view_name = 'newsletter-campaigns') DESC LIMIT 1) AS grupo) g
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items m WHERE m.menu_type = 'admin' AND m.view_name = 'instagram'
);

-- ─────────────────────────────────────────────────────────────────────────
-- Comprobaciones: anon no entra a la función, y la guardia de horas en 0.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.grupettas_instagram()', 'EXECUTE') THEN
    RAISE EXCEPTION 'grupettas_instagram sigue abierta a anon';
  END IF;
  IF EXISTS (SELECT 1 FROM public.guardia_horas() WHERE nivel = 'FALLO') THEN
    RAISE EXCEPTION 'horas';
  END IF;
END $$;
