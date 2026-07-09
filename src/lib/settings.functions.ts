import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LeadRoutingRuleSchema = z.object({
  leadType: z.enum(["consultoria", "empresa", "pessoa_fisica"]),
  userId: z.string().uuid(),
});

const LeadRoutingSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  fallbackMode: z.literal("general_queue").default("general_queue"),
  rules: z.array(LeadRoutingRuleSchema).max(10).default([]),
});

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: settings }, { data: stages }, { data: icp }] = await Promise.all([
      supabase.from("app_settings").select("*"),
      supabase.from("stages").select("*").order("position"),
      supabase.from("icp_config").select("*").eq("is_active", true).limit(1).maybeSingle(),
    ]);
    return {
      settings: settings ?? [],
      stages: stages ?? [],
      icp,
      rdTokenConfigured: !!process.env.RD_STATION_TOKEN,
    };
  });

export const updateSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ key: z.string().min(1).max(100), value: z.unknown() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: data.key, value: data.value as never, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getLeadRoutingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readLeadRoutingSettings } = await import("./lead-routing.server");
    const [settings, profilesRes] = await Promise.all([
      readLeadRoutingSettings(context.supabase),
      context.supabase.from("profiles").select("id, full_name, email").order("full_name"),
    ]);
    if (profilesRes.error) throw new Error(profilesRes.error.message);
    return { settings, profiles: profilesRes.data ?? [] };
  });

export const updateLeadRoutingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => LeadRoutingSettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isMgr, error: roleError } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (roleError) throw new Error(roleError.message);
    if (!isMgr) throw new Error("Apenas gestão/admin pode alterar o roteamento do inbox.");

    const { LEAD_ROUTING_SETTINGS_KEY } = await import("./lead-routing.server");
    const { error } = await context.supabase
      .from("app_settings")
      .upsert({
        key: LEAD_ROUTING_SETTINGS_KEY,
        value: data,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateIcp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        rules: z.record(z.string(), z.unknown()),
        thresholds: z.object({
          high: z.number().min(0).max(500),
          medium: z.number().min(0).max(500),
          low: z.number().min(0).max(500),
        }),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("icp_config")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("icp_config")
        .update({
          rules: data.rules as never,
          thresholds: data.thresholds as never,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("icp_config").insert({
        rules: data.rules as never,
        thresholds: data.thresholds as never,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const upsertStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(50),
        color: z.string().min(1).max(20),
        position: z.number().int().min(1).max(100),
        is_terminal: z.boolean(),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.id) {
      const { error } = await supabase
        .from("stages")
        .update({
          name: data.name,
          slug: data.slug,
          color: data.color,
          position: data.position,
          is_terminal: data.is_terminal,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("stages").insert({
        name: data.name,
        slug: data.slug,
        color: data.color,
        position: data.position,
        is_terminal: data.is_terminal,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("stages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const PAGE = 1000;
    const [stagesRes, leadsPages] = await Promise.all([
      supabase.from("stages").select("id, name, slug, position").order("position"),
      (async () => {
        const rows: Array<{
          id: string;
          priority: string | null;
          score: number | null;
          source: string | null;
          campaign: string | null;
          stage_id: string | null;
          created_at: string | null;
          first_approach_at: string | null;
          last_action_at: string | null;
        }> = [];

        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from("leads")
            .select(
              "id, priority, score, source, campaign, stage_id, created_at, first_approach_at, last_action_at"
            )
            .range(from, from + PAGE - 1);

          if (error) throw new Error(error.message);
          const batch = data ?? [];
          rows.push(...batch);
          if (batch.length < PAGE) break;
        }

        return rows;
      })(),
    ]);

    if (stagesRes.error) throw new Error(stagesRes.error.message);

    const stages = stagesRes.data ?? [];
    const all = leadsPages;
    const stagesMap = new Map((stages ?? []).map((s) => [s.id, s]));

    const bySlug: Record<string, number> = {};
    for (const l of all) {
      const s = stagesMap.get(l.stage_id ?? "");
      const slug = s?.slug ?? "novo";
      bySlug[slug] = (bySlug[slug] ?? 0) + 1;
    }

    const approachTimes = all
      .filter((l) => l.first_approach_at && l.created_at)
      .map(
        (l) =>
          (new Date(l.first_approach_at as string).getTime() -
            new Date(l.created_at as string).getTime()) /
          1000 /
          60
      );
    const avgFirstApproachMin = approachTimes.length
      ? Math.round(approachTimes.reduce((a, b) => a + b, 0) / approachTimes.length)
      : null;

    const agendados = bySlug["agendado"] ?? 0;
    const total = all.length;
    const conversionRate = total ? Math.round((agendados / total) * 1000) / 10 : 0;

    // by source
    const bySource: Record<string, number> = {};
    for (const l of all) {
      const k = l.source ?? "Sem origem";
      bySource[k] = (bySource[k] ?? 0) + 1;
    }

    // stalled leads (more than 3 days without action, not terminal)
    const terminalSlugs = new Set(["desqualificado"]);
    const threshold = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const stalled = all.filter((l) => {
      const s = stagesMap.get(l.stage_id ?? "");
      if (!s || terminalSlugs.has(s.slug)) return false;
      const referenceDate = l.last_action_at ?? l.created_at;
      if (!referenceDate) return false;
      const last = new Date(referenceDate).getTime();
      return last < threshold;
    }).length;

    return {
      total,
      novos: bySlug["novo"] ?? 0,
      em_contato: bySlug["em_contato"] ?? 0,
      qualificacao: bySlug["qualificacao"] ?? 0,
      agendados,
      desqualificados: bySlug["desqualificado"] ?? 0,
      aguardando: bySlug["aguardando"] ?? 0,
      avgFirstApproachMin,
      conversionRate,
      bySource,
      byStage: (stages ?? []).map((s) => ({ name: s.name, count: bySlug[s.slug] ?? 0 })),
      stalled,
      byPriority: {
        alta: all.filter((l) => l.priority === "alta").length,
        media: all.filter((l) => l.priority === "media").length,
        baixa: all.filter((l) => l.priority === "baixa").length,
        fora_icp: all.filter((l) => l.priority === "fora_icp").length,
        pendente: all.filter((l) => l.priority === "pendente").length,
      },
    };
  });