-- Gurriana Trail: escudos de los ayuntamientos y de la Junta Vecinal en sus
-- patrocinadores (race_sponsors.logo_url). Ficheros en public/logos/gurriana/,
-- recortados y a 240 px de alto (el doble de lo que se ve en pantalla).
UPDATE public.race_sponsors s
   SET logo_url = 'https://camberas.com/logos/gurriana/' || v.fichero
  FROM (VALUES
          ('Ayuntamiento de Cabezón de la Sal', 'ayto-cabezon-de-la-sal.webp'),
          ('Ayuntamiento de Ruente',            'ayto-ruente.webp'),
          ('Ayuntamiento de Cabuérniga',        'ayto-cabuerniga.webp'),
          ('Ayuntamiento de Valdáliga',         'ayto-valdaliga.webp'),
          ('Junta Vecinal Carrejo–Santibáñez',  'junta-vecinal-carrejo-santibanez.webp')
       ) AS v(nombre, fichero)
 WHERE s.race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e'
   AND s.name = v.nombre;

-- Comprobación: los cinco con logo
SELECT name, level, logo_url FROM public.race_sponsors
 WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e' ORDER BY display_order;
