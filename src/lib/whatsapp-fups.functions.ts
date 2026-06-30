import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const FUP_TRIGGERS = ["new_lead", "stage_change", "no_reply", "ai_handoff"] as const;
export type FupTrigger = (typeof FUP_TRIGGERS)[number];

const TriggerConfig = z
  .object({
    stageId: z.string().uuid().optional(),
    hoursWithoutReply: z.number().int().min(1).max(720).optional(),
    lookbackHours: z.number().int().min(1).max(24 * 60).optional(),
  })
  .default({});

const AudienceFilters = z
  .object({
    priorities: z.array(z.enum(["alta", "media", "baixa"])).optional(),
    leadType: z.array(z.string()).optional(),
    companySizes: z.array(z.string()).optional(),
    emailDomains: z.array(z.string()).optional(),
    demoFree: z.enum(["any", "yes", "no"]).optional(),
  })
  .default({});

const StepInput = z.object({
  templateId: z.string().uuid(),
  delayHours: z.number().min(0).max(24 * 60),
});

export const listFupSequences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_fup_sequences")
      .select("*, whatsapp_fup_steps(id, step_order, delay_hours, template_id, whatsapp_templates:template_id(name))")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { sequences: data ?? [] };
  });

export const getFupSequence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: seq, error } = await context.supabase
      .from("whatsapp_fup_sequences")
      .select("*, whatsapp_fup_steps(id, step_order, delay_hours, template_id, whatsapp_templates:template_id(name))")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!seq) throw new Error("FUP não encontrado");
    const { data: enrs } = await context.supabase
      .from("whatsapp_fup_enrollments")
      .select("*, leads:lead_id(id, name, company_name, phone)")
      .eq("sequence_id", data.id)
      .order("enrolled_at", { ascending: false })
      .limit(200);
    return { sequence: seq, enrollments: enrs ?? [] };
  });

export const upsertFupSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(160),
        description: z.string().max(500).optional().nullable(),
        triggerType: z.enum(FUP_TRIGGERS),
        triggerConfig: TriggerConfig,
        audienceFilters: AudienceFilters,
        stopOnReply: z.boolean().default(true),
        stopOnStageIds: z.array(z.string().uuid()).default([]),
        active: z.boolean().default(true),
        steps: z.array(StepInput).min(1).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isMgr } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isMgr) throw new Error("Apenas gestão/admin podem editar FUPs");

    const payload = {
      name: data.name,
      description: data.description ?? null,
      trigger_type: data.triggerType,
      trigger_config: data.triggerConfig,
      audience_filters: data.audienceFilters,
      stop_on_reply: data.stopOnReply,
      stop_on_stage_ids: data.stopOnStageIds,
      active: data.active,
    };

    let seqId = data.id;
    if (seqId) {
      const { error } = await supabase.from("whatsapp_fup_sequences").update(payload).eq("id", seqId);
      if (error) throw new Error(error.message);
    } else {
      const { data: row, error } = await supabase
        .from("whatsapp_fup_sequences")
        .insert({ ...payload, created_by: userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      seqId = row!.id;
    }

    // substitui passos
    await supabase.from("whatsapp_fup_steps").delete().eq("sequence_id", seqId);
    const stepRows = data.steps.map((s, i) => ({
      sequence_id: seqId!,
      step_order: i + 1,
      delay_hours: s.delayHours,
      template_id: s.templateId,
    }));
    const { error: sErr } = await supabase.from("whatsapp_fup_steps").insert(stepRows);
    if (sErr) throw new Error(sErr.message);
    return { id: seqId };
  });

export const deleteFupSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!isMgr) throw new Error("Apenas gestão/admin");
    const { error } = await context.supabase.from("whatsapp_fup_sequences").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleFupSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!isMgr) throw new Error("Apenas gestão/admin");
    const { error } = await context.supabase
      .from("whatsapp_fup_sequences")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const stopFupEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("whatsapp_fup_enrollments")
      .update({ status: "stopped_manual", completed_at: new Date().toISOString(), next_run_at: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const enrollLeadInFup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sequenceId: z.string().uuid(), leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: firstStep } = await context.supabase
      .from("whatsapp_fup_steps")
      .select("delay_hours")
      .eq("sequence_id", data.sequenceId)
      .order("step_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    const delay = Number((firstStep as { delay_hours: number } | null)?.delay_hours ?? 0);
    const { error } = await context.supabase.from("whatsapp_fup_enrollments").upsert(
      {
        sequence_id: data.sequenceId,
        lead_id: data.leadId,
        status: "active",
        current_step: 0,
        next_run_at: new Date(Date.now() + delay * 3600 * 1000).toISOString(),
      },
      { onConflict: "sequence_id,lead_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runFupsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!isMgr) throw new Error("Apenas gestão/admin");
    const { runFupsTick } = await import("./whatsapp/fups-engine.server");
    return runFupsTick();
  });