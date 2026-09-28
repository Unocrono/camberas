-- Gurriana Trail: portada con dos fotos.
--   Escritorio: «hoy» (atardecer sobre la sierra), races.cover_image_url.
--   Móvil: «cortafuegos» (corredores subiendo la ladera, vertical), en
--   race_web.contenido.imagenes.heroMovil: Camberas no tiene columna para una
--   segunda portada y evento_publico ya suma las imágenes de la web.
-- El encuadre del libro de diseño (heroPosicion) es el de escritorio; la foto
-- del móvil va centrada. Ficheros en public/fotos/gurriana/.
UPDATE public.races
   SET cover_image_url = 'https://camberas.com/fotos/gurriana/portada-hoy.webp'
 WHERE id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';

UPDATE public.race_web
   SET contenido = jsonb_set(COALESCE(contenido, '{}'::jsonb), '{imagenes}',
         COALESCE(contenido->'imagenes', '{}'::jsonb)
         || '{"heroMovil": "https://camberas.com/fotos/gurriana/portada-cortafuegos-movil.webp"}'::jsonb),
       tema = COALESCE(tema, '{}'::jsonb) || '{"hero": "foto", "heroPosicion": "center 25%"}'::jsonb
 WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';

-- Comprobación: hero de escritorio y de móvil
SELECT public.evento_publico('gurriana-trail-2027')->'imagenes' AS imagenes,
       public.evento_publico('gurriana-trail-2027')->'marca'->>'heroPosicion' AS encuadre;
