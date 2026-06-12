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
    const [stagesRes, leadsRes, profilesRes] = await Promise.all([
      supabase.from("stages").select("*").order("position"),
      supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    if (stagesRes.error) throw new Error(stagesRes.error.message);
    if (leadsRes.error) throw new Error(leadsRes.error.message);
    if (profilesRes.error) throw new Error(profilesRes.error.message);
    return {
      stages: stagesRes.data ?? [],
      leads: leadsRes.data ?? [],
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

export const moveLeadStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ leadId: z.string().uuid(), stageId: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: stage } = await supabase
      .from("stages")
      .select("slug, name")
      .eq("id", data.stageId)
      .maybeSingle();

    const patch: Record<string, unknown> = {
      stage_id: data.stageId,
      last_action_at: new Date().toISOString(),
      stage_entered_at: new Date().toISOString(),
    };
    if (stage?.slug === "em_contato") {
      patch.first_approach_at = new Date().toISOString();
    }

    const { error } = await supabase.from("leads").update(patch as never).eq("id", data.leadId);
    if (error) throw new Error(error.message);

    await supabase.from("lead_interactions").insert({
      lead_id: data.leadId,
      author_id: userId,
      type: "status_change",
      content: `Movido para "${stage?.name ?? "etapa"}"`,
    });

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
    const { supabase } = context;
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
    allowed.last_action_at = new Date().toISOString();

    const { error } = await supabase.from("leads").update(allowed as never).eq("id", data.id);
    if (error) throw new Error(error.message);
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