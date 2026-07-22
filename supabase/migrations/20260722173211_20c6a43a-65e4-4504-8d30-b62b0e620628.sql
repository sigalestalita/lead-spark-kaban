
-- Add new roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'comercial';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cs';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'financeiro';
