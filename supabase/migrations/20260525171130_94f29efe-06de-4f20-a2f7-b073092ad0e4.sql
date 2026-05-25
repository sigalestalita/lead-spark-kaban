
-- 1) Add external_id to lead_interactions for dedup of imported RD activities/notes
ALTER TABLE public.lead_interactions
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS lead_interactions_dedup_idx
  ON public.lead_interactions (lead_id, type, external_id)
  WHERE external_id IS NOT NULL;

-- 2) Seed default sync settings (idempotent)
INSERT INTO public.app_settings (key, value) VALUES
  ('rd_sync_window_days', '{"days": 90}'::jsonb),
  ('rd_sync_incremental_minutes', '{"minutes": 15}'::jsonb),
  ('rd_import_activities', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3) Enable scheduler extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 4) Schedule incremental sync every 15 minutes
DO $$
BEGIN
  PERFORM cron.unschedule('sync-rd-incremental');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'sync-rd-incremental',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--773e2ce3-3b97-4224-ac14-c22657fc102a.lovable.app/api/public/hooks/sync-rd',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsZm9oZ2lyamJncHFocWJudWtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjQ5NzUsImV4cCI6MjA5NTMwMDk3NX0.q6hylRJoGzz2mxWggeBqUL1ETmENog7q2K4hWMqwEGo"}'::jsonb,
    body := '{"mode":"incremental"}'::jsonb
  );
  $$
);
