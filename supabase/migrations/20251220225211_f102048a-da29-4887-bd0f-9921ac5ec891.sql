-- Añadir 'comisario' al enum de roles
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'comisario';