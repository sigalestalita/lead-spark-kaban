
-- New columns
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_at timestamptz,
  ADD COLUMN IF NOT EXISTS lost_reason text;

-- Backfill stage_entered_at from last_action_at/created_at
UPDATE public.leads SET stage_entered_at = COALESCE(last_action_at, created_at) WHERE stage_entered_at IS NULL;

-- Create new stage em_contato
INSERT INTO public.stages (slug, name, position, color, is_terminal)
VALUES ('em_contato', 'Em contato', 3, '#0ea5e9', false)
ON CONFLICT DO NOTHING;

-- Reassign leads from stages to be removed
UPDATE public.leads SET stage_id = (SELECT id FROM public.stages WHERE slug='novo')
  WHERE stage_id IN (SELECT id FROM public.stages WHERE slug IN ('enriquecendo','pronto'));
UPDATE public.leads SET stage_id = (SELECT id FROM public.stages WHERE slug='em_contato')
  WHERE stage_id IN (SELECT id FROM public.stages WHERE slug='abordado');
UPDATE public.leads SET stage_id = (SELECT id FROM public.stages WHERE slug='agendado')
  WHERE stage_id IN (SELECT id FROM public.stages WHERE slug='comercial');
UPDATE public.leads SET stage_id = (SELECT id FROM public.stages WHERE slug='desqualificado')
  WHERE stage_id IN (SELECT id FROM public.stages WHERE slug='perdido');

-- Delete old stages
DELETE FROM public.stages WHERE slug IN ('enriquecendo','pronto','abordado','comercial','perdido');

-- Renumber and rename to canonical order
UPDATE public.stages SET position=1, color='#3b82f6', is_terminal=false WHERE slug='novo';
UPDATE public.stages SET position=2, color='#6366f1', is_terminal=false WHERE slug='qualificacao';
UPDATE public.stages SET position=3, color='#0ea5e9', is_terminal=false WHERE slug='em_contato';
UPDATE public.stages SET position=4, color='#f59e0b', is_terminal=false WHERE slug='aguardando';
UPDATE public.stages SET position=5, color='#10b981', is_terminal=false WHERE slug='agendado';
UPDATE public.stages SET position=6, color='#94a3b8', is_terminal=true WHERE slug='desqualificado';
