-- Añadir columna timestamp_utc a gps_tracking para guardar la lectura original del GPS (UTC)
-- timestamp existente contendrá hora local España
ALTER TABLE public.gps_tracking 
ADD COLUMN timestamp_utc timestamp with time zone;

-- Migrar datos existentes: copiar timestamp actual a timestamp_utc
UPDATE public.gps_tracking 
SET timestamp_utc = timestamp;

-- Crear índice en timestamp_utc para consultas de auditoría
CREATE INDEX idx_gps_tracking_timestamp_utc ON public.gps_tracking(timestamp_utc);

-- Comentario en las columnas para claridad
COMMENT ON COLUMN public.gps_tracking.timestamp IS 'Hora local España - usar para cálculos de tiempos de carrera';
COMMENT ON COLUMN public.gps_tracking.timestamp_utc IS 'Lectura original del GPS en UTC - para auditoría';