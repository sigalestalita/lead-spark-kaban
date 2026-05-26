import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRdTokenInfo, type RdTokenSource } from "./rd-token.server";
import { calculateScore, type IcpRules, type IcpThresholds } from "./icp-score";

const RD_BASE = "https://crm.rdstation.com/api/v1";

function buildRdErrorMessage(status: number, body: string, source: RdTokenSource) {
  const detail = body.slice(0, 200);
  if (status === 401) {
    return source === "env"
      ? "RD Station recusou o token configurado. Reconecte o RD em Configurações para gerar um novo token autorizado."
      : "RD Station recusou a conexão atual. Reconecte o RD em Configurações e tente novamente.";
  }
  return `RD Station ${status}: ${detail}`;
}

interface RdDeal {
  _id?: string;
  id?: string;
  name?: string;
  amount_total?: number;
  deal_stage?: { name?: string; _id?: string };
  contacts?: Array<{
    name?: string;
    title?: string;
    emails?: Array<{ email: string }>;
    phones?: Array<{ phone: string; type?: string }>;
    linkedin?: string;
  }>;
  organization?: { name?: string; segment?: string; site?: string };
  user?: { name?: string; email?: string };
  campaign?: { name?: string };
  source?: { name?: string } | string;
  created_at?: string;
  deal_custom_fields?: Array<{ label?: string; value?: unknown }>;
}

function pickEmail(d: RdDeal): string | null {
  return d.contacts?.[0]?.emails?.[0]?.email ?? null;
}
function pickPhone(d: RdDeal): string | null {
  return d.contacts?.[0]?.phones?.[0]?.phone ?? null;
}

function pickCompanyName(d: RdDeal): string | null {
  // 1) organização vinculada (caminho padrão)
  const orgName = d.organization?.name?.trim();
  if (orgName) return orgName;
  // 2) fallback: campos customizados do deal com rótulos comuns
  const labels = ["empresa", "company", "organização", "organizacao", "nome da empresa"];
  const cf = d.deal_custom_fields ?? [];
  for (const f of cf) {
    const label = (f.label ?? "").toString().trim().toLowerCase();
    if (!label) continue;
    if (labels.some((l) => label.includes(l))) {
      const v = f.value;
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

async function fetchAllDeals(
  token: string,
  tokenSource: RdTokenSource,
  pipelineName: string,
  startDate?: string,
  endDate?: string,
) {
  const all: RdDeal[] = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams({
      page: String(page),
      limit: "200",
      deal_pipeline_name: pipelineName,
    });
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    params.set("token", token);
    const url = `${RD_BASE}/deals?${params.toString()}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(buildRdErrorMessage(res.status, text, tokenSource));
    }
    const json = (await res.json()) as { deals?: RdDeal[]; has_more?: boolean };
    const deals = json.deals ?? [];
    all.push(...deals);
    if (!json.has_more || deals.length === 0) break;
    page += 1;
    if (page > 25) break; // hard cap
  }
  return all;
}

interface RdActivity {
  _id?: string;
  id?: string;
  text?: string;
  subject?: string;
  type?: string;
  activity_kind?: string;
  created_at?: string;
  user?: { name?: string };
}

async function fetchDealActivities(token: string, dealId: string): Promise<RdActivity[]> {
  const params = new URLSearchParams({ token });
  const url = `${RD_BASE}/deals/${encodeURIComponent(dealId)}/activities?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const json = (await res.json()) as { activities?: RdActivity[] };
  return json.activities ?? [];
}

async function fetchDealNotes(token: string, dealId: string): Promise<RdActivity[]> {
  const params = new URLSearchParams({ token });
  const url = `${RD_BASE}/deals/${encodeURIComponent(dealId)}/notes?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const json = (await res.json()) as { notes?: RdActivity[] };
  return json.notes ?? [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type SyncMode = "full" | "incremental";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runRdSync(supabase: any, mode: SyncMode) {
  const { token, source: tokenSource } = await getRdTokenInfo();
  if (!token) {
    throw new Error("RD Station não conectado. Conecte em Configurações.");
  }

  // load settings
  const { data: settingsRows } = await supabase.from("app_settings").select("key, value");
  const settings = new Map<string, Record<string, unknown>>(
    ((settingsRows ?? []) as Array<{ key: string; value: unknown }>).map((s) => [
      s.key,
      (s.value ?? {}) as Record<string, unknown>,
    ]),
  );
  const get = (k: string) => settings.get(k) ?? {};
  const pipelineName = (get("rd_pipeline").name as string | undefined) ?? "Leads - Empresas";
  const windowDays = Number((get("rd_sync_window_days").days as number | undefined) ?? 90);
  const incrementalMinutes = Number((get("rd_sync_incremental_minutes").minutes as number | undefined) ?? 15);
  const importActivities = (get("rd_import_activities").enabled as boolean | undefined) !== false;

  let startDate: string | undefined;
  const endDate = new Date().toISOString();
  if (mode === "full") {
    startDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  } else {
    const lastSync = get("rd_last_sync_at").value as string | undefined;
    const fallbackMs = incrementalMinutes * 60 * 1000;
    const fromMs = lastSync ? Math.min(new Date(lastSync).getTime(), Date.now() - fallbackMs) : Date.now() - fallbackMs;
    startDate = new Date(fromMs - 60 * 1000).toISOString(); // 1min overlap
  }

  const { data: icp } = await supabase
    .from("icp_config")
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const rules = (icp?.rules ?? {}) as unknown as IcpRules;
  const thresholds = (icp?.thresholds ?? { high: 70, medium: 40, low: 15 }) as unknown as IcpThresholds;

  const { data: stages } = await supabase.from("stages").select("id, slug");
  const newStageId = (stages as Array<{ id: string; slug: string }> | null)?.find((s) => s.slug === "novo")?.id;

  let deals: RdDeal[] = [];
  try {
    deals = await fetchAllDeals(token, tokenSource, pipelineName, startDate, endDate);
  } catch (e) {
    await supabase.from("integration_logs").insert({
      provider: "rd_station",
      action: `sync_${mode}`,
      status: "error",
      detail: { error: e instanceof Error ? e.message : String(e), tokenSource },
    });
    throw e;
  }

  let created = 0;
  let updated = 0;
  let interactionsCount = 0;

  for (const d of deals) {
    const dealId = d._id ?? d.id;
    if (!dealId) continue;
    const contact = d.contacts?.[0];
    const email = pickEmail(d);
    const phone = pickPhone(d);
    const sourceName = typeof d.source === "string" ? d.source : d.source?.name ?? null;

    const candidate = {
      rd_deal_id: dealId,
      name: contact?.name ?? d.name ?? "Sem nome",
      email,
      phone,
      position: contact?.title ?? null,
      linkedin_url: contact?.linkedin ?? null,
      company_name: pickCompanyName(d),
      company_website: d.organization?.site ?? null,
      company_segment: d.organization?.segment ?? null,
      source: sourceName,
      campaign: d.campaign?.name ?? null,
      rd_status: d.deal_stage?.name ?? null,
      rd_owner: d.user?.name ?? null,
      converted_at: d.created_at ?? null,
    };

    const { score, priority, signals } = calculateScore(candidate, rules, thresholds);

    let leadId: string | null = null;
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("rd_deal_id", dealId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("leads")
        .update({ ...candidate, score, priority, icp_signals: signals as never })
        .eq("id", existing.id);
      leadId = existing.id;
      updated++;
    } else {
      let existingByEmail: { id: string } | null = null;
      if (email) {
        const r = await supabase.from("leads").select("id").ilike("email", email).maybeSingle();
        existingByEmail = r.data ?? null;
      }
      if (existingByEmail) {
        await supabase
          .from("leads")
          .update({ ...candidate, score, priority, icp_signals: signals as never })
          .eq("id", existingByEmail.id);
        leadId = existingByEmail.id;
        updated++;
      } else {
        const { data: ins } = await supabase
          .from("leads")
          .insert({
            ...candidate,
            stage_id: newStageId ?? null,
            score,
            priority,
            icp_signals: signals as never,
            last_action_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        leadId = ins?.id ?? null;
        created++;
      }
    }

    if (importActivities && leadId) {
      try {
        const [acts, notes] = await Promise.all([
          fetchDealActivities(token, dealId),
          fetchDealNotes(token, dealId),
        ]);
        const rows: Array<{
          lead_id: string;
          type: string;
          content: string | null;
          metadata: Record<string, unknown>;
          external_id: string;
          created_at: string;
        }> = [];
        for (const a of acts) {
          const eid = a._id ?? a.id;
          if (!eid) continue;
          rows.push({
            lead_id: leadId,
            type: "rd_activity",
            content: a.text ?? a.subject ?? null,
            metadata: { kind: a.activity_kind ?? a.type, user: a.user?.name } as Record<string, unknown>,
            external_id: String(eid),
            created_at: a.created_at ?? new Date().toISOString(),
          });
        }
        for (const n of notes) {
          const eid = n._id ?? n.id;
          if (!eid) continue;
          rows.push({
            lead_id: leadId,
            type: "rd_note",
            content: n.text ?? null,
            metadata: { user: n.user?.name } as Record<string, unknown>,
            external_id: String(eid),
            created_at: n.created_at ?? new Date().toISOString(),
          });
        }
        if (rows.length > 0) {
          const { error } = await supabase
            .from("lead_interactions")
            .upsert(rows as never, { onConflict: "lead_id,type,external_id", ignoreDuplicates: true });
          if (!error) interactionsCount += rows.length;
        }
        await sleep(50);
      } catch {
        /* skip on per-deal error */
      }
    }
  }

  await supabase
    .from("app_settings")
    .upsert({ key: "rd_last_sync_at", value: { value: new Date().toISOString() } as never });

  await supabase.from("integration_logs").insert({
    provider: "rd_station",
    action: `sync_${mode}`,
    status: "ok",
    detail: { fetched: deals.length, created, updated, interactions: interactionsCount, pipeline: pipelineName, startDate, endDate },
  });

  return { fetched: deals.length, created, updated, interactions: interactionsCount, pipeline: pipelineName, mode };
}

export const syncRdLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const result = await runRdSync(context.supabase as never, "full");
      return { ok: true, ...result };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        error: message,
        reconnectRequired: message.includes("RD Station recusou"),
        fetched: 0,
        created: 0,
        updated: 0,
        interactions: 0,
        pipeline: null,
        mode: "full" as const,
      };
    }
  });

export const testRdConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { token, source: tokenSource } = await getRdTokenInfo();
    if (!token) return { ok: false, message: "RD Station não conectado" };
    const res = await fetch(`${RD_BASE}/deal_pipelines?${new URLSearchParams({ token }).toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, message: buildRdErrorMessage(res.status, text, tokenSource) };
    }
    const json = (await res.json()) as { deal_pipelines?: Array<{ name: string }> };
    return {
      ok: true,
      pipelines: json.deal_pipelines?.map((p) => p.name) ?? [],
    };
  });

export const getRecentSyncLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("integration_logs")
      .select("*")
      .eq("provider", "rd_station")
      .order("created_at", { ascending: false })
      .limit(20);
    return { logs: data ?? [] };
  });