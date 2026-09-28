-- Gurriana Trail: frase de portada (el viento que da nombre a la carrera).
-- Va en races.subtitle, que es el texto bajo el título en la portada de su
-- web y en las tarjetas del inicio y del listado de carreras. Se edita
-- también desde la ficha de la carrera en el panel.
UPDATE public.races
   SET subtitle = 'Donde el viento helado quiebra la montaña, nace la leyenda de quienes se atreven a desafiarlo'
 WHERE id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';

SELECT name, subtitle FROM public.races WHERE id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';
