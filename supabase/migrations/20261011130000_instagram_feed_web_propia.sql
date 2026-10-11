-- Instagram, fase 2: las últimas publicaciones del club en la web propia.
--
-- La edge function pública instagram-feed lee la cuenta de la carrera
-- (race_web.contenido.contacto.redes.instagram) con Business Discovery desde la
-- cuenta de Camberas y guarda aquí lo leído una hora, también el error: cada
-- llamada gasta cupo de la cuenta de Camberas, y una cuenta personal (que Meta
-- no deja leer) no debe reintentarse en cada visita.
--
-- Escribe solo la función con la service role; los admins leen (Panel ›
-- Instagram › Webs propias, para ver por qué no sale el Instagram de un club).

CREATE TABLE IF NOT EXISTS public.instagram_feed_cache (
  usuario  text PRIMARY KEY,                 -- el @ en minúsculas, sin @
  datos    jsonb,                            -- lo que se sirve a la web; NULL si falló
  error    text,                             -- mensaje de Meta de la última lectura fallida
  generado timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.instagram_feed_cache IS
  'Caché de 1 h del Instagram de las webs propias (edge function instagram-feed, Business Discovery). Escribe solo la service role; leen los admins.';

ALTER TABLE public.instagram_feed_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_feed_cache FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.instagram_feed_cache TO authenticated;

DROP POLICY IF EXISTS "instagram_feed_cache lee admin" ON public.instagram_feed_cache;
CREATE POLICY "instagram_feed_cache lee admin" ON public.instagram_feed_cache
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
