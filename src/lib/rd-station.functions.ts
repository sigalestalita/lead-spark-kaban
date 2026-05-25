import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateScore, type IcpRules, type IcpThresholds } from "./icp-score";

const RD_BASE = "https://crm.rdstation.com/api/v1";

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

async function fetchAllDeals(token: string, pipelineName: string) {
  const all: RdDeal[] = [];
  let page = 1;
  while (true) {
    const url = `${RD_BASE}/deals?token=${encodeURIComponent(token)}&page=${page}&limit=200&deal_pipeline_name=${encodeURIComponent(
      pipelineName
    )}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`RD Station ${res.status}: ${text.slice(0, 200)}`);
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

export const syncRdLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const token = process.env.RD_STATION_TOKEN;
    if (!token) {
      throw new Error(
        "RD_STATION_TOKEN não configurado. Adicione o token nas configurações de secrets."
      );
    }
    const { data: setting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "rd_pipeline")
      .maybeSingle();
    const pipelineName =
      ((setting?.value as { name?: string } | null)?.name as string | undefined) ??
      "Leads - Empresas";

    const { data: icp } = await supabase
      .from("icp_config")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const rules = (icp?.rules ?? {}) as IcpRules;
    const thresholds = (icp?.thresholds ?? { high: 70, medium: 40, low: 15 }) as IcpThresholds;

    const { data: stages } = await supabase.from("stages").select("id, slug");
    const newStageId = stages?.find((s) => s.slug === "novo")?.id;

    let deals: RdDeal[] = [];
    try {
      deals = await fetchAllDeals(token, pipelineName);
    } catch (e) {
      await supabase.from("integration_logs").insert({
        provider: "rd_station",
        action: "sync",
        status: "error",
        detail: { error: String(e) },
      });
      throw e;
    }

    let created = 0;
    let updated = 0;
    for (const d of deals) {
      const dealId = d._id ?? d.id;
      if (!dealId) continue;
      const contact = d.contacts?.[0];
      const email = pickEmail(d);
      const phone = pickPhone(d);
      const sourceName =
        typeof d.source === "string" ? d.source : d.source?.name ?? null;

      const candidate = {
        rd_deal_id: dealId,
        name: contact?.name ?? d.name ?? "Sem nome",
        email,
        phone,
        position: contact?.title ?? null,
        linkedin_url: contact?.linkedin ?? null,
        company_name: d.organization?.name ?? null,
        company_website: d.organization?.site ?? null,
        company_segment: d.organization?.segment ?? null,
        source: sourceName,
        campaign: d.campaign?.name ?? null,
        rd_status: d.deal_stage?.name ?? null,
        rd_owner: d.user?.name ?? null,
        converted_at: d.created_at ?? null,
      };

      const { score, priority, signals } = calculateScore(candidate, rules, thresholds);

      // upsert por rd_deal_id
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("rd_deal_id", dealId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("leads")
          .update({ ...candidate, score, priority, icp_signals: signals })
          .eq("id", existing.id);
        updated++;
      } else {
        // se já houver lead com mesmo email, atualiza no lugar
        let existingByEmail: { id: string } | null = null;
        if (email) {
          const r = await supabase
            .from("leads")
            .select("id")
            .ilike("email", email)
            .maybeSingle();
          existingByEmail = r.data ?? null;
        }
        if (existingByEmail) {
          await supabase
            .from("leads")
            .update({ ...candidate, score, priority, icp_signals: signals })
            .eq("id", existingByEmail.id);
          updated++;
        } else {
          await supabase.from("leads").insert({
            ...candidate,
            stage_id: newStageId ?? null,
            score,
            priority,
            icp_signals: signals,
            last_action_at: new Date().toISOString(),
          });
          created++;
        }
      }
    }

    await supabase.from("integration_logs").insert({
      provider: "rd_station",
      action: "sync",
      status: "ok",
      detail: { fetched: deals.length, created, updated, pipeline: pipelineName },
    });

    return { fetched: deals.length, created, updated };
  });

export const testRdConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const token = process.env.RD_STATION_TOKEN;
    if (!token) return { ok: false, message: "Token não configurado" };
    const res = await fetch(
      `${RD_BASE}/deal_pipelines?token=${encodeURIComponent(token)}`
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, message: `${res.status}: ${text.slice(0, 200)}` };
    }
    const json = (await res.json()) as { deal_pipelines?: Array<{ name: string }> };
    return {
      ok: true,
      pipelines: json.deal_pipelines?.map((p) => p.name) ?? [],
    };
  });