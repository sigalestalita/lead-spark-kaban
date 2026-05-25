-- Unique constraint to support upsert by rd_deal_id
CREATE UNIQUE INDEX IF NOT EXISTS leads_rd_deal_id_key ON public.leads (rd_deal_id) WHERE rd_deal_id IS NOT NULL;

-- Enable realtime so Kanban auto-updates when Claude inserts
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;