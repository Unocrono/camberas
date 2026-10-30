-- Loiu 500 Trail 2026: Itziar Iturregui Gamboa (RTS, Trail) venía sin dorsal.
-- El 29-oct se le dio el 250 (primero libre del 300 hacia abajo) y el 30-oct
-- la organización le adjudicó el 301 en la entrega: se deja el 301.
-- APLICADA el 29 y el 30-oct-2026 con la consulta de Lovable.
UPDATE public.registrations SET bib_number = 301
WHERE race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a' AND external_id = 'rts-loc-9123B32B'
  AND NOT EXISTS (SELECT 1 FROM public.registrations x WHERE x.race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a' AND x.bib_number = 301);
