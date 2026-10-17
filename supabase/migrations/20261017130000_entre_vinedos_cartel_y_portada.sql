-- =============================================================================
-- Entre Viñedos 2026: cartel de la XIX edición y portada de la web propia.
-- El cartel (1066x1600, del organizador) se sirve en 800x1200 JPG como
-- `poster_url` y entra en el pie de la web como documento «Cartel 2026»
-- (igual que Monte Tejas, 20260929130000). La portada es el recorte
-- apaisado de los corredores entre viñedos del propio cartel
-- (races.cover_image_url) y el libro de diseño pasa a «foto», encuadrada
-- arriba para que no se corten las cabezas. Idempotente.
-- Ficheros: public/fotos/entre-vinedos/{cartel-2026.jpg,portada-cartel.webp}.
-- =============================================================================
UPDATE public.races
   SET poster_url      = 'https://camberas.com/fotos/entre-vinedos/cartel-2026.jpg',
       cover_image_url = 'https://camberas.com/fotos/entre-vinedos/portada-cartel.webp'
 WHERE id = '1789e37c-0329-4cf1-ace7-32419c12db6c';

UPDATE public.race_web
   SET tema = COALESCE(tema, '{}'::jsonb) || '{"hero": "foto", "heroPosicion": "center 25%"}'::jsonb,
       contenido = contenido || jsonb_build_object('documentos',
         jsonb_build_array(jsonb_build_object('nombre', 'Cartel 2026', 'url', 'https://camberas.com/fotos/entre-vinedos/cartel-2026.jpg')))
 WHERE race_id = '1789e37c-0329-4cf1-ace7-32419c12db6c';

SELECT r.poster_url, r.cover_image_url, w.tema->>'hero' AS hero, w.contenido->'documentos' AS documentos
  FROM public.races r JOIN public.race_web w ON w.race_id = r.id
 WHERE r.id = '1789e37c-0329-4cf1-ace7-32419c12db6c';
