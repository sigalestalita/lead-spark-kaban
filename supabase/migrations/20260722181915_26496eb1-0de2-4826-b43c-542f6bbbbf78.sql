
-- ============================================================
-- HubSpot mirror tables
-- ============================================================

CREATE TABLE public.hs_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hubspot_id text NOT NULL UNIQUE,
  email text,
  first_name text,
  last_name text,
  active boolean DEFAULT true,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hs_owners TO authenticated;
GRANT ALL ON public.hs_owners TO service_role;
ALTER TABLE public.hs_owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hs_owners read managers" ON public.hs_owners FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));

CREATE TABLE public.hs_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hubspot_id text NOT NULL UNIQUE,
  email text,
  phone text,
  first_name text,
  last_name text,
  company_name text,
  jobtitle text,
  owner_hubspot_id text,
  hs_created_at timestamptz,
  hs_updated_at timestamptz,
  last_activity_at timestamptz,
  lifecyclestage text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hs_contacts TO authenticated;
GRANT ALL ON public.hs_contacts TO service_role;
ALTER TABLE public.hs_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hs_contacts read managers" ON public.hs_contacts FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));
CREATE INDEX hs_contacts_email_idx ON public.hs_contacts (lower(email));
CREATE INDEX hs_contacts_phone_idx ON public.hs_contacts (phone);
CREATE INDEX hs_contacts_owner_idx ON public.hs_contacts (owner_hubspot_id);

CREATE TABLE public.hs_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hubspot_id text NOT NULL UNIQUE,
  name text,
  domain text,
  cnpj text,
  industry text,
  numberofemployees int,
  owner_hubspot_id text,
  hs_created_at timestamptz,
  hs_updated_at timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hs_companies TO authenticated;
GRANT ALL ON public.hs_companies TO service_role;
ALTER TABLE public.hs_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hs_companies read managers" ON public.hs_companies FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));
CREATE INDEX hs_companies_name_idx ON public.hs_companies (lower(name));
CREATE INDEX hs_companies_domain_idx ON public.hs_companies (lower(domain));
CREATE INDEX hs_companies_cnpj_idx ON public.hs_companies (cnpj);

CREATE TABLE public.hs_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hubspot_id text NOT NULL UNIQUE,
  dealname text,
  amount numeric,
  currency text DEFAULT 'BRL',
  pipeline text,
  dealstage text,
  outcome text CHECK (outcome IN ('open','won','lost')) DEFAULT 'open',
  owner_hubspot_id text,
  hs_created_at timestamptz,
  hs_closed_at timestamptz,
  hs_updated_at timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hs_deals TO authenticated;
GRANT ALL ON public.hs_deals TO service_role;
ALTER TABLE public.hs_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hs_deals read managers" ON public.hs_deals FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));
CREATE INDEX hs_deals_owner_idx ON public.hs_deals (owner_hubspot_id);
CREATE INDEX hs_deals_outcome_idx ON public.hs_deals (outcome);
CREATE INDEX hs_deals_closed_idx ON public.hs_deals (hs_closed_at);

CREATE TABLE public.hs_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hubspot_id text NOT NULL UNIQUE,
  engagement_type text,   -- note, email, call, task, meeting
  subject text,
  body text,
  owner_hubspot_id text,
  occurred_at timestamptz,
  contact_hubspot_ids text[],
  company_hubspot_ids text[],
  deal_hubspot_ids text[],
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hs_engagements TO authenticated;
GRANT ALL ON public.hs_engagements TO service_role;
ALTER TABLE public.hs_engagements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hs_engagements read managers" ON public.hs_engagements FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));
CREATE INDEX hs_engagements_occurred_idx ON public.hs_engagements (occurred_at DESC);
CREATE INDEX hs_engagements_contacts_idx ON public.hs_engagements USING gin (contact_hubspot_ids);
CREATE INDEX hs_engagements_companies_idx ON public.hs_engagements USING gin (company_hubspot_ids);
CREATE INDEX hs_engagements_deals_idx ON public.hs_engagements USING gin (deal_hubspot_ids);

CREATE TABLE public.hs_associations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_type text NOT NULL,   -- contact | company | deal
  from_hubspot_id text NOT NULL,
  to_type text NOT NULL,
  to_hubspot_id text NOT NULL,
  association_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_type, from_hubspot_id, to_type, to_hubspot_id, association_label)
);
GRANT SELECT ON public.hs_associations TO authenticated;
GRANT ALL ON public.hs_associations TO service_role;
ALTER TABLE public.hs_associations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hs_associations read managers" ON public.hs_associations FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));
CREATE INDEX hs_associations_from_idx ON public.hs_associations (from_type, from_hubspot_id);
CREATE INDEX hs_associations_to_idx ON public.hs_associations (to_type, to_hubspot_id);

-- ============================================================
-- Backfill checkpoint (resumable import)
-- ============================================================
CREATE TABLE public.hs_import_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type text NOT NULL UNIQUE,  -- owners | contacts | companies | deals | engagements
  cursor_after text,
  fetched_count int NOT NULL DEFAULT 0,
  upserted_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running','paused','done','error')),
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hs_import_state TO authenticated;
GRANT ALL ON public.hs_import_state TO service_role;
ALTER TABLE public.hs_import_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hs_import_state read managers" ON public.hs_import_state FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));

-- Seed the 5 object types
INSERT INTO public.hs_import_state (object_type) VALUES
  ('owners'), ('contacts'), ('companies'), ('deals'), ('engagements')
ON CONFLICT (object_type) DO NOTHING;

-- ============================================================
-- HubSpot ↔ COMPASS matches (no field merging, just links)
-- ============================================================
CREATE TABLE public.compass_hubspot_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hs_type text NOT NULL CHECK (hs_type IN ('contact','company')),
  hs_hubspot_id text NOT NULL,
  compass_kind text NOT NULL CHECK (compass_kind IN ('lead')),
  compass_id uuid NOT NULL,
  match_key text NOT NULL CHECK (match_key IN ('email','phone','cnpj','company_name_fuzzy')),
  score numeric,
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','confirmed','discarded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hs_type, hs_hubspot_id, compass_kind, compass_id)
);
GRANT SELECT ON public.compass_hubspot_matches TO authenticated;
GRANT ALL ON public.compass_hubspot_matches TO service_role;
ALTER TABLE public.compass_hubspot_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches read managers" ON public.compass_hubspot_matches FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));
CREATE POLICY "matches update managers" ON public.compass_hubspot_matches FOR UPDATE TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE INDEX matches_hs_idx ON public.compass_hubspot_matches (hs_type, hs_hubspot_id);
CREATE INDEX matches_compass_idx ON public.compass_hubspot_matches (compass_kind, compass_id);

-- updated_at triggers
CREATE TRIGGER touch_hs_owners BEFORE UPDATE ON public.hs_owners FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_hs_contacts BEFORE UPDATE ON public.hs_contacts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_hs_companies BEFORE UPDATE ON public.hs_companies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_hs_deals BEFORE UPDATE ON public.hs_deals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_hs_import_state BEFORE UPDATE ON public.hs_import_state FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_matches BEFORE UPDATE ON public.compass_hubspot_matches FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
