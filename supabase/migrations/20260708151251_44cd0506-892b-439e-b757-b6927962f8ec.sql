ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS assumed_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS assumed_at timestamp with time zone;