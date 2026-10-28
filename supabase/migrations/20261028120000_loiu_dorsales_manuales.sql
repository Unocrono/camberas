-- Loiu 500 Trail 2026: los 8 inscritos manuales (Club Loiu Mendi Taldea) pasan
-- de los dorsales 301 a 308 a los de debajo del último de UNO (262): del 261
-- hacia abajo, en el orden de la lista del organizador (manual-loiu-1 = 261 …
-- manual-loiu-8 = 254). Pedido por el promotor el 28-oct-2026.
-- APLICADA el 28-oct-2026 con la consulta de Lovable.
UPDATE public.registrations SET bib_number = 262 - substring(external_id from 'manual-loiu-(\d+)')::int
WHERE race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a' AND external_id LIKE 'manual-loiu-%';
