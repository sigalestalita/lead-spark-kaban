
CREATE TABLE public.analytics_chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nova conversa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_act_threads_user ON public.analytics_chat_threads(user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_chat_threads TO authenticated;
GRANT ALL ON public.analytics_chat_threads TO service_role;
ALTER TABLE public.analytics_chat_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own threads" ON public.analytics_chat_threads FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_act_threads_touch BEFORE UPDATE ON public.analytics_chat_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.analytics_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.analytics_chat_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content TEXT NOT NULL DEFAULT '',
  tool_calls JSONB,
  tool_results JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_act_msgs_thread ON public.analytics_chat_messages(thread_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_chat_messages TO authenticated;
GRANT ALL ON public.analytics_chat_messages TO service_role;
ALTER TABLE public.analytics_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages" ON public.analytics_chat_messages FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
