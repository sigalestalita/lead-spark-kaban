
-- Helper roles
CREATE OR REPLACE FUNCTION public.is_comercial(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_manager(_user_id) OR public.has_role(_user_id, 'comercial')
$$;

CREATE OR REPLACE FUNCTION public.is_cs(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_manager(_user_id) OR public.has_role(_user_id, 'cs')
$$;

CREATE OR REPLACE FUNCTION public.is_financeiro(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_manager(_user_id) OR public.has_role(_user_id, 'financeiro')
$$;

-- Enums
DO $$ BEGIN CREATE TYPE public.deal_stage AS ENUM ('novo','qualificado','proposta','negociacao','ganho','perdido'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.cs_status AS ENUM ('onboarding','ativo','em_risco','churn'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.contract_cycle AS ENUM ('mensal','trimestral','anual','unico'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.contract_status AS ENUM ('ativo','pausado','encerrado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.invoice_status AS ENUM ('pendente','pago','atrasado','cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Commercial deals
CREATE TABLE public.commercial_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  title text NOT NULL,
  company_name text,
  amount numeric(14,2),
  currency text NOT NULL DEFAULT 'BRL',
  stage public.deal_stage NOT NULL DEFAULT 'novo',
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expected_close_date date,
  closed_at timestamptz,
  lost_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_deals TO authenticated;
GRANT ALL ON public.commercial_deals TO service_role;
ALTER TABLE public.commercial_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comercial read" ON public.commercial_deals FOR SELECT TO authenticated USING (public.is_comercial(auth.uid()));
CREATE POLICY "comercial write" ON public.commercial_deals FOR ALL TO authenticated USING (public.is_comercial(auth.uid())) WITH CHECK (public.is_comercial(auth.uid()));
CREATE TRIGGER trg_commercial_deals_updated BEFORE UPDATE ON public.commercial_deals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_commercial_deals_stage ON public.commercial_deals(stage);
CREATE INDEX idx_commercial_deals_owner ON public.commercial_deals(owner_user_id);
CREATE INDEX idx_commercial_deals_lead ON public.commercial_deals(lead_id);

-- CS customers
CREATE TABLE public.cs_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.commercial_deals(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  cs_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.cs_status NOT NULL DEFAULT 'onboarding',
  health_score int CHECK (health_score BETWEEN 0 AND 100),
  mrr numeric(14,2),
  started_at date,
  churned_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_customers TO authenticated;
GRANT ALL ON public.cs_customers TO service_role;
ALTER TABLE public.cs_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs read" ON public.cs_customers FOR SELECT TO authenticated USING (public.is_cs(auth.uid()) OR public.is_financeiro(auth.uid()));
CREATE POLICY "cs write" ON public.cs_customers FOR ALL TO authenticated USING (public.is_cs(auth.uid())) WITH CHECK (public.is_cs(auth.uid()));
CREATE TRIGGER trg_cs_customers_updated BEFORE UPDATE ON public.cs_customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_cs_customers_status ON public.cs_customers(status);
CREATE INDEX idx_cs_customers_owner ON public.cs_customers(cs_user_id);

-- Finance contracts
CREATE TABLE public.finance_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.cs_customers(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.commercial_deals(id) ON DELETE SET NULL,
  title text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  cycle public.contract_cycle NOT NULL DEFAULT 'mensal',
  status public.contract_status NOT NULL DEFAULT 'ativo',
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_contracts TO authenticated;
GRANT ALL ON public.finance_contracts TO service_role;
ALTER TABLE public.finance_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance read" ON public.finance_contracts FOR SELECT TO authenticated USING (public.is_financeiro(auth.uid()) OR public.is_cs(auth.uid()));
CREATE POLICY "finance write" ON public.finance_contracts FOR ALL TO authenticated USING (public.is_financeiro(auth.uid())) WITH CHECK (public.is_financeiro(auth.uid()));
CREATE TRIGGER trg_finance_contracts_updated BEFORE UPDATE ON public.finance_contracts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_finance_contracts_customer ON public.finance_contracts(customer_id);
CREATE INDEX idx_finance_contracts_status ON public.finance_contracts(status);

-- Finance invoices
CREATE TABLE public.finance_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES public.finance_contracts(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.cs_customers(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  due_date date NOT NULL,
  paid_at date,
  status public.invoice_status NOT NULL DEFAULT 'pendente',
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_invoices TO authenticated;
GRANT ALL ON public.finance_invoices TO service_role;
ALTER TABLE public.finance_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices read" ON public.finance_invoices FOR SELECT TO authenticated USING (public.is_financeiro(auth.uid()) OR public.is_cs(auth.uid()));
CREATE POLICY "invoices write" ON public.finance_invoices FOR ALL TO authenticated USING (public.is_financeiro(auth.uid())) WITH CHECK (public.is_financeiro(auth.uid()));
CREATE TRIGGER trg_finance_invoices_updated BEFORE UPDATE ON public.finance_invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_finance_invoices_status ON public.finance_invoices(status);
CREATE INDEX idx_finance_invoices_due ON public.finance_invoices(due_date);
CREATE INDEX idx_finance_invoices_contract ON public.finance_invoices(contract_id);

-- Auto-create CS customer + contract when a deal is marked as won
CREATE OR REPLACE FUNCTION public.on_deal_won() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_customer_id uuid;
BEGIN
  IF NEW.stage = 'ganho' AND (OLD.stage IS DISTINCT FROM 'ganho') THEN
    NEW.closed_at := COALESCE(NEW.closed_at, now());
    INSERT INTO public.cs_customers (deal_id, lead_id, company_name, mrr, status, started_at)
    VALUES (NEW.id, NEW.lead_id, COALESCE(NEW.company_name, NEW.title), NEW.amount, 'onboarding', CURRENT_DATE)
    RETURNING id INTO v_customer_id;

    INSERT INTO public.finance_contracts (customer_id, deal_id, title, amount, currency, cycle, status, start_date)
    VALUES (v_customer_id, NEW.id, NEW.title, COALESCE(NEW.amount, 0), NEW.currency, 'mensal', 'ativo', CURRENT_DATE);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_on_deal_won BEFORE UPDATE ON public.commercial_deals
FOR EACH ROW EXECUTE FUNCTION public.on_deal_won();
