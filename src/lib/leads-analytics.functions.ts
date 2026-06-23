import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Analytics agregadas de leads: perfil, origem (campanha/ad/canal/fonte),
 * evolução no funil, conversão por campanha/ad x perfil. Respeita RLS.
 */
export const getLeadsAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        dimension: z.enum(["campaign", "ad_name", "source", "channel", "form_name"]).optional(),
      })
      .optional()
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const now = new Date();
    const to = data?.to ? new Date(data.to) : now;
    const from = data?.from ? new Date(data.from) : new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const fromISO = from.toISOString();
    const toISO = to.toISOString();
    const dimension = data?.dimension ?? "campaign";

    const { data: stagesData } = await supabase
      .from("stages")
      .select("id, name, slug, position, is_terminal")
      .order("position");
    const stages = stagesData ?? [];
    const stageMap = new Map(stages.map((s) => [s.id, s]));

    const { data: leadsData, error } = await supabase
      .from("leads")
      .select(
        "id, created_at, source, channel, campaign, ad_name, form_name, stage_id, priority, score, lead_type, company_segment, company_size, linkedin_company_size, company_location, meeting_at, lost_reason, first_approach_at, converted_at",
      )
      .gte("created_at", fromISO)
      .lte("created_at", toISO)
      .limit(20000);
    if (error) throw new Error(error.message);
    const leads = leadsData ?? [];

    function isWon(stageId: string | null): boolean {
      if (!stageId) return false;
      const s = stageMap.get(stageId);
      if (!s || !s.is_terminal) return false;
      const n = (s.name || s.slug || "").toLowerCase();
      return /ganho|cliente|fechad|won|venda/.test(n);
    }
    function isLost(stageId: string | null): boolean {
      if (!stageId) return false;
      const s = stageMap.get(stageId);
      if (!s || !s.is_terminal) return false;
      const n = (s.name || s.slug || "").toLowerCase();
      return /perd|lost|descart/.test(n);
    }

    const dayBuckets = new Map<string, { date: string; total: number; won: number; lost: number; meeting: number }>();
    for (const l of leads) {
      const d = (l.created_at as string).slice(0, 10);
      const b = dayBuckets.get(d) ?? { date: d, total: 0, won: 0, lost: 0, meeting: 0 };
      b.total += 1;
      if (isWon(l.stage_id)) b.won += 1;
      if (isLost(l.stage_id)) b.lost += 1;
      if (l.meeting_at) b.meeting += 1;
      dayBuckets.set(d, b);
    }
    const series = Array.from(dayBuckets.values()).sort((a, b) => a.date.localeCompare(b.date));

    const stageCounts = new Map<string, number>();
    for (const l of leads) {
      const key = l.stage_id ?? "—";
      stageCounts.set(key, (stageCounts.get(key) ?? 0) + 1);
    }
    const funnel = stages.map((s) => ({
      stage_id: s.id,
      name: s.name,
      position: s.position,
      is_terminal: s.is_terminal,
      count: stageCounts.get(s.id) ?? 0,
    }));
    const unstaged = stageCounts.get("—") ?? 0;

    function bucketize(getter: (l: (typeof leads)[number]) => string | null | undefined) {
      const m = new Map<string, number>();
      for (const l of leads) {
        const v = (getter(l) || "—").toString().trim() || "—";
        m.set(v, (m.get(v) ?? 0) + 1);
      }
      return Array.from(m.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);
    }
    const profile = {
      lead_type: bucketize((l) => l.lead_type),
      priority: bucketize((l) => l.priority as string),
      segment: bucketize((l) => l.company_segment).slice(0, 12),
      size: bucketize((l) => l.company_size || l.linkedin_company_size).slice(0, 10),
      location: bucketize((l) => l.company_location).slice(0, 10),
      source: bucketize((l) => l.source).slice(0, 12),
      channel: bucketize((l) => l.channel).slice(0, 12),
    };

    type DimRow = {
      key: string;
      total: number;
      won: number;
      lost: number;
      meeting: number;
      contacted: number;
      avgScore: number;
      hot: number;
      byStage: Record<string, number>;
      byType: Record<string, number>;
    };
    const dimMap = new Map<string, DimRow>();
    for (const l of leads) {
      const raw = (l as unknown as Record<string, unknown>)[dimension] as string | null | undefined;
      const key = (raw || "—").toString().trim() || "—";
      const r = dimMap.get(key) ?? {
        key,
        total: 0, won: 0, lost: 0, meeting: 0, contacted: 0, avgScore: 0, hot: 0,
        byStage: {}, byType: {},
      };
      r.total += 1;
      if (isWon(l.stage_id)) r.won += 1;
      if (isLost(l.stage_id)) r.lost += 1;
      if (l.meeting_at) r.meeting += 1;
      if (l.first_approach_at) r.contacted += 1;
      r.avgScore += l.score ?? 0;
      if ((l.priority as string) === "quente") r.hot += 1;
      const sk = l.stage_id ?? "—";
      r.byStage[sk] = (r.byStage[sk] ?? 0) + 1;
      const tk = l.lead_type ?? "—";
      r.byType[tk] = (r.byType[tk] ?? 0) + 1;
      dimMap.set(key, r);
    }
    const byDimension = Array.from(dimMap.values())
      .map((r) => ({
        ...r,
        avgScore: r.total > 0 ? Math.round(r.avgScore / r.total) : 0,
        winRate: r.total > 0 ? r.won / r.total : 0,
        meetingRate: r.total > 0 ? r.meeting / r.total : 0,
        contactRate: r.total > 0 ? r.contacted / r.total : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const lostReasons = new Map<string, number>();
    for (const l of leads) {
      if (!isLost(l.stage_id)) continue;
      const k = (l.lost_reason || "Sem razão").toString().trim() || "Sem razão";
      lostReasons.set(k, (lostReasons.get(k) ?? 0) + 1);
    }
    const lostBreakdown = Array.from(lostReasons.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const totals = {
      leads: leads.length,
      won: leads.filter((l) => isWon(l.stage_id)).length,
      lost: leads.filter((l) => isLost(l.stage_id)).length,
      meetings: leads.filter((l) => l.meeting_at).length,
      contacted: leads.filter((l) => l.first_approach_at).length,
      hot: leads.filter((l) => (l.priority as string) === "quente").length,
    };

    return {
      period: { from: fromISO, to: toISO },
      dimension,
      totals,
      series,
      funnel,
      unstaged,
      profile,
      byDimension: byDimension.slice(0, 50),
      lostBreakdown,
      stages: stages.map((s) => ({ id: s.id, name: s.name, position: s.position, is_terminal: s.is_terminal })),
    };
  });
