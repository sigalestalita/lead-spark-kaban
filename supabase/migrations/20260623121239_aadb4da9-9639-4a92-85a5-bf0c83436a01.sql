
-- Helper: usuário pode ver um lead (atribuído a ele OU é gestão/admin)
CREATE OR REPLACE FUNCTION public.can_access_lead(_lead_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = _lead_id
      AND (
        l.assigned_to = auth.uid()
        OR public.has_role(auth.uid(), 'super_admin')
        OR public.has_role(auth.uid(), 'gestao')
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'super_admin') OR public.has_role(_user_id, 'gestao')
$$;

-- =========================================================
-- whatsapp_accounts
-- =========================================================
CREATE TABLE public.whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text,
  phone_number text NOT NULL,
  provider text NOT NULL DEFAULT 'mock', -- mock|evolution|zapi|meta|gupshup|360dialog
  provider_instance_id text,
  provider_base_url text,
  access_token text,
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'disconnected', -- disconnected|connecting|connected|error
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_default boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_accounts TO authenticated;
GRANT ALL ON public.whatsapp_accounts TO service_role;
ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_accounts_select_authenticated" ON public.whatsapp_accounts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_accounts_manager_write" ON public.whatsapp_accounts
  FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

-- =========================================================
-- whatsapp_contacts
-- =========================================================
CREATE TABLE public.whatsapp_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  phone text NOT NULL,
  name text,
  opt_in boolean NOT NULL DEFAULT true,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(phone)
);
CREATE INDEX idx_wa_contacts_lead ON public.whatsapp_contacts(lead_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_contacts TO authenticated;
GRANT ALL ON public.whatsapp_contacts TO service_role;
ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_contacts_access" ON public.whatsapp_contacts
  FOR ALL TO authenticated
  USING (lead_id IS NULL OR public.can_access_lead(lead_id))
  WITH CHECK (lead_id IS NULL OR public.can_access_lead(lead_id));

-- =========================================================
-- whatsapp_conversations
-- =========================================================
CREATE TABLE public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open', -- open|pending|closed
  unread_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  last_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lead_id)
);
CREATE INDEX idx_wa_conv_status ON public.whatsapp_conversations(status, last_message_at DESC);
CREATE INDEX idx_wa_conv_assigned ON public.whatsapp_conversations(assigned_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_conversations TO authenticated;
GRANT ALL ON public.whatsapp_conversations TO service_role;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_conv_access" ON public.whatsapp_conversations
  FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id))
  WITH CHECK (public.can_access_lead(lead_id));

-- =========================================================
-- whatsapp_messages
-- =========================================================
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sender_type text NOT NULL, -- lead|sdr|bot
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message_type text NOT NULL DEFAULT 'text', -- text|image|file|audio|video|template
  body text,
  media_url text,
  media_mime text,
  provider_message_id text,
  status text NOT NULL DEFAULT 'sending', -- sending|sent|delivered|read|failed
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_msg_conv ON public.whatsapp_messages(conversation_id, created_at);
CREATE INDEX idx_wa_msg_lead ON public.whatsapp_messages(lead_id, created_at);
CREATE INDEX idx_wa_msg_provider ON public.whatsapp_messages(provider_message_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_msg_access" ON public.whatsapp_messages
  FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id))
  WITH CHECK (public.can_access_lead(lead_id));

-- =========================================================
-- whatsapp_templates
-- =========================================================
CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  provider_template_name text,
  category text, -- marketing|utility|authentication
  language text NOT NULL DEFAULT 'pt_BR',
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft', -- draft|pending|approved|rejected
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_tmpl_read" ON public.whatsapp_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_tmpl_manager_write" ON public.whatsapp_templates
  FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

-- =========================================================
-- whatsapp_campaigns
-- =========================================================
CREATE TABLE public.whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL,
  audience_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft', -- draft|scheduled|running|completed|failed|cancelled
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_campaigns TO authenticated;
GRANT ALL ON public.whatsapp_campaigns TO service_role;
ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_camp_read" ON public.whatsapp_campaigns
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_camp_manager_write" ON public.whatsapp_campaigns
  FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

-- =========================================================
-- whatsapp_campaign_messages
-- =========================================================
CREATE TABLE public.whatsapp_campaign_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending', -- pending|sent|delivered|read|failed|skipped
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_camp_msg_campaign ON public.whatsapp_campaign_messages(campaign_id);
GRANT SELECT ON public.whatsapp_campaign_messages TO authenticated;
GRANT ALL ON public.whatsapp_campaign_messages TO service_role;
ALTER TABLE public.whatsapp_campaign_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_camp_msg_read" ON public.whatsapp_campaign_messages
  FOR SELECT TO authenticated USING (public.is_manager(auth.uid()) OR public.can_access_lead(lead_id));

-- =========================================================
-- whatsapp_automation_rules
-- =========================================================
CREATE TABLE public.whatsapp_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_type text NOT NULL, -- lead_created|no_reply|stage_changed|meeting_scheduled|proposal_sent
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  delay_minutes integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_automation_rules TO authenticated;
GRANT ALL ON public.whatsapp_automation_rules TO service_role;
ALTER TABLE public.whatsapp_automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_auto_read" ON public.whatsapp_automation_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "wa_auto_manager_write" ON public.whatsapp_automation_rules
  FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

-- =========================================================
-- whatsapp_automation_logs
-- =========================================================
CREATE TABLE public.whatsapp_automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.whatsapp_automation_rules(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending', -- pending|sent|skipped|failed
  error text,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_automation_logs TO authenticated;
GRANT ALL ON public.whatsapp_automation_logs TO service_role;
ALTER TABLE public.whatsapp_automation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_auto_log_read" ON public.whatsapp_automation_logs
  FOR SELECT TO authenticated USING (public.is_manager(auth.uid()) OR public.can_access_lead(lead_id));

-- =========================================================
-- triggers updated_at
-- =========================================================
CREATE TRIGGER touch_wa_accounts BEFORE UPDATE ON public.whatsapp_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_wa_contacts BEFORE UPDATE ON public.whatsapp_contacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_wa_conv BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_wa_tmpl BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_wa_camp BEFORE UPDATE ON public.whatsapp_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_wa_auto BEFORE UPDATE ON public.whatsapp_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- Realtime
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;

-- =========================================================
-- Seed: conta mock default
-- =========================================================
INSERT INTO public.whatsapp_accounts (label, phone_number, provider, status, is_default)
VALUES ('Mock (desenvolvimento)', '+5511000000000', 'mock', 'connected', true)
ON CONFLICT DO NOTHING;
