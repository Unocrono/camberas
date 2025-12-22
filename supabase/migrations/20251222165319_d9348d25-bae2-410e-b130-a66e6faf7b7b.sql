-- Añadir campo heading a gps_tracking (dirección en grados 0-360)
ALTER TABLE public.gps_tracking
ADD COLUMN heading numeric NULL;

-- Añadir campo battery_level a moto_gps_tracking
ALTER TABLE public.moto_gps_tracking
ADD COLUMN battery_level integer NULL;

-- Comentarios para documentar los campos
COMMENT ON COLUMN public.gps_tracking.heading IS 'Dirección del movimiento en grados (0-360, donde 0=Norte)';
COMMENT ON COLUMN public.moto_gps_tracking.battery_level IS 'Nivel de batería del dispositivo (0-100%)';