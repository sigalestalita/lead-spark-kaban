import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getProvider } from "./provider-registry.server";
import { renderTemplate } from "../whatsapp-templates.functions";

type Sequence = {
  id: string;
  name: string;
  trigger_type: "new_lead" | "stage_change" | "no_reply" | "ai_handoff";
  trigger_config: Record<string, unknown> | null;
  audience_filters: Record<string, unknown> | null;
  stop_on_reply: boolean;
  stop_on_stage_ids: string[] | null;
  active: boolean;
};

type Step = {
  id: string;
  sequence_id: string;
  step_order: number;
  delay_hours: number;
  template_id: string;
};

type LeadLite = {
  id: string;
  name: string | null;
  company_name: string | null;
  phone: string | null;
  priority: string | null;
  lead_type: string | null;
  demo_free: boolean | null;
  company_size: string | null;
  email: string | null;
  assigned_to: string | null;
  stage_id: string | null;
  created_at: string;
  stage_entered_at: string | null;
};

const LEAD_COLS =
  "id,name,company_name,phone,priority,lead_type,demo_free,company_size,email,assigned_to,stage_id,created_at,stage_entered_at";

function passesAudience(lead: LeadLite, f: Record<string, unknown> | null): boolean {
  if (!f) return true;
  const priorities = (f.priorities as string[] | undefined) ?? [];
  if (priorities.length && (!lead.priority || !priorities.includes(lead.priority))) return false;
  const leadType = (f.leadType as string[] | undefined) ?? [];
  if (leadType.length && (!lead.lead_type || !leadType.includes(lead.lead_type))) return false;
  const companySizes = (f.companySizes as string[] | undefined) ?? [];
  if (companySizes.length && (!lead.company_size || !companySizes.includes(lead.company_size))) return false;
  const demoFree = f.demoFree as "any" | "yes" | "no" | undefined;
  if (demoFree === "yes" && lead.demo_free !== true) return false;
  if (demoFree === "no" && lead.demo_free === true) return false;
  const emailDomains = (f.emailDomains as string[] | undefined) ?? [];
  if (emailDomains.length) {
    const e = (lead.email ?? "").toLowerCase();
    if (!e || !emailDomains.some((d) => e.endsWith(`@${d.toLowerCase().replace(/^@+/, "")}`))) return false;
  }
  return true;
}

async function getDefaultAccount() {
  const { data } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select("*")
    .eq("is_default", true)
    .maybeSingle();
  return data;
}

async function fetchTriggerCandidates(seq: Sequence): Promise<LeadLite[]> {
  const cfg = seq.trigger_config ?? {};
  if (seq.trigger_type === "new_lead") {
    const sinceHours = (cfg.lookbackHours as number | undefined) ?? 72;
    const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
    const { data } = await supabaseAdmin
      .from("leads")
      .select(LEAD_COLS)
      .gte("created_at", since)
      .not("phone", "is", null)
      .limit(500);
    return (data ?? []) as LeadLite[];
  }
  if (seq.trigger_type === "stage_change") {
    const stageId = cfg.stageId as string | undefined;
    if (!stageId) return [];
    const sinceHours = (cfg.lookbackHours as number | undefined) ?? 168;
    const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
    const { data } = await supabaseAdmin
      .from("leads")
      .select(LEAD_COLS)
      .eq("stage_id", stageId)
      .gte("stage_entered_at", since)
      .not("phone", "is", null)
      .limit(500);
    return (data ?? []) as LeadLite[];
  }
  if (seq.trigger_type === "no_reply") {
    const hours = (cfg.hoursWithoutReply as number | undefined) ?? 24;
    const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const { data: convs } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("id, lead_id, last_message_at, leads:lead_id(" + LEAD_COLS + ")")
      .eq("status", "open")
      .lt("last_message_at", cutoff)
      .limit(500);
    const out: LeadLite[] = [];
    for (const c of convs ?? []) {
      const lead = (c as unknown as { leads: LeadLite | null }).leads;
      if (!lead?.phone) continue;
      // última msg precisa ser nossa (SDR/automação/IA)
      const { data: lastMsg } = await supabaseAdmin
        .from("whatsapp_messages")
        .select("sender_type")
        .eq("conversation_id", (c as unknown as { id: string }).id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastMsg || lastMsg.sender_type === "contact") continue;
      out.push(lead);
    }
    return out;
  }
  if (seq.trigger_type === "ai_handoff") {
    // Placeholder: leads marcados como aguardando handoff (assigned_to nulo + flag futura).
    // Por enquanto: leads sem responsável criados nas últimas X horas.
    const sinceHours = (cfg.lookbackHours as number | undefined) ?? 72;
    const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
    const { data } = await supabaseAdmin
      .from("leads")
      .select(LEAD_COLS)
      .is("assigned_to", null)
      .gte("created_at", since)
      .not("phone", "is", null)
      .limit(500);
    return (data ?? []) as LeadLite[];
  }
  return [];
}

async function getFirstStepDelayHours(sequenceId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("whatsapp_fup_steps")
    .select("delay_hours")
    .eq("sequence_id", sequenceId)
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  return Number((data as { delay_hours: number } | null)?.delay_hours ?? 0);
}

async function enrollEligible(seq: Sequence): Promise<number> {
  const candidates = await fetchTriggerCandidates(seq);
  if (!candidates.length) return 0;
  const filtered = candidates.filter((l) => passesAudience(l, seq.audience_filters));
  if (!filtered.length) return 0;

  const { data: existing } = await supabaseAdmin
    .from("whatsapp_fup_enrollments")
    .select("lead_id")
    .eq("sequence_id", seq.id)
    .in("lead_id", filtered.map((l) => l.id));
  const has = new Set((existing ?? []).map((r) => (r as { lead_id: string }).lead_id));
  const toEnroll = filtered.filter((l) => !has.has(l.id));
  if (!toEnroll.length) return 0;

  const firstDelay = await getFirstStepDelayHours(seq.id);
  const rows = toEnroll.map((l) => ({
    sequence_id: seq.id,
    lead_id: l.id,
    status: "active" as const,
    current_step: 0,
    next_run_at: new Date(Date.now() + firstDelay * 3600 * 1000).toISOString(),
  }));
  await supabaseAdmin.from("whatsapp_fup_enrollments").insert(rows);
  return rows.length;
}

async function sendStep(seq: Sequence, step: Step, lead: LeadLite): Promise<{ ok: boolean; error?: string }> {
  const { data: tmpl } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("body")
    .eq("id", step.template_id)
    .maybeSingle();
  if (!tmpl) return { ok: false, error: "Template inexistente" };

  const account = await getDefaultAccount();
  if (!account) return { ok: false, error: "Sem conta WhatsApp padrão" };

  const body = renderTemplate(tmpl.body, {
    nome: lead.name ?? "",
    primeiro_nome: (lead.name ?? "").split(" ")[0] ?? "",
    empresa: lead.company_name ?? "",
  });

  let convId: string | null = null;
  const { data: existing } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id")
    .eq("lead_id", lead.id)
    .maybeSingle();
  if (existing) convId = existing.id;
  else {
    const { data: created } = await supabaseAdmin
      .from("whatsapp_conversations")
      .insert({ lead_id: lead.id, account_id: account.id, assigned_user_id: lead.assigned_to, status: "open" })
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
      to: (lead.phone ?? "").replace(/\D+/g, ""),
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
      .update({ last_message_at: new Date().toISOString(), last_preview: body.slice(0, 200), status: "open" })
      .eq("id", convId);
    return { ok: result.status !== "failed", error: result.error };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha";
    if (msg?.id)
      await supabaseAdmin.from("whatsapp_messages").update({ status: "failed", error: message }).eq("id", msg.id);
    return { ok: false, error: message };
  }
}

async function processEnrollment(
  seq: Sequence,
  steps: Step[],
  enr: {
    id: string;
    lead_id: string;
    current_step: number;
    last_step_at: string | null;
  },
): Promise<"sent" | "stopped" | "failed" | "completed"> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select(LEAD_COLS)
    .eq("id", enr.lead_id)
    .maybeSingle();
  if (!lead) {
    await supabaseAdmin
      .from("whatsapp_fup_enrollments")
      .update({ status: "failed", last_error: "Lead removido", completed_at: new Date().toISOString() })
      .eq("id", enr.id);
    return "failed";
  }
  const leadLite = lead as LeadLite;

  // Stop por etapa
  if (seq.stop_on_stage_ids && seq.stop_on_stage_ids.length && leadLite.stage_id && seq.stop_on_stage_ids.includes(leadLite.stage_id)) {
    await supabaseAdmin
      .from("whatsapp_fup_enrollments")
      .update({ status: "stopped_stage", completed_at: new Date().toISOString() })
      .eq("id", enr.id);
    return "stopped";
  }

  // Stop se o lead respondeu desde a inscrição/último passo
  if (seq.stop_on_reply) {
    const since = enr.last_step_at ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: conv } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("id")
      .eq("lead_id", enr.lead_id)
      .maybeSingle();
    if (conv) {
      const { data: reply } = await supabaseAdmin
        .from("whatsapp_messages")
        .select("id")
        .eq("conversation_id", (conv as { id: string }).id)
        .eq("sender_type", "contact")
        .gt("created_at", since)
        .limit(1)
        .maybeSingle();
      if (reply) {
        await supabaseAdmin
          .from("whatsapp_fup_enrollments")
          .update({ status: "stopped_reply", completed_at: new Date().toISOString() })
          .eq("id", enr.id);
        return "stopped";
      }
    }
  }

  const nextOrder = enr.current_step + 1;
  const step = steps.find((s) => s.step_order === nextOrder);
  if (!step) {
    await supabaseAdmin
      .from("whatsapp_fup_enrollments")
      .update({ status: "completed", completed_at: new Date().toISOString(), next_run_at: null })
      .eq("id", enr.id);
    return "completed";
  }

  const res = await sendStep(seq, step, leadLite);
  const now = new Date();
  if (!res.ok) {
    await supabaseAdmin
      .from("whatsapp_fup_enrollments")
      .update({ last_error: res.error ?? "Falha", next_run_at: new Date(now.getTime() + 3600 * 1000).toISOString() })
      .eq("id", enr.id);
    return "failed";
  }

  // Avança
  const upcoming = steps.find((s) => s.step_order === nextOrder + 1);
  const next = upcoming ? new Date(now.getTime() + Number(upcoming.delay_hours) * 3600 * 1000).toISOString() : null;
  await supabaseAdmin
    .from("whatsapp_fup_enrollments")
    .update({
      current_step: nextOrder,
      last_step_at: now.toISOString(),
      next_run_at: next,
      status: upcoming ? "active" : "completed",
      completed_at: upcoming ? null : now.toISOString(),
      last_error: null,
    })
    .eq("id", enr.id);
  return upcoming ? "sent" : "completed";
}

export async function runFupsTick(): Promise<{
  sequences: number;
  enrolled: number;
  sent: number;
  stopped: number;
  completed: number;
  failed: number;
}> {
  const { data: sequences } = await supabaseAdmin
    .from("whatsapp_fup_sequences")
    .select("*")
    .eq("active", true);

  let enrolled = 0;
  let sent = 0;
  let stopped = 0;
  let completed = 0;
  let failed = 0;

  const seqList = (sequences ?? []) as Sequence[];

  // 1) Inscrição de novos elegíveis
  for (const seq of seqList) {
    try {
      enrolled += await enrollEligible(seq);
    } catch {
      /* ignore single seq fail */
    }
  }

  // 2) Processa inscrições com next_run_at vencido
  const nowIso = new Date().toISOString();
  const { data: due } = await supabaseAdmin
    .from("whatsapp_fup_enrollments")
    .select("id, sequence_id, lead_id, current_step, last_step_at")
    .eq("status", "active")
    .not("next_run_at", "is", null)
    .lte("next_run_at", nowIso)
    .limit(200);

  const stepsBySeq = new Map<string, Step[]>();
  for (const enr of (due ?? []) as Array<{
    id: string;
    sequence_id: string;
    lead_id: string;
    current_step: number;
    last_step_at: string | null;
  }>) {
    const seq = seqList.find((s) => s.id === enr.sequence_id);
    if (!seq) continue;
    let steps = stepsBySeq.get(seq.id);
    if (!steps) {
      const { data: stepRows } = await supabaseAdmin
        .from("whatsapp_fup_steps")
        .select("*")
        .eq("sequence_id", seq.id)
        .order("step_order", { ascending: true });
      steps = (stepRows ?? []) as Step[];
      stepsBySeq.set(seq.id, steps);
    }
    try {
      const r = await processEnrollment(seq, steps, enr);
      if (r === "sent") sent++;
      else if (r === "completed") completed++;
      else if (r === "stopped") stopped++;
      else if (r === "failed") failed++;
    } catch {
      failed++;
    }
  }

  return { sequences: seqList.length, enrolled, sent, stopped, completed, failed };
}