-- Loiu 500 Trail 2026: Itziar Iturregui Gamboa (RTS, Trail) venía sin dorsal.
-- Se le da el primero libre del 300 hacia abajo, el 250 (pedido por el
-- promotor el 29-oct-2026).
-- APLICADA el 29-oct-2026 con la consulta de Lovable.
UPDATE public.registrations SET bib_number = 250
WHERE race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a' AND external_id = 'rts-loc-9123B32B' AND bib_number IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.registrations x WHERE x.race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a' AND x.bib_number = 250);
