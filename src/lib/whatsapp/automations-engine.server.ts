import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getProvider } from "./provider-registry.server";
import { resolveTemplateSendParams } from "./template-send.server";
import { renderTemplate } from "../whatsapp-templates.functions";

type AiAgentSettings = {
  enabled: boolean;
  initialOutreachEnabled: boolean;
  initialTemplateId: string | null;
};

type RuleRow = {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown> | null;
  template_id: string | null;
  delay_minutes: number | null;
  active: boolean;
};

type LeadLite = {
  id: string;
  name: string | null;
  company_name: string | null;
  phone: string | null;
  priority: string | null;
  lead_type: string | null;
  assigned_to: string | null;
  stage_id: string | null;
  created_at: string;
  meeting_at: string | null;
};

function passesCommonFilters(lead: LeadLite, cfg: Record<string, unknown> | null): boolean {
  if (!cfg) return true;
  const priorities = (cfg.priorities as string[] | undefined) ?? [];
  if (priorities.length && (!lead.priority || !priorities.includes(lead.priority))) return false;
  const leadType = (cfg.leadType as string[] | undefined) ?? [];
  if (leadType.length && (!lead.lead_type || !leadType.includes(lead.lead_type))) return false;
  return true;
}

async function alreadyExecuted(ruleId: string, leadId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("whatsapp_automation_logs")
    .select("id")
    .eq("rule_id", ruleId)
    .eq("lead_id", leadId)
    .eq("status", "sent")
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function getDefaultAccount() {
  const { data } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select("*")
    .eq("is_default", true)
    .maybeSingle();
  return data;
}

async function getAiAgentSettings(): Promise<AiAgentSettings> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "whatsapp_ai_agent")
    .maybeSingle();
  const value = (data?.value ?? {}) as Record<string, unknown>;
  return {
    enabled: value.enabled === true,
    initialOutreachEnabled: value.initialOutreachEnabled === true,
    initialTemplateId: typeof value.initialTemplateId === "string" ? value.initialTemplateId : null,
  };
}

async function executeRuleForLead(rule: RuleRow, lead: LeadLite): Promise<{ ok: boolean; error?: string }> {
  if (!lead.phone) return { ok: false, error: "Lead sem telefone" };
  if (!rule.template_id) return { ok: false, error: "Sem template" };

  const { data: tmpl } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("body")
    .eq("id", rule.template_id)
    .maybeSingle();
  if (!tmpl) return { ok: false, error: "Template inexistente" };

  const account = await getDefaultAccount();
  if (!account) return { ok: false, error: "Sem conta WhatsApp padrão" };

  const body = renderTemplate(tmpl.body, {
    nome: lead.name ?? "",
    primeiro_nome: (lead.name ?? "").split(" ")[0] ?? "",
    empresa: lead.company_name ?? "",
  });

  // garante conversa
  let convId: string | null = null;
  const { data: existing } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id")
    .eq("lead_id", lead.id)
    .maybeSingle();
  if (existing) {
    convId = existing.id;
  } else {
    const { data: created } = await supabaseAdmin
      .from("whatsapp_conversations")
      .insert({
        lead_id: lead.id,
        account_id: account.id,
        assigned_user_id: lead.assigned_to,
        status: "open",
      })
      .select("id")
      .single();
    convId = created?.id ?? null;
  }
  if (!convId) return { ok: false, error: "Falha criando conversa" };

  const { data: msg } = await supabaseAdmin
    .from("whatsapp_messages")
    .insert({
      conversation_id: convId,
      lead_id: lead.id,
      sender_type: "automation",
      message_type: "text",
      body,
      status: "sending",
    })
    .select("id")
    .single();

  try {
    const provider = getProvider(account.provider);
    const result = await provider.sendMessage({
      account: {
        id: account.id,
        phone_number: account.phone_number,
        provider: account.provider,
        provider_instance_id: account.provider_instance_id,
        provider_base_url: account.provider_base_url,
        access_token: account.access_token,
        webhook_secret: account.webhook_secret,
      },
      to: lead.phone.replace(/\D+/g, ""),
      type: "text",
      body,
    });
    if (msg?.id) {
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({
          provider_message_id: result.providerMessageId,
          status: result.status === "failed" ? "failed" : "sent",
          error: result.error ?? null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", msg.id);
    }
    await supabaseAdmin
      .from("whatsapp_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_preview: body.slice(0, 200),
        status: "open",
      })
      .eq("id", convId);
    await supabaseAdmin.from("whatsapp_automation_logs").insert({
      rule_id: rule.id,
      lead_id: lead.id,
      message_id: msg?.id ?? null,
      status: result.status === "failed" ? "failed" : "sent",
      error: result.error ?? null,
      executed_at: new Date().toISOString(),
    });
    return { ok: result.status !== "failed", error: result.error };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha";
    if (msg?.id) {
      await supabaseAdmin.from("whatsapp_messages").update({ status: "failed", error: message }).eq("id", msg.id);
    }
    await supabaseAdmin.from("whatsapp_automation_logs").insert({
      rule_id: rule.id,
      lead_id: lead.id,
      message_id: msg?.id ?? null,
      status: "failed",
      error: message,
      executed_at: new Date().toISOString(),
    });
    return { ok: false, error: message };
  }
}

async function executeAiInitialOutreachForLead(lead: LeadLite): Promise<{ ok: boolean; error?: string }> {
  if (!lead.phone) return { ok: false, error: "Lead sem telefone" };
  const settings = await getAiAgentSettings();
  if (!settings.enabled || !settings.initialOutreachEnabled || !settings.initialTemplateId) {
    return { ok: false, error: "IA inicial desativada ou sem template HSM" };
  }

  const { data: tmpl } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("provider_template_name, language, variables, meta_template_id")
    .eq("id", settings.initialTemplateId)
    .maybeSingle();
  if (!tmpl?.provider_template_name) return { ok: false, error: "Template HSM inicial inválido" };

  const account = await getDefaultAccount();
  if (!account) return { ok: false, error: "Sem conta WhatsApp padrão" };

  let convId: string | null = null;
  const { data: existing } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id")
    .eq("lead_id", lead.id)
    .maybeSingle();
  if (existing) {
    convId = existing.id;
  } else {
    const { data: created } = await supabaseAdmin
      .from("whatsapp_conversations")
      .insert({
        lead_id: lead.id,
        account_id: account.id,
        assigned_user_id: lead.assigned_to,
        status: "open",
      })
      .select("id")
      .single();
    convId = created?.id ?? null;
  }
  if (!convId) return { ok: false, error: "Falha criando conversa" };

  const { headerParams, bodyParams } = await resolveTemplateSendParams({
    account: {
      access_token: account.access_token ?? "",
      provider_base_url: account.provider_base_url,
    },
    metaTemplateId: tmpl.meta_template_id,
    storedVariables: tmpl.variables,
    lead: {
      name: lead.name,
      company_name: lead.company_name,
    },
  });

  const { data: msg } = await supabaseAdmin
    .from("whatsapp_messages")
    .insert({
      conversation_id: convId,
      lead_id: lead.id,
      sender_type: "bot",
      message_type: "template",
      body: null,
      metadata: {
        source: "ai_initial_outreach",
        template_id: settings.initialTemplateId,
        template_name: tmpl.provider_template_name,
      },
      status: "sending",
    })
    .select("id")
    .single();

  try {
    const provider = getProvider(account.provider);
    const result = await provider.sendMessage({
      account: {
        id: account.id,
        phone_number: account.phone_number,
        provider: account.provider,
        provider_instance_id: account.provider_instance_id,
        provider_base_url: account.provider_base_url,
        access_token: account.access_token,
        webhook_secret: account.webhook_secret,
      },
      to: lead.phone.replace(/\D+/g, ""),
      type: "template",
      templateName: tmpl.provider_template_name,
      templateLanguage: tmpl.language ?? "pt_BR",
      templateHeaderParams: headerParams,
      templateParams: bodyParams,
    });

    if (msg?.id) {
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({
          provider_message_id: result.providerMessageId,
          status: result.status === "failed" ? "failed" : "sent",
          error: result.error ?? null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", msg.id);
    }

    await supabaseAdmin
      .from("whatsapp_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_preview: `[HSM] ${tmpl.provider_template_name}`,
        status: "open",
      })
      .eq("id", convId);

    return { ok: result.status !== "failed", error: result.error };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha";
    if (msg?.id) {
      await supabaseAdmin.from("whatsapp_messages").update({ status: "failed", error: message }).eq("id", msg.id);
    }
    return { ok: false, error: message };
  }
}

async function evalNewLead(rule: RuleRow): Promise<LeadLite[]> {
  // Leads criados nas últimas 24h ainda não processados; o dedupe via logs cobre o resto.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("leads")
    .select("id,name,company_name,phone,priority,lead_type,assigned_to,stage_id,created_at,meeting_at")
    .gte("created_at", since)
    .not("phone", "is", null)
    .limit(500);
  const delay = rule.delay_minutes ?? 0;
  const cutoff = Date.now() - delay * 60_000;
  return (data ?? []).filter(
    (l) => passesCommonFilters(l, rule.trigger_config) && new Date(l.created_at).getTime() <= cutoff,
  );
}

async function evalStageChange(rule: RuleRow): Promise<LeadLite[]> {
  const cfg = rule.trigger_config ?? {};
  const stageId = cfg.stageId as string | undefined;
  if (!stageId) return [];
  // Usa stage_entered_at; aplica delay
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("leads")
    .select("id,name,company_name,phone,priority,lead_type,assigned_to,stage_id,created_at,meeting_at,stage_entered_at")
    .eq("stage_id", stageId)
    .gte("stage_entered_at", since)
    .not("phone", "is", null)
    .limit(500);
  const delay = rule.delay_minutes ?? 0;
  const cutoff = Date.now() - delay * 60_000;
  return (data ?? []).filter((l) => {
    if (!passesCommonFilters(l, rule.trigger_config)) return false;
    const t = (l as { stage_entered_at: string | null }).stage_entered_at;
    if (!t) return false;
    return new Date(t).getTime() <= cutoff;
  });
}

async function evalNoReply(rule: RuleRow): Promise<LeadLite[]> {
  const cfg = rule.trigger_config ?? {};
  const hours = (cfg.hoursWithoutReply as number | undefined) ?? 24;
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  // Conversas abertas, última mensagem (do SDR) antes do cutoff e sem inbound mais recente
  const { data: convs } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id, lead_id, last_message_at, status, leads:lead_id(id,name,company_name,phone,priority,lead_type,assigned_to,stage_id,created_at,meeting_at)")
    .eq("status", "open")
    .lt("last_message_at", cutoff)
    .limit(500);
  const leads: LeadLite[] = [];
  for (const c of convs ?? []) {
    const lead = (c as { leads: LeadLite | null }).leads;
    if (!lead?.phone) continue;
    if (!passesCommonFilters(lead, rule.trigger_config)) continue;
    // confirma que a última msg é do SDR (não foi o contato que ficou sem resposta)
    const { data: lastMsg } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("sender_type")
      .eq("conversation_id", (c as { id: string }).id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastMsg || lastMsg.sender_type === "contact") continue;
    leads.push(lead);
  }
  return leads;
}

async function evalMeetingReminder(rule: RuleRow): Promise<LeadLite[]> {
  const cfg = rule.trigger_config ?? {};
  const minutesBefore = (cfg.minutesBefore as number | undefined) ?? 60;
  const now = Date.now();
  const windowStart = new Date(now + (minutesBefore - 5) * 60_000).toISOString();
  const windowEnd = new Date(now + (minutesBefore + 5) * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("leads")
    .select("id,name,company_name,phone,priority,lead_type,assigned_to,stage_id,created_at,meeting_at")
    .gte("meeting_at", windowStart)
    .lte("meeting_at", windowEnd)
    .not("phone", "is", null)
    .limit(500);
  return (data ?? []).filter((l) => passesCommonFilters(l, rule.trigger_config));
}

export async function runAutomationsTick(): Promise<{
  rulesProcessed: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const { data: rules } = await supabaseAdmin
    .from("whatsapp_automation_rules")
    .select("*")
    .eq("active", true);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of (rules ?? []) as RuleRow[]) {
    let targets: LeadLite[] = [];
    try {
      if (r.trigger_type === "new_lead") targets = await evalNewLead(r);
      else if (r.trigger_type === "stage_change") targets = await evalStageChange(r);
      else if (r.trigger_type === "no_reply") targets = await evalNoReply(r);
      else if (r.trigger_type === "meeting_reminder") targets = await evalMeetingReminder(r);
    } catch {
      continue;
    }
    for (const lead of targets) {
      if (await alreadyExecuted(r.id, lead.id)) {
        skipped++;
        continue;
      }
      const usingAiInitial = r.trigger_type === "new_lead";
      const res = usingAiInitial
        ? await executeAiInitialOutreachForLead(lead)
        : await executeRuleForLead(r, lead);
      if (res.ok) sent++;
      else failed++;

      if (usingAiInitial) {
        await supabaseAdmin.from("whatsapp_automation_logs").insert({
          rule_id: r.id,
          lead_id: lead.id,
          status: res.ok ? "sent" : "failed",
          error: res.error ?? null,
          executed_at: new Date().toISOString(),
        });
      }
    }
  }

  return { rulesProcessed: (rules ?? []).length, sent, failed, skipped };
}