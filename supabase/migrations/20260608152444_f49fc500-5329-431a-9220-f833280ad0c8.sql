
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_type text;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lead_type_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_lead_type_check
  CHECK (lead_type IS NULL OR lead_type IN ('consultoria','empresa','pessoa_fisica'));

CREATE INDEX IF NOT EXISTS leads_lead_type_idx ON public.leads(lead_type);

-- Backfill from form_payload->>'lead_type'
UPDATE public.leads SET lead_type = CASE
  WHEN lower(coalesce(form_payload->>'lead_type','')) ~ 'consultor' THEN 'consultoria'
  WHEN lower(coalesce(form_payload->>'lead_type','')) ~ 'empresa' THEN 'empresa'
  WHEN lower(coalesce(form_payload->>'lead_type','')) ~ 'f(i|í)sic' THEN 'pessoa_fisica'
  ELSE NULL
END
WHERE lead_type IS NULL AND form_payload ? 'lead_type';
