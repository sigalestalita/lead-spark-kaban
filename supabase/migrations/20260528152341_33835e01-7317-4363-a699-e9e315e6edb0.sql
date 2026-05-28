CREATE TABLE public.weekly_digests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  content_html TEXT NOT NULL,
  content_summary TEXT,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.weekly_digests TO authenticated;
GRANT ALL ON public.weekly_digests TO service_role;

ALTER TABLE public.weekly_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "digests_auth_read"
ON public.weekly_digests
FOR SELECT
TO authenticated
USING (true);

CREATE TRIGGER weekly_digests_touch_updated_at
BEFORE UPDATE ON public.weekly_digests
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_weekly_digests_week_start ON public.weekly_digests(week_start DESC);