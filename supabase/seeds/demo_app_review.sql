-- ============================================================================
-- Token DEMO para App Review (Apple) — camberas-track
--
-- Apple pide un QR de demostración para evaluar la app (Guideline 2.1a).
-- Este seed crea un token fijo y permanente en gps_tokens para que el equipo
-- de revisión pueda vincular un dorsal de prueba sin tocar ninguna carrera.
--
-- El QR correspondiente vive en:
--   public/demo-review-qr.png            (imagen, 512px)
--   https://camberas.com/demo-review.html (página para el revisor)
-- y codifica:
--   https://camberas.com/activar.html?t=8e2532de-1646-4140-8bf8-38a3d046fa83
--
-- event_id queda NULL a propósito: el dorsal demo no pertenece a ninguna
-- carrera, así que sus posiciones nunca aparecen en un mapa público real.
-- La app funciona completa igualmente (vinculación, tracking, SOS).
--
-- Ejecutar en el SQL editor de Supabase (producción). Es idempotente.
-- ============================================================================

-- Crear el token si no existe
INSERT INTO public.gps_tokens (token, bib_number, participant_name, active)
SELECT '8e2532de-1646-4140-8bf8-38a3d046fa83'::uuid, '999', 'Demo App Review', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.gps_tokens
  WHERE token = '8e2532de-1646-4140-8bf8-38a3d046fa83'::uuid
);

-- Si ya existía (p. ej. desactivado tras una revisión anterior), reactivarlo
-- y soltar el dispositivo que lo tuviera vinculado.
UPDATE public.gps_tokens
SET active = true, device_id = NULL, linked_at = NULL
WHERE token = '8e2532de-1646-4140-8bf8-38a3d046fa83'::uuid
  AND (active IS NOT TRUE OR device_id IS NOT NULL);

-- ── Para revocarlo cuando termine la revisión (opcional) ────────────────────
-- UPDATE public.gps_tokens
-- SET active = false
-- WHERE token = '8e2532de-1646-4140-8bf8-38a3d046fa83'::uuid;
