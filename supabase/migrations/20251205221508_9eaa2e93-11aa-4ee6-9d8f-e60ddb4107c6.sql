-- Añadir campo para controlar visualización del mapa de recorrido
ALTER TABLE race_distances
ADD COLUMN show_route_map boolean DEFAULT true;

-- Establecer true donde ya hay GPX
UPDATE race_distances SET show_route_map = true WHERE gpx_file_url IS NOT NULL;