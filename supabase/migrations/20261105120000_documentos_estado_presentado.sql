-- =============================================================================
-- Documentación de carreras: estado «presentado».
--
-- Entre «en revisión» (lo tenemos en la mano) y «aprobado» (resuelto) faltaba
-- el estado de lo que ya está en manos de la Administración y espera
-- resolución: e-TRAZA presentado, solicitud a Montes registrada, instancia al
-- Ayuntamiento con número de registro. Pedido por el promotor el 5-nov-2026
-- para el II Trail Navideño Monte Tejas.
--
-- Aplicada en producción el 5-nov-2026 (ensayada antes con BEGIN … ROLLBACK).
-- Los paneles (admin y /org) leen el nuevo estado desde el mismo commit.
-- =============================================================================

ALTER TABLE public.race_documents DROP CONSTRAINT IF EXISTS race_documents_status_check;
ALTER TABLE public.race_documents ADD CONSTRAINT race_documents_status_check
  CHECK (status IN ('pendiente','subido','en_revision','presentado','aprobado','rechazado','caducado'));

-- Comprobación
SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
 WHERE c.conrelid = 'public.race_documents'::regclass AND c.conname = 'race_documents_status_check';
