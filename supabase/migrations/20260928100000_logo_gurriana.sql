-- Gurriana Trail: logo (icono de montañas y agua, vectorizado del original)
-- como logo de la carrera. La cabecera de su web lo enseña en vez del nombre.
UPDATE public.races
   SET logo_url = 'https://camberas.com/logos/gurriana-trail-icono.svg'
 WHERE id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';

SELECT name, logo_url FROM public.races WHERE id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';
