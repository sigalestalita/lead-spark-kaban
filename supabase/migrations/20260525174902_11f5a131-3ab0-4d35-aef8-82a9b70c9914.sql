CREATE TABLE public.rd_oauth_tokens (
  id boolean PRIMARY KEY DEFAULT true,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  connected_by uuid,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = true)
);

ALTER TABLE public.rd_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rd_oauth_read_auth" ON public.rd_oauth_tokens
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER rd_oauth_tokens_touch
  BEFORE UPDATE ON public.rd_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();