-- Migrar datos: copiar timestamp_utc a timestamp donde esté disponible
-- Esto corrige los datos que tenían hora local incorrecta en timestamp
UPDATE public.gps_tracking 
SET timestamp = timestamp_utc 
WHERE timestamp_utc IS NOT NULL;

-- Eliminar el índice de timestamp_utc
DROP INDEX IF EXISTS idx_gps_tracking_timestamp_utc;

-- Eliminar la columna redundante
ALTER TABLE public.gps_tracking 
DROP COLUMN IF EXISTS timestamp_utc;

-- Actualizar comentario de la columna timestamp
COMMENT ON COLUMN public.gps_tracking.timestamp IS 'Hora del punto GPS en UTC (timestamptz)';