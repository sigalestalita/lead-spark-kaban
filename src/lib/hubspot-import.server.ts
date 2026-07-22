import { supabaseAdmin } from "@/integrations/supabase/client.server";

const HS_BASE = "https://api.hubapi.com";
const CUTOFF_MS = new Date("2025-12-30T23:59:59Z").getTime();
const PAGE_SIZE = 100;

type ObjectType = "owners" | "contacts" | "companies" | "deals" | "engagements";

function token(): string {
  const t = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!t) throw new Error("HUBSPOT_PRIVATE_APP_TOKEN não configurado");
  return t;
}

async function hs(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("http") ? path : `${HS_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 429) {
    // rate limited — wait and retry once
    await new Promise((r) => setTimeout(r, 2000));
    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  }
  return res;
}

const CONTACT_PROPS = [
  "email", "phone", "mobilephone", "firstname", "lastname", "company",
  "jobtitle", "hubspot_owner_id", "createdate", "lastmodifieddate",
  "notes_last_updated", "lifecyclestage",
];
const COMPANY_PROPS = [
  "name", "domain", "cnpj", "industry", "numberofemployees",
  "hubspot_owner_id", "createdate", "hs_lastmodifieddate",
];
const DEAL_PROPS = [
  "dealname", "amount", "deal_currency_code", "pipeline", "dealstage",
  "hs_is_closed_won", "hs_is_closed_lost", "closedate",
  "hubspot_owner_id", "createdate", "hs_lastmodifieddate",
];

function toTs(v: unknown): string | null {
  if (!v) return null;
  const n = typeof v === "number" ? v : Date.parse(String(v));
  if (!Number.isFinite(n)) return null;
  return new Date(n).toISOString();
}

async function updateState(
  objectType: ObjectType,
  patch: Partial<{ cursor_after: string | null; fetched_count: number; upserted_count: number; status: string; last_error: string | null; started_at: string; finished_at: string | null }>,
) {
  await supabaseAdmin.from("hs_import_state")
    .update(patch)
    .eq("object_type", objectType);
}

async function getState(objectType: ObjectType) {
  const { data } = await supabaseAdmin.from("hs_import_state")
    .select("*").eq("object_type", objectType).maybeSingle();
  return data;
}

// ============================================================
// Owners (small, all-at-once)
// ============================================================
async function importOwnersBatch(): Promise<{ done: boolean; count: number }> {
  const state = await getState("owners");
  if (!state) throw new Error("owners state ausente");

  const after = state.cursor_after ?? "";
  const url = `/crm/v3/owners?limit=${PAGE_SIZE}${after ? `&after=${after}` : ""}`;
  const res = await hs(url);
  if (!res.ok) throw new Error(`owners ${res.status}: ${await res.text()}`);
  const j = await res.json() as { results: Array<Record<string, unknown>>; paging?: { next?: { after: string } } };

  const rows = (j.results ?? []).map((o) => ({
    hubspot_id: String(o.id),
    email: (o.email as string) ?? null,
    first_name: (o.firstName as string) ?? null,
    last_name: (o.lastName as string) ?? null,
    active: (o.archived as boolean) === true ? false : true,
    raw: o,
  }));
  if (rows.length) {
    const { error } = await supabaseAdmin.from("hs_owners").upsert(rows, { onConflict: "hubspot_id" });
    if (error) throw error;
  }

  const nextAfter = j.paging?.next?.after ?? null;
  const fetched = (state.fetched_count ?? 0) + rows.length;
  await updateState("owners", {
    cursor_after: nextAfter,
    fetched_count: fetched,
    upserted_count: fetched,
    status: nextAfter ? "running" : "done",
    finished_at: nextAfter ? null : new Date().toISOString(),
  });
  return { done: !nextAfter, count: rows.length };
}

// ============================================================
// Contacts / Companies / Deals (large — batch of 1 page per call)
// ============================================================
async function importObjectBatch(objectType: "contacts" | "companies" | "deals"): Promise<{ done: boolean; count: number }> {
  const state = await getState(objectType);
  if (!state) throw new Error(`${objectType} state ausente`);

  const props = objectType === "contacts" ? CONTACT_PROPS : objectType === "companies" ? COMPANY_PROPS : DEAL_PROPS;
  const after = state.cursor_after ?? "";
  const url = `/crm/v3/objects/${objectType}?limit=${PAGE_SIZE}&properties=${props.join(",")}&associations=${
    objectType === "contacts" ? "companies" : objectType === "companies" ? "contacts" : "contacts,companies"
  }${after ? `&after=${after}` : ""}`;

  const res = await hs(url);
  if (!res.ok) throw new Error(`${objectType} ${res.status}: ${await res.text()}`);
  const j = await res.json() as {
    results: Array<{
      id: string;
      properties: Record<string, string | null>;
      associations?: Record<string, { results: Array<{ id: string; type: string }> }>;
    }>;
    paging?: { next?: { after: string } };
  };

  let filtered = j.results ?? [];
  // Cutoff: skip items created after 2025-12-30
  filtered = filtered.filter((r) => {
    const created = toTs(r.properties.createdate);
    if (!created) return true;
    return new Date(created).getTime() <= CUTOFF_MS;
  });

  const associations: Array<{
    from_type: string; from_hubspot_id: string; to_type: string; to_hubspot_id: string; association_label: string | null;
  }> = [];

  if (objectType === "contacts" && filtered.length) {
    const rows = filtered.map((c) => ({
      hubspot_id: c.id,
      email: c.properties.email?.toLowerCase() ?? null,
      phone: c.properties.phone ?? c.properties.mobilephone ?? null,
      first_name: c.properties.firstname ?? null,
      last_name: c.properties.lastname ?? null,
      company_name: c.properties.company ?? null,
      jobtitle: c.properties.jobtitle ?? null,
      owner_hubspot_id: c.properties.hubspot_owner_id ?? null,
      hs_created_at: toTs(c.properties.createdate),
      hs_updated_at: toTs(c.properties.lastmodifieddate),
      last_activity_at: toTs(c.properties.notes_last_updated),
      lifecyclestage: c.properties.lifecyclestage ?? null,
      raw: c.properties,
    }));
    const { error } = await supabaseAdmin.from("hs_contacts").upsert(rows, { onConflict: "hubspot_id" });
    if (error) throw error;
    for (const c of filtered) {
      for (const a of c.associations?.companies?.results ?? []) {
        associations.push({ from_type: "contact", from_hubspot_id: c.id, to_type: "company", to_hubspot_id: a.id, association_label: a.type ?? null });
      }
    }
  } else if (objectType === "companies" && filtered.length) {
    const rows = filtered.map((c) => ({
      hubspot_id: c.id,
      name: c.properties.name ?? null,
      domain: c.properties.domain?.toLowerCase() ?? null,
      cnpj: c.properties.cnpj ?? null,
      industry: c.properties.industry ?? null,
      numberofemployees: c.properties.numberofemployees ? Number(c.properties.numberofemployees) : null,
      owner_hubspot_id: c.properties.hubspot_owner_id ?? null,
      hs_created_at: toTs(c.properties.createdate),
      hs_updated_at: toTs(c.properties.hs_lastmodifieddate),
      raw: c.properties,
    }));
    const { error } = await supabaseAdmin.from("hs_companies").upsert(rows, { onConflict: "hubspot_id" });
    if (error) throw error;
  } else if (objectType === "deals" && filtered.length) {
    const rows = filtered.map((d) => {
      const won = d.properties.hs_is_closed_won === "true";
      const lost = d.properties.hs_is_closed_lost === "true";
      return {
        hubspot_id: d.id,
        dealname: d.properties.dealname ?? null,
        amount: d.properties.amount ? Number(d.properties.amount) : null,
        currency: d.properties.deal_currency_code ?? "BRL",
        pipeline: d.properties.pipeline ?? null,
        dealstage: d.properties.dealstage ?? null,
        outcome: won ? "won" : lost ? "lost" : "open",
        owner_hubspot_id: d.properties.hubspot_owner_id ?? null,
        hs_created_at: toTs(d.properties.createdate),
        hs_closed_at: toTs(d.properties.closedate),
        hs_updated_at: toTs(d.properties.hs_lastmodifieddate),
        raw: d.properties,
      };
    });
    const { error } = await supabaseAdmin.from("hs_deals").upsert(rows, { onConflict: "hubspot_id" });
    if (error) throw error;
    for (const d of filtered) {
      for (const a of d.associations?.contacts?.results ?? []) {
        associations.push({ from_type: "deal", from_hubspot_id: d.id, to_type: "contact", to_hubspot_id: a.id, association_label: a.type ?? null });
      }
      for (const a of d.associations?.companies?.results ?? []) {
        associations.push({ from_type: "deal", from_hubspot_id: d.id, to_type: "company", to_hubspot_id: a.id, association_label: a.type ?? null });
      }
    }
  }

  if (associations.length) {
    await supabaseAdmin.from("hs_associations").upsert(associations, {
      onConflict: "from_type,from_hubspot_id,to_type,to_hubspot_id,association_label",
    });
  }

  const nextAfter = j.paging?.next?.after ?? null;
  const totalFetched = (state.fetched_count ?? 0) + (j.results?.length ?? 0);
  const totalUpserted = (state.upserted_count ?? 0) + filtered.length;
  await updateState(objectType, {
    cursor_after: nextAfter,
    fetched_count: totalFetched,
    upserted_count: totalUpserted,
    status: nextAfter ? "running" : "done",
    finished_at: nextAfter ? null : new Date().toISOString(),
  });
  return { done: !nextAfter, count: j.results?.length ?? 0 };
}

// ============================================================
// Public API
// ============================================================
export async function runImportBatch(objectType: ObjectType, maxPages = 5): Promise<{ pagesRun: number; done: boolean }> {
  const state = await getState(objectType);
  if (!state) throw new Error(`${objectType} state ausente`);
  if (state.status === "done") return { pagesRun: 0, done: true };
  if (state.status === "paused") return { pagesRun: 0, done: false };

  await updateState(objectType, {
    status: "running",
    started_at: state.started_at ?? new Date().toISOString(),
    last_error: null,
  });

  let pages = 0;
  try {
    for (let i = 0; i < maxPages; i++) {
      const r = objectType === "owners"
        ? await importOwnersBatch()
        : objectType === "engagements"
        ? { done: true, count: 0 } // fase 2
        : await importObjectBatch(objectType);
      pages++;
      if (r.done) return { pagesRun: pages, done: true };
    }
    return { pagesRun: pages, done: false };
  } catch (e) {
    await updateState(objectType, {
      status: "error",
      last_error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export async function startImportAll(): Promise<void> {
  const order: ObjectType[] = ["owners", "contacts", "companies", "deals"];
  for (const o of order) {
    const s = await getState(o);
    if (s?.status === "done") continue;
    await updateState(o, { status: "running", started_at: new Date().toISOString(), last_error: null });
  }
}

export async function pauseImport(objectType: ObjectType): Promise<void> {
  await updateState(objectType, { status: "paused" });
}

export async function resetImport(objectType: ObjectType): Promise<void> {
  await updateState(objectType, {
    status: "idle",
    cursor_after: null,
    fetched_count: 0,
    upserted_count: 0,
    started_at: undefined,
    finished_at: null,
    last_error: null,
  });
}

// pg_cron tick — advance whichever object is running
export async function tickImportAll(maxPagesEach = 3): Promise<Record<string, unknown>> {
  const order: ObjectType[] = ["owners", "contacts", "companies", "deals"];
  const results: Record<string, unknown> = {};
  for (const o of order) {
    const s = await getState(o);
    if (!s || s.status !== "running") continue;
    try {
      results[o] = await runImportBatch(o, maxPagesEach);
    } catch (e) {
      results[o] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return results;
}
