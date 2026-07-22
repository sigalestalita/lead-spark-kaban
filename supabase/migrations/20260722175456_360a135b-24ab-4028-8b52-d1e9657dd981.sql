
CREATE TABLE public.cs_signal_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id text UNIQUE,
  nome text NOT NULL,
  tipo_conta text,
  sinaleira text,
  saldo_atual numeric,
  data_expiracao_creditos text,
  meses_restantes numeric,
  meta_mensal numeric,
  consumo_ultimo_mes numeric,
  comparativo numeric,
  creditos_utilizados_total numeric,
  data_expiracao_conta text,
  motivo_sinaleira text,
  status_dados text,
  conta_desabilitada text,
  kanban_status text NOT NULL DEFAULT 'a_contatar',
  assigned_user_id uuid,
  sheet_tab text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_signal_clients TO authenticated;
GRANT ALL ON public.cs_signal_clients TO service_role;
ALTER TABLE public.cs_signal_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signal read" ON public.cs_signal_clients FOR SELECT
  USING (is_cs(auth.uid()) OR is_financeiro(auth.uid()));
CREATE POLICY "signal write" ON public.cs_signal_clients FOR ALL
  USING (is_cs(auth.uid())) WITH CHECK (is_cs(auth.uid()));
CREATE TRIGGER trg_cs_signal_clients_updated BEFORE UPDATE ON public.cs_signal_clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.cs_signal_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.cs_signal_clients(id) ON DELETE CASCADE,
  activity_type text NOT NULL,
  title text,
  notes text,
  performed_by_user_id uuid,
  performed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_signal_activities TO authenticated;
GRANT ALL ON public.cs_signal_activities TO service_role;
ALTER TABLE public.cs_signal_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signal act read" ON public.cs_signal_activities FOR SELECT
  USING (is_cs(auth.uid()) OR is_financeiro(auth.uid()));
CREATE POLICY "signal act write" ON public.cs_signal_activities FOR ALL
  USING (is_cs(auth.uid())) WITH CHECK (is_cs(auth.uid()));
CREATE INDEX idx_cs_signal_activities_client ON public.cs_signal_activities(client_id, performed_at DESC);
