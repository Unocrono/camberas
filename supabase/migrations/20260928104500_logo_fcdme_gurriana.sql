-- Gurriana Trail: logo de la Federación Cántabra de Deportes de Montaña y
-- Escalada en su patrocinador (race_sponsors.logo_url). Fichero en
-- public/logos/gurriana/fcdme.webp: el disco recortado en círculo, fondo
-- transparente, 240 px (el doble de lo que se ve en pantalla).
UPDATE public.race_sponsors
   SET logo_url = 'https://camberas.com/logos/gurriana/fcdme.webp'
 WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e'
   AND name = 'FCDME';

-- Comprobación: los seis patrocinadores con logo
SELECT name, level, logo_url FROM public.race_sponsors
 WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e' ORDER BY display_order;
