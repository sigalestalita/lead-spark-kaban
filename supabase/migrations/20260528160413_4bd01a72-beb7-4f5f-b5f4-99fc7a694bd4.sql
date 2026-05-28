
-- 1. Enum de roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('super_admin', 'gestao', 'executivo', 'sdr');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tabela
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 3. Grants
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- 4. RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_roles_auth_read ON public.user_roles
  FOR SELECT TO authenticated USING (true);

-- 5. has_role helper (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

-- 6. Trigger handle_new_user atualizado: domínio + role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
  v_meta_role TEXT;
BEGIN
  -- Restringe ao domínio Grou
  IF NEW.email IS NULL OR NEW.email NOT ILIKE '%@grougp.com.br' THEN
    RAISE EXCEPTION 'Apenas emails @grougp.com.br podem se cadastrar nessa plataforma';
  END IF;

  -- Cria profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;

  -- Role
  IF LOWER(NEW.email) = 'talita.sigales@grougp.com.br' THEN
    v_role := 'super_admin';
  ELSE
    v_meta_role := NEW.raw_user_meta_data->>'role';
    BEGIN
      v_role := v_meta_role::public.app_role;
    EXCEPTION WHEN OTHERS THEN
      v_role := 'sdr';
    END;
    -- Nunca permitir auto-cadastro como super_admin
    IF v_role = 'super_admin' THEN
      v_role := 'sdr';
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Garante trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Backfill Talita se já existir
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role
FROM auth.users
WHERE LOWER(email) = 'talita.sigales@grougp.com.br'
ON CONFLICT (user_id, role) DO NOTHING;
