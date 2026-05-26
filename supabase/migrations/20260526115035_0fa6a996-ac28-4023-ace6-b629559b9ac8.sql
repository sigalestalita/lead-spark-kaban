INSERT INTO app_settings(key, value) VALUES
 ('rd_pipeline', '{"name": "Leads - Empresa [SDR]"}'::jsonb),
 ('rd_sync_window_days', '{"days": 30}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();