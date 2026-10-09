-- =============================================================================
-- II Trail Navideño Monte Tejas 2026: precio 14 euros, confirmado por el
-- organizador el 9-oct (es lo que dice el reglamento oficial de 2026).
--
-- Había dos precios a la vez. El base del recorrido ya estaba en 14 (puesto
-- desde el panel el 29-sep), pero el tramo del 1-nov al 7-dic seguía en 13 y
-- el pago cobra el tramo vigente (redsys-init-payment y guest-register). La
-- web enseñaba 14 y desde el 1-nov se habrían cobrado 13. El texto de
-- inscripción del reglamento también decía 13.
--
-- Cierre de inscripciones (7-dic) y devoluciones (hasta el 2-dic) no se
-- tocan. El PDF del reglamento dice 1-dic para los dos y está pendiente de
-- confirmar.
--
-- Sentencias sueltas e idempotentes, sin bloques DO. APLICADA el 9-oct-2026.
-- =============================================================================

-- Tramo de precio del 1-nov al 7-dic, que es lo que se cobra
UPDATE public.race_distance_prices SET price = 14
 WHERE race_distance_id = 'b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d' AND price <> 14;

-- Precio base del recorrido (ya estaba en 14, por si se reaplica sobre otra copia)
UPDATE public.race_distances SET price = 14
 WHERE id = 'b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d' AND price <> 14;

-- Texto de inscripción del reglamento
UPDATE public.race_regulation_sections s
   SET content = replace(s.content, 'Precio: 13 €', 'Precio: 14 €')
  FROM public.race_regulations g
 WHERE g.id = s.regulation_id AND g.race_id = 'a7e3c1d0-4f2b-4c8e-9b6a-1d2e3f4a5b6c'
   AND s.section_type = 'registration' AND s.content LIKE '%Precio: 13 €%';

-- Comprobación (una fila): base, tramos y texto del reglamento, todo a 14
SELECT d.price AS base,
       (SELECT string_agg(p.price::text, ', ') FROM public.race_distance_prices p WHERE p.race_distance_id = d.id) AS tramos,
       (SELECT substring(s.content from 'Precio: [0-9]+ €') FROM public.race_regulation_sections s
          JOIN public.race_regulations g ON g.id = s.regulation_id
         WHERE g.race_id = d.race_id AND s.section_type = 'registration') AS reglamento
  FROM public.race_distances d
 WHERE d.id = 'b8f4d2e1-5a3c-4d9f-8c7b-2e3f4a5b6c7d';
