
-- =========================================
-- Profiles
-- =========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_self_read" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_team_read" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- Stages (Kanban)
-- =========================================
CREATE TABLE public.stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#64748b',
  position INTEGER NOT NULL,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stages_auth_all" ON public.stages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================
-- ICP Config
-- =========================================
CREATE TABLE public.icp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'default',
  is_active BOOLEAN NOT NULL DEFAULT true,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  thresholds JSONB NOT NULL DEFAULT '{"high":70,"medium":40,"low":15}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.icp_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "icp_auth_all" ON public.icp_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================
-- Leads
-- =========================================
CREATE TYPE public.lead_priority AS ENUM ('alta','media','baixa','fora_icp','pendente');
CREATE TYPE public.enrichment_status AS ENUM ('pending','found','not_found','manual');

CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rd_deal_id TEXT UNIQUE,
  -- pessoa
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  position TEXT,
  linkedin_url TEXT,
  -- empresa
  company_name TEXT,
  company_website TEXT,
  company_linkedin TEXT,
  company_description TEXT,
  company_segment TEXT,
  company_size TEXT,
  company_location TEXT,
  company_summary TEXT,
  -- contexto de conversão
  source TEXT,
  channel TEXT,
  campaign TEXT,
  ad_name TEXT,
  form_name TEXT,
  converted_at TIMESTAMPTZ,
  form_payload JSONB,
  -- qualificação
  stage_id UUID REFERENCES public.stages(id) ON DELETE SET NULL,
  priority public.lead_priority NOT NULL DEFAULT 'pendente',
  score INTEGER NOT NULL DEFAULT 0,
  icp_signals JSONB DEFAULT '[]'::jsonb,
  probable_pain TEXT,
  next_action TEXT,
  approach_result TEXT,
  -- enriquecimento
  enrichment_status public.enrichment_status NOT NULL DEFAULT 'pending',
  enriched_at TIMESTAMPTZ,
  -- ownership / sla
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rd_status TEXT,
  rd_owner TEXT,
  last_action_at TIMESTAMPTZ,
  first_approach_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX leads_email_unique ON public.leads (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX leads_stage_idx ON public.leads (stage_id);
CREATE INDEX leads_priority_idx ON public.leads (priority);
CREATE INDEX leads_created_idx ON public.leads (created_at DESC);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_auth_all" ON public.leads FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER leads_touch BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================
-- Lead notes
-- =========================================
CREATE TABLE public.lead_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_auth_all" ON public.lead_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================
-- Lead interactions
-- =========================================
CREATE TABLE public.lead_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL, -- whatsapp, call, note, status_change, enrichment, ai_suggestion
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interactions_auth_all" ON public.lead_interactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================
-- Integration logs
-- =========================================
CREATE TABLE public.integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL, -- rd_station, lovable_ai, enrichment
  action TEXT NOT NULL,
  status TEXT NOT NULL, -- ok, error
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logs_auth_read" ON public.integration_logs FOR SELECT TO authenticated USING (true);

-- =========================================
-- App settings (key-value)
-- =========================================
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_auth_all" ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =========================================
-- Seed: stages
-- =========================================
INSERT INTO public.stages (name, slug, color, position, is_terminal) VALUES
  ('Novo lead', 'novo', '#3b82f6', 1, false),
  ('Enriquecendo dados', 'enriquecendo', '#8b5cf6', 2, false),
  ('Pronto para abordagem', 'pronto', '#06b6d4', 3, false),
  ('Abordado', 'abordado', '#0ea5e9', 4, false),
  ('Em qualificação', 'qualificacao', '#6366f1', 5, false),
  ('Aguardando retorno', 'aguardando', '#f59e0b', 6, false),
  ('Agendado', 'agendado', '#10b981', 7, false),
  ('Enviado para comercial', 'comercial', '#22c55e', 8, true),
  ('Desqualificado', 'desqualificado', '#94a3b8', 9, true),
  ('Perdido', 'perdido', '#ef4444', 10, true);

-- Seed: ICP default
INSERT INTO public.icp_config (name, rules) VALUES (
  'default',
  '{"weights":{"b2b":20,"size":20,"segment":15,"position":15,"campaign":10,"intent":20},"target_segments":["tecnologia","saas","industria","servicos"],"target_sizes":["11-50","51-200","201-500","500+"],"target_positions":["ceo","cmo","diretor","gerente","head","founder","sócio"],"target_campaigns":[]}'::jsonb
);

-- Seed: default settings
INSERT INTO public.app_settings (key, value) VALUES
  ('sla', '{"first_approach_minutes":60,"stalled_days":3}'::jsonb),
  ('whatsapp_template', '{"text":"Oi, {nome}, tudo bem? Vi que você demonstrou interesse em {tema}. Dei uma olhada rápida na {empresa} e imaginei que talvez o desafio de vocês esteja relacionado a {dor}. Faz sentido conversarmos rapidamente?"}'::jsonb),
  ('rd_pipeline', '{"name":"Leads - Empresas"}'::jsonb);
