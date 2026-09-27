-- Gurriana Trail: portada con foto (valle desde la sierra, con un corredor en la
-- cresta). La foto es la «Portada» de la carrera (races.cover_image_url) y el
-- libro de diseño pasa a portada de foto, encuadrada abajo a la derecha, donde
-- está el corredor. Sirve también de imagen al compartir en redes (og:image).
UPDATE public.races
   SET cover_image_url = 'https://camberas.com/fotos/gurriana/portada-valle.webp'
 WHERE id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';

UPDATE public.race_web
   SET tema = COALESCE(tema, '{}'::jsonb) || '{"hero": "foto", "heroPosicion": "70% 60%"}'::jsonb
 WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';

SELECT r.cover_image_url, w.tema->>'hero' AS hero, w.tema->>'heroPosicion' AS encuadre
  FROM public.races r JOIN public.race_web w ON w.race_id = r.id
 WHERE r.id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';
