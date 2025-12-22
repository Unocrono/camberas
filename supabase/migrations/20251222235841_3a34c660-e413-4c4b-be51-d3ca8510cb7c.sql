-- Primero eliminar duplicados si existen (mantener el más reciente)
DELETE FROM overlay_config a
USING overlay_config b
WHERE a.created_at < b.created_at
AND a.race_id = b.race_id;

-- Añadir constraint UNIQUE en race_id para que el upsert funcione
ALTER TABLE overlay_config 
ADD CONSTRAINT overlay_config_race_id_unique UNIQUE (race_id);