import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateScore, type IcpRules, type IcpThresholds } from "./icp-score";
import { notifyNewLead } from "./lead-notify.server";
import { normalizeLeadType } from "./lead-type";

/** Lista leads + stages + perfis (para o Kanban). */
export const listKanbanData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const PAGE = 1000;
    async function fetchAllLeads() {
      const all: any[] = [];
      let from = 0;
      // paginar para contornar o limite default do PostgREST (1000)
      while (true) {
        const { data, error } = await supabase
          .from("leads")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        const batch = data ?? [];
        all.push(...batch);
        if (batch.length < PAGE) break;
        from += PAGE;
        if (from >= 50000) break; // hard safety cap
      }
      return all;
    }
    const [stagesRes, leads, profilesRes] = await Promise.all([
      supabase.from("stages").select("*").order("position"),
      fetchAllLeads(),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    if (stagesRes.error) throw new Error(stagesRes.error.message);
    if (profilesRes.error) throw new Error(profilesRes.error.message);
    return {
      stages: stagesRes.data ?? [],
      leads,
      profiles: profilesRes.data ?? [],
    };
  });

export const getLeadDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [leadRes, notesRes, interactionsRes, stagesRes, profilesRes] = await Promise.all([
      supabase.from("leads").select("*").eq("id", data.id).maybeSingle(),
      supabase
        .from("lead_notes")
        .select("*")
        .eq("lead_id", data.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("lead_interactions")
        .select("*")
        .eq("lead_id", data.id)
        .order("created_at", { ascending: false }),
      supabase.from("stages").select("*").order("position"),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    if (leadRes.error) throw new Error(leadRes.error.message);
    if (!leadRes.data) throw new Error("Lead não encontrado");
    return {
      lead: leadRes.data,
      notes: notesRes.data ?? [],
      interactions: interactionsRes.data ?? [],
      stages: stagesRes.data ?? [],
      profiles: profilesRes.data ?? [],
    };
  });

export const registerLeadCardOpen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("lead_interactions").insert({
      lead_id: data.leadId,
      author_id: userId,
      type: "card_opened",
      content: "Card do lead aberto",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const moveLeadStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ leadId: z.string().uuid(), stageId: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("stage_id, first_approach_at")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (lead?.stage_id === data.stageId) return { ok: true };

    const stageIds = [lead?.stage_id, data.stageId].filter((value): value is string => !!value);
    const { data: stagesData, error: stagesError } = stageIds.length
      ? await supabase.from("stages").select("id, slug, name").in("id", stageIds)
      : { data: [], error: null };
    if (stagesError) throw new Error(stagesError.message);

    const stagesById = new Map((stagesData ?? []).map((stage) => [stage.id, stage]));
    const previousStage = lead?.stage_id ? stagesById.get(lead.stage_id) : null;
    const nextStage = stagesById.get(data.stageId) ?? null;

    const patch: Record<string, unknown> = {
      stage_id: data.stageId,
      last_action_at: nowIso,
      stage_entered_at: nowIso,
    };
    if (nextStage?.slug === "em_contato" && !lead?.first_approach_at) {
      patch.first_approach_at = nowIso;
    }

    const { error } = await supabase.from("leads").update(patch as never).eq("id", data.leadId);
    if (error) throw new Error(error.message);

    const { error: interactionError } = await supabase.from("lead_interactions").insert({
      lead_id: data.leadId,
      author_id: userId,
      type: "status_change",
      content: previousStage?.name
        ? `Movido de "${previousStage.name}" para "${nextStage?.name ?? "etapa"}"`
        : `Movido para "${nextStage?.name ?? "etapa"}"`,
      metadata: {
        from_stage_id: previousStage?.id ?? null,
        from_stage_name: previousStage?.name ?? null,
        to_stage_id: nextStage?.id ?? data.stageId,
        to_stage_name: nextStage?.name ?? null,
        to_stage_slug: nextStage?.slug ?? null,
      },
    });
    if (interactionError) throw new Error(interactionError.message);

    return { ok: true };
  });

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.record(z.string(), z.unknown()),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const allowed: Record<string, unknown> = {};
    const allowedKeys = [
      "name",
      "email",
      "phone",
      "position",
      "linkedin_url",
      "company_name",
      "company_website",
      "company_linkedin",
      "company_description",
      "company_segment",
      "company_size",
      "linkedin_company_size",
      "company_location",
      "company_summary",
      "probable_pain",
      "next_action",
      "approach_result",
      "assigned_to",
      "lead_type",
      "stage_id",
      "meeting_at",
      "lost_reason",
      "demo_free",
    ];
    for (const k of allowedKeys) {
      if (k in data.patch) allowed[k] = data.patch[k];
    }
    const nowIso = new Date().toISOString();
    const hasAssignedToPatch = Object.prototype.hasOwnProperty.call(allowed, "assigned_to");
    const hasStagePatch = Object.prototype.hasOwnProperty.call(allowed, "stage_id");
    let currentLead:
      | {
          stage_id: string | null;
          first_approach_at: string | null;
        }
      | null = null;
    if (hasAssignedToPatch || hasStagePatch) {
      const { data: currentLeadData, error: currentLeadError } = await supabase
        .from("leads")
        .select("stage_id, first_approach_at")
        .eq("id", data.id)
        .maybeSingle();
      if (currentLeadError) throw new Error(currentLeadError.message);
      currentLead = currentLeadData;
    }

    let stageChange:
      | {
          fromStageId: string | null;
          fromStageName: string | null;
          toStageId: string | null;
          toStageName: string | null;
          toStageSlug: string | null;
        }
      | null = null;

    if (hasStagePatch) {
      const previousStageId = currentLead?.stage_id ?? null;
      const nextStageId = typeof allowed.stage_id === "string" ? allowed.stage_id : null;

      if (nextStageId !== previousStageId) {
        const stageIds = [previousStageId, nextStageId].filter((value): value is string => !!value);
        const { data: stagesData, error: stagesError } = stageIds.length
          ? await supabase.from("stages").select("id, name, slug").in("id", stageIds)
          : { data: [], error: null };
        if (stagesError) throw new Error(stagesError.message);

        const stagesById = new Map((stagesData ?? []).map((stage) => [stage.id, stage]));
        const previousStage = previousStageId ? stagesById.get(previousStageId) : null;
        const nextStage = nextStageId ? stagesById.get(nextStageId) : null;

        allowed.stage_entered_at =
          typeof data.patch.stage_entered_at === "string" ? data.patch.stage_entered_at : nowIso;

        if (nextStage?.slug === "em_contato" && !currentLead?.first_approach_at) {
          allowed.first_approach_at = nowIso;
        }

        stageChange = {
          fromStageId: previousStage?.id ?? previousStageId,
          fromStageName: previousStage?.name ?? null,
          toStageId: nextStage?.id ?? nextStageId,
          toStageName: nextStage?.name ?? null,
          toStageSlug: nextStage?.slug ?? null,
        };
      }
    }

    allowed.last_action_at = nowIso;

    const { error } = await supabase.from("leads").update(allowed as never).eq("id", data.id);
    if (error) throw new Error(error.message);

    if (stageChange) {
      const { error: stageInteractionError } = await supabase.from("lead_interactions").insert({
        lead_id: data.id,
        author_id: userId,
        type: "status_change",
        content: stageChange.fromStageName
          ? `Movido de "${stageChange.fromStageName}" para "${stageChange.toStageName ?? "etapa"}"`
          : `Movido para "${stageChange.toStageName ?? "etapa"}"`,
        metadata: {
          from_stage_id: stageChange.fromStageId,
          from_stage_name: stageChange.fromStageName,
          to_stage_id: stageChange.toStageId,
          to_stage_name: stageChange.toStageName,
          to_stage_slug: stageChange.toStageSlug,
        },
      });
      if (stageInteractionError) throw new Error(stageInteractionError.message);
    }

    if (hasAssignedToPatch) {
      const { error: convError } = await supabase
        .from("whatsapp_conversations")
        .update({ assigned_user_id: (allowed.assigned_to as string | null | undefined) ?? null })
        .eq("lead_id", data.id);
      if (convError) throw new Error(convError.message);

      await supabase.from("lead_interactions").insert({
        lead_id: data.id,
        author_id: userId,
        type: "routing",
        content: allowed.assigned_to ? "Responsável do lead alterado manualmente." : "Lead enviado para fila geral.",
        metadata: {
          assignee_user_id: allowed.assigned_to ? String(allowed.assigned_to) : null,
          source: "lead_update",
        },
      });
    } else if (Object.prototype.hasOwnProperty.call(allowed, "lead_type")) {
      const { ensureLeadRouted } = await import("./lead-routing.server");
      await ensureLeadRouted({ supabase, leadId: data.id, actorUserId: userId });
    }

    return { ok: true };
  });

export const addLeadNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ leadId: z.string().uuid(), content: z.string().min(1).max(2000) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("lead_notes").insert({
      lead_id: data.leadId,
      author_id: userId,
      content: data.content,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recalcLeadScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: lead } = await supabase.from("leads").select("*").eq("id", data.id).maybeSingle();
    if (!lead) throw new Error("Lead não encontrado");
    const { data: icp } = await supabase
      .from("icp_config")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const rules = (icp?.rules ?? {}) as unknown as IcpRules;
    const thresholds = (icp?.thresholds ?? { high: 70, medium: 40, low: 15 }) as unknown as IcpThresholds;
    const { score, priority, signals } = calculateScore(lead, rules, thresholds);
    await supabase
      .from("leads")
      .update({ score, priority, icp_signals: signals as never })
      .eq("id", data.id);
    return { score, priority };
  });

export const createManualLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(1).max(200),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().max(50).optional().or(z.literal("")),
        company_name: z.string().max(200).optional().or(z.literal("")),
        position: z.string().max(200).optional().or(z.literal("")),
        source: z.string().max(100).optional().or(z.literal("")),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: stage } = await supabase
      .from("stages")
      .select("id")
      .eq("slug", "novo")
      .maybeSingle();
    const { data: inserted, error } = await supabase
      .from("leads")
      .insert({
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        company_name: data.company_name || null,
        position: data.position || null,
        source: data.source || "manual",
        stage_id: stage?.id ?? null,
        last_action_at: new Date().toISOString(),
      })
      .select("id, name, company_name, lead_type, score, priority")
      .single();
    if (error) throw new Error(error.message);
    const { ensureLeadRouted } = await import("./lead-routing.server");
    await ensureLeadRouted({ supabase, leadId: inserted.id });
    await notifyNewLead({
      id: inserted.id,
      name: inserted.name,
      company_name: inserted.company_name,
      lead_type: normalizeLeadType(inserted.lead_type),
      score: inserted.score,
      priority: inserted.priority,
    });
    return { id: inserted.id };
  });