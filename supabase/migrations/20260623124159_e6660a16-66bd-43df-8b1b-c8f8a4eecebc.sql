
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_summary_at timestamptz,
  ADD COLUMN IF NOT EXISTS temperature text CHECK (temperature IN ('quente','morno','frio')),
  ADD COLUMN IF NOT EXISTS temperature_reason text,
  ADD COLUMN IF NOT EXISTS temperature_at timestamptz;
