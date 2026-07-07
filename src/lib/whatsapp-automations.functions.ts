import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const AUTOMATION_TRIGGERS = [
  "new_lead",
  "no_reply",
  "stage_change",
  "meeting_reminder",
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

const TriggerConfig = z
  .object({
    // no_reply
    hoursWithoutReply: z.number().int().min(1).max(720).optional(),
    // stage_change
    stageId: z.string().uuid().optional(),
    // meeting_reminder
    minutesBefore: z.number().int().min(5).max(2880).optional(),
    // filters comuns
    priorities: z.array(z.enum(["alta", "media", "baixa"])).optional(),
    leadType: z.array(z.string()).optional(),
  })
  .default({});

export const listAutomationRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_automation_rules")
      .select("*, whatsapp_templates:template_id(name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rules: data ?? [] };
  });

export const createAutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(1).max(160),
        triggerType: z.enum(AUTOMATION_TRIGGERS),
        triggerConfig: TriggerConfig,
        templateId: z.string().uuid().optional(),
        delayMinutes: z.number().int().min(0).max(10080).default(0),
        active: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("whatsapp_automation_rules")
      .insert({
        name: data.name,
        trigger_type: data.triggerType,
        trigger_config: data.triggerConfig,
        template_id: data.templateId ?? null,
        delay_minutes: data.delayMinutes,
        active: data.active,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { rule: row };
  });

export const updateAutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(160).optional(),
        triggerType: z.enum(AUTOMATION_TRIGGERS).optional(),
        triggerConfig: TriggerConfig.optional(),
        templateId: z.string().uuid().optional(),
        delayMinutes: z.number().int().min(0).max(10080).optional(),
        active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, triggerType, triggerConfig, templateId, delayMinutes, ...rest } = data;
    const patch: {
      name?: string;
      active?: boolean;
      trigger_type?: string;
      trigger_config?: z.infer<typeof TriggerConfig>;
      template_id?: string;
      delay_minutes?: number;
    } = { ...rest };
    if (triggerType !== undefined) patch.trigger_type = triggerType;
    if (triggerConfig !== undefined) patch.trigger_config = triggerConfig;
    if (templateId !== undefined) patch.template_id = templateId;
    if (delayMinutes !== undefined) patch.delay_minutes = delayMinutes;
    const { error } = await context.supabase
      .from("whatsapp_automation_rules")
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("whatsapp_automation_rules")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAutomationLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ruleId: z.string().uuid().optional() }).optional().parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("whatsapp_automation_logs")
      .select("*, leads:lead_id(id,name,company_name), whatsapp_automation_rules:rule_id(name)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data?.ruleId) q = q.eq("rule_id", data.ruleId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { logs: rows ?? [] };
  });

/** Dispara o tick manualmente (para testar). */
export const runAutomationsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!isMgr) throw new Error("Apenas gestão/admin");
    const { runAutomationsTick } = await import("./whatsapp/automations-engine.server");
    return runAutomationsTick();
  });