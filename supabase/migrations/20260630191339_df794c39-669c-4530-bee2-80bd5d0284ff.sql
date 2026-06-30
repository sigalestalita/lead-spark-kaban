
CREATE TABLE public.whatsapp_fup_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL CHECK (trigger_type IN ('new_lead','stage_change','no_reply','ai_handoff')),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  stop_on_reply boolean NOT NULL DEFAULT true,
  stop_on_stage_ids uuid[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_fup_sequences TO authenticated;
GRANT ALL ON public.whatsapp_fup_sequences TO service_role;
ALTER TABLE public.whatsapp_fup_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fup_seq_read" ON public.whatsapp_fup_sequences FOR SELECT TO authenticated USING (true);
CREATE POLICY "fup_seq_manager_write" ON public.whatsapp_fup_sequences FOR ALL TO authenticated
  USING (is_manager(auth.uid())) WITH CHECK (is_manager(auth.uid()));
CREATE TRIGGER touch_fup_seq BEFORE UPDATE ON public.whatsapp_fup_sequences FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.whatsapp_fup_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.whatsapp_fup_sequences(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  delay_hours numeric NOT NULL DEFAULT 24,
  template_id uuid NOT NULL REFERENCES public.whatsapp_templates(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, step_order)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_fup_steps TO authenticated;
GRANT ALL ON public.whatsapp_fup_steps TO service_role;
ALTER TABLE public.whatsapp_fup_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fup_step_read" ON public.whatsapp_fup_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "fup_step_manager_write" ON public.whatsapp_fup_steps FOR ALL TO authenticated
  USING (is_manager(auth.uid())) WITH CHECK (is_manager(auth.uid()));
CREATE INDEX idx_fup_steps_seq ON public.whatsapp_fup_steps(sequence_id, step_order);

CREATE TABLE public.whatsapp_fup_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.whatsapp_fup_sequences(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','stopped_reply','stopped_stage','stopped_manual','failed')),
  current_step integer NOT NULL DEFAULT 0,
  next_run_at timestamptz,
  last_step_at timestamptz,
  last_error text,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (sequence_id, lead_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_fup_enrollments TO authenticated;
GRANT ALL ON public.whatsapp_fup_enrollments TO service_role;
ALTER TABLE public.whatsapp_fup_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fup_enr_read" ON public.whatsapp_fup_enrollments FOR SELECT TO authenticated USING (true);
CREATE POLICY "fup_enr_manager_write" ON public.whatsapp_fup_enrollments FOR ALL TO authenticated
  USING (is_manager(auth.uid())) WITH CHECK (is_manager(auth.uid()));
CREATE INDEX idx_fup_enr_due ON public.whatsapp_fup_enrollments(status, next_run_at);
CREATE INDEX idx_fup_enr_lead ON public.whatsapp_fup_enrollments(lead_id);
