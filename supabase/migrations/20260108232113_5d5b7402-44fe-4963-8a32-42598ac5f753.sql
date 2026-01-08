
-- Añadir rol 'editor' al enum app_role
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'editor';
