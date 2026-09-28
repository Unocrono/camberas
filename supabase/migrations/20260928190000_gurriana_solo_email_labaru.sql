-- Gurriana: en contacto solo el correo del club (labarutrail@gmail.com, que
-- sale de races.organizer_email). Se quita el de la carrera
-- (lagurrianatrail@gmail.com), guardado como «email de protección de datos»
-- en race_web.contenido.contacto.emailDatos: desaparece del pie y de la
-- página legal, que queda con el del club.
UPDATE public.race_web
   SET contenido = jsonb_set(contenido, '{contacto}', (contenido->'contacto') - 'emailDatos')
 WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e'
   AND jsonb_typeof(contenido->'contacto') = 'object';

-- Comprobación: sin emailDatos
SELECT contenido->'contacto' AS contacto FROM public.race_web
 WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e';
