-- Gurriana Trail: logo del club organizador (Club Deportivo Elemental Lábaru
-- Trail) en su fila de race_sponsors (nivel 'organiza'). El original venía
-- sobre negro (PNG transparente aplanado): en public/logos/gurriana/
-- club-labaru-trail.webp va sin fondo, con su contorno blanco, a 240 px.
UPDATE public.race_sponsors
   SET logo_url = 'https://camberas.com/logos/gurriana/club-labaru-trail.webp'
 WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e'
   AND name = 'Club Deportivo Elemental Lábaru Trail';

-- Comprobación: el organizador con logo
SELECT name, level, logo_url FROM public.race_sponsors
 WHERE race_id = 'c3a9e5d2-7b1f-4e6a-9d0c-3f4a5b6c7d8e' ORDER BY display_order;
