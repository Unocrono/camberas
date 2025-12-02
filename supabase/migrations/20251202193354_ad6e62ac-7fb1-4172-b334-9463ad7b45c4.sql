-- Migración 1: Añadir rol 'timer' al enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'timer';