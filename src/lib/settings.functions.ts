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
  .inputValidator((d) =>
    z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        assignedTo: z.string().uuid().optional(),
      })
      .optional()
      .parse(d ?? {})
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const now = new Date();
    const to = data?.to ? new Date(data.to) : now;
    const from = data?.from ? new Date(data.from) : new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const fromISO = from.toISOString();
    const toISO = to.toISOString();
    const assignedTo = data?.assignedTo;
    const PAGE = 1000;
    const [stagesRes, leadsPages, profilesRes, rolesRes] = await Promise.all([
      supabase.from("stages").select("id, name, slug, position").order("position"),
      (async () => {
        const rows: Array<{
          id: string;
          priority: string | null;
          score: number | null;
          source: string | null;
          campaign: string | null;
          stage_id: string | null;
          assigned_to: string | null;
          created_at: string | null;
          first_approach_at: string | null;
          last_action_at: string | null;
        }> = [];

        for (let from = 0; ; from += PAGE) {
          let query = supabase
            .from("leads")
            .select(
              "id, priority, score, source, campaign, stage_id, assigned_to, created_at, first_approach_at, last_action_at"
            )
            .gte("created_at", fromISO)
            .lte("created_at", toISO)
            .range(from, from + PAGE - 1);

          if (assignedTo) query = query.eq("assigned_to", assignedTo);

          const { data, error } = await query;

          if (error) throw new Error(error.message);
          const batch = data ?? [];
          rows.push(...batch);
          if (batch.length < PAGE) break;
        }

        return rows;
      })(),
      supabase.from("profiles").select("id, full_name, email").order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    if (stagesRes.error) throw new Error(stagesRes.error.message);
    if (profilesRes.error) throw new Error(profilesRes.error.message);
    if (rolesRes.error) throw new Error(rolesRes.error.message);

    const stages = stagesRes.data ?? [];
    const all = leadsPages;
    const stagesMap = new Map((stages ?? []).map((s) => [s.id, s]));
    const sdrUserIds = new Set(
      (rolesRes.data ?? [])
        .filter((roleRow) => roleRow.role === "sdr" || roleRow.role === "gestao" || roleRow.role === "super_admin")
        .map((roleRow) => roleRow.user_id as string)
    );
    const sdrOptions = (profilesRes.data ?? [])
      .filter((profile) => sdrUserIds.has(profile.id as string))
      .map((profile) => ({
        id: profile.id as string,
        name: (profile.full_name as string | null) || (profile.email as string | null) || "Sem nome",
      }));

    const relevantSdrOptions = assignedTo
      ? sdrOptions.filter((sdr) => sdr.id === assignedTo)
      : sdrOptions;

    const leadIds = all.map((lead) => lead.id);
    const interactionRows: Array<{
      lead_id: string;
      author_id: string | null;
      type: string;
      created_at: string;
    }> = [];

    if (leadIds.length > 0) {
      const chunkSize = 100;
      for (let index = 0; index < leadIds.length; index += chunkSize) {
        const chunk = leadIds.slice(index, index + chunkSize);
        const { data: chunkRows, error: interactionsError } = await supabase
          .from("lead_interactions")
          .select("lead_id, author_id, type, created_at")
          .in("lead_id", chunk)
          .in("type", ["card_opened", "status_change"])
          .order("created_at", { ascending: true });

        if (interactionsError) throw new Error(interactionsError.message);
        interactionRows.push(
          ...((chunkRows ?? []) as Array<{
            lead_id: string;
            author_id: string | null;
            type: string;
            created_at: string;
          }>)
        );
      }
    }

    const interactionsByLead = new Map<string, typeof interactionRows>();
    for (const row of interactionRows) {
      const existing = interactionsByLead.get(row.lead_id) ?? [];
      existing.push(row);
      interactionsByLead.set(row.lead_id, existing);
    }

    const avg = (values: number[]) =>
      values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : null;

    const leadToOpenOverall: number[] = [];
    const openToStageOverall: number[] = [];
    const leadToStageOverall: number[] = [];
    let openedLeads = 0;
    let advancedLeads = 0;
    let touchedLeads = 0;

    for (const lead of all) {
      if (!lead.created_at) continue;
      const rows = interactionsByLead.get(lead.id) ?? [];
      const firstOpen = rows.find((row) => row.type === "card_opened");
      const firstStageChange = rows.find((row) => row.type === "status_change");
      const firstStageChangeAfterOpen = firstOpen
        ? rows.find(
            (row) =>
              row.type === "status_change" &&
              new Date(row.created_at).getTime() >= new Date(firstOpen.created_at).getTime()
          )
        : undefined;

      if (firstOpen || firstStageChange) touchedLeads += 1;

      if (firstOpen) {
        openedLeads += 1;
        leadToOpenOverall.push(
          (new Date(firstOpen.created_at).getTime() - new Date(lead.created_at).getTime()) / 1000 / 60
        );
      }

      if (firstStageChange) {
        advancedLeads += 1;
        leadToStageOverall.push(
          (new Date(firstStageChange.created_at).getTime() - new Date(lead.created_at).getTime()) / 1000 / 60
        );
      }

      if (firstOpen && firstStageChangeAfterOpen) {
        openToStageOverall.push(
          (new Date(firstStageChangeAfterOpen.created_at).getTime() - new Date(firstOpen.created_at).getTime()) /
            1000 /
            60
        );
      }
    }

    const sdrPerformance = relevantSdrOptions
      .map((sdr) => {
        const leadToOpen: number[] = [];
        const openToStage: number[] = [];
        const leadToStage: number[] = [];
        const touched = new Set<string>();
        let cardsOpened = 0;
        let stageMoves = 0;

        for (const lead of all) {
          if (!lead.created_at) continue;
          const rows = interactionsByLead.get(lead.id) ?? [];
          const firstOpen = rows.find((row) => row.type === "card_opened" && row.author_id === sdr.id);
          const firstStageChange = rows.find(
            (row) => row.type === "status_change" && row.author_id === sdr.id
          );
          const firstStageChangeAfterOpen = firstOpen
            ? rows.find(
                (row) =>
                  row.type === "status_change" &&
                  row.author_id === sdr.id &&
                  new Date(row.created_at).getTime() >= new Date(firstOpen.created_at).getTime()
              )
            : undefined;

          if (firstOpen || firstStageChange) touched.add(lead.id);

          if (firstOpen) {
            cardsOpened += 1;
            leadToOpen.push(
              (new Date(firstOpen.created_at).getTime() - new Date(lead.created_at).getTime()) / 1000 / 60
            );
          }

          if (firstStageChange) {
            stageMoves += 1;
            leadToStage.push(
              (new Date(firstStageChange.created_at).getTime() - new Date(lead.created_at).getTime()) / 1000 / 60
            );
          }

          if (firstOpen && firstStageChangeAfterOpen) {
            openToStage.push(
              (new Date(firstStageChangeAfterOpen.created_at).getTime() -
                new Date(firstOpen.created_at).getTime()) /
                1000 /
                60
            );
          }
        }

        return {
          sdrId: sdr.id,
          sdrName: sdr.name,
          touchedLeads: touched.size,
          cardsOpened,
          stageMoves,
          avgLeadToOpenMin: avg(leadToOpen),
          avgOpenToStageMin: avg(openToStage),
          avgLeadToStageMin: avg(leadToStage),
        };
      })
      .sort((a, b) => b.stageMoves - a.stageMoves || b.cardsOpened - a.cardsOpened || a.sdrName.localeCompare(b.sdrName));

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
      period: { from: fromISO, to: toISO },
      assignedTo: assignedTo ?? null,
      sdrOptions,
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
      managementAnalytics: {
        summary: {
          touchedLeads,
          cardsOpened: openedLeads,
          stageMoves: advancedLeads,
          avgLeadToOpenMin: avg(leadToOpenOverall),
          avgOpenToStageMin: avg(openToStageOverall),
          avgLeadToStageMin: avg(leadToStageOverall),
        },
        bySdr: sdrPerformance,
      },
      byPriority: {
        alta: all.filter((l) => l.priority === "alta").length,
        media: all.filter((l) => l.priority === "media").length,
        baixa: all.filter((l) => l.priority === "baixa").length,
        fora_icp: all.filter((l) => l.priority === "fora_icp").length,
        pendente: all.filter((l) => l.priority === "pendente").length,
      },
    };
  });