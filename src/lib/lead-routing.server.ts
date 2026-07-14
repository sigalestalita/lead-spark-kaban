import { normalizeLeadType } from "./lead-type";

export const LEAD_ROUTING_SETTINGS_KEY = "whatsapp_lead_routing";
const LEAD_ROUTING_ROTATION_STATE_KEY = "whatsapp_lead_routing_rotation_state";

const MANAGED_ROUND_ROBIN_LEAD_TYPES = new Set(["empresa", "pessoa_fisica"] as const);

const ROUTING_TARGETS = {
  roundRobin: [
    { fullName: "Camila Mattie", email: "camila.mattie@grougp.com.br" },
    { fullName: "Lisiane Baudini", email: "lisiane@grougp.com.br" },
  ],
  consultoria: { fullName: "Mariana Borges", email: "mariana.borges@grougp.com.br" },
} as const;

export type LeadRoutingRule = {
  leadType: "consultoria" | "empresa" | "pessoa_fisica";
  userId: string;
};

export type LeadRoutingSettings = {
  enabled: boolean;
  fallbackMode: "general_queue";
  rules: LeadRoutingRule[];
};

type LeadRoutingRotationState = {
  nextRoundRobinIndex: number;
};

const DEFAULT_SETTINGS: LeadRoutingSettings = {
  enabled: false,
  fallbackMode: "general_queue",
  rules: [],
};

const DEFAULT_ROTATION_STATE: LeadRoutingRotationState = {
  nextRoundRobinIndex: 0,
};

function readRawLeadType(lead: { lead_type?: string | null; form_payload?: unknown }) {
  if (lead.lead_type) return lead.lead_type;
  if (lead.form_payload && typeof lead.form_payload === "object" && "lead_type" in lead.form_payload) {
    const value = (lead.form_payload as { lead_type?: unknown }).lead_type;
    return typeof value === "string" ? value : null;
  }
  return null;
}

function parseSettings(value: unknown): LeadRoutingSettings {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS;
  const raw = value as {
    enabled?: unknown;
    fallbackMode?: unknown;
    rules?: Array<{ leadType?: unknown; userId?: unknown }>;
  };

  const rules = Array.isArray(raw.rules)
    ? raw.rules
        .map((rule) => {
          const leadType = typeof rule?.leadType === "string" ? normalizeLeadType(rule.leadType) : null;
          const userId = typeof rule?.userId === "string" && rule.userId ? rule.userId : null;
          if (!leadType || !userId) return null;
          return { leadType, userId } as LeadRoutingRule;
        })
        .filter((rule): rule is LeadRoutingRule => !!rule)
    : [];

  return {
    enabled: raw.enabled === true,
    fallbackMode: raw.fallbackMode === "general_queue" ? "general_queue" : "general_queue",
    rules,
  };
}

export async function readLeadRoutingSettings(supabase: any) {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", LEAD_ROUTING_SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return parseSettings(data?.value);
}

function parseRotationState(value: unknown): LeadRoutingRotationState {
  if (!value || typeof value !== "object") return DEFAULT_ROTATION_STATE;
  const raw = value as { nextRoundRobinIndex?: unknown };
  const nextRoundRobinIndex = typeof raw.nextRoundRobinIndex === "number" && Number.isFinite(raw.nextRoundRobinIndex)
    ? Math.max(0, Math.trunc(raw.nextRoundRobinIndex))
    : 0;
  return { nextRoundRobinIndex };
}

async function readLeadRoutingRotationState(supabase: any) {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", LEAD_ROUTING_ROTATION_STATE_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return parseRotationState(data?.value);
}

async function writeLeadRoutingRotationState(supabase: any, state: LeadRoutingRotationState) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({
      key: LEAD_ROUTING_ROTATION_STATE_KEY,
      value: state,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

async function resolveManagedRoutingUsers(supabase: any) {
  const targetEmails = [...ROUTING_TARGETS.roundRobin.map((target) => target.email), ROUTING_TARGETS.consultoria.email];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("email", targetEmails);
  if (error) throw new Error(error.message);

  const byEmail = new Map(
    (data ?? []).map((profile) => [String(profile.email ?? "").toLowerCase(), String(profile.id)]),
  );

  const roundRobinUserIds = ROUTING_TARGETS.roundRobin
    .map((target) => byEmail.get(target.email.toLowerCase()) ?? null)
    .filter((value): value is string => !!value);
  const consultoriaUserId = byEmail.get(ROUTING_TARGETS.consultoria.email.toLowerCase()) ?? null;

  return { roundRobinUserIds, consultoriaUserId };
}

async function resolveManagedRoutingAssignee(
  supabase: any,
  leadType: "consultoria" | "empresa" | "pessoa_fisica",
) {
  const { roundRobinUserIds, consultoriaUserId } = await resolveManagedRoutingUsers(supabase);

  if (leadType === "consultoria") {
    return consultoriaUserId;
  }

  if (!MANAGED_ROUND_ROBIN_LEAD_TYPES.has(leadType) || roundRobinUserIds.length === 0) {
    return null;
  }

  const state = await readLeadRoutingRotationState(supabase);
  const nextIndex = state.nextRoundRobinIndex % roundRobinUserIds.length;
  const assignee = roundRobinUserIds[nextIndex] ?? null;
  if (!assignee) return null;

  await writeLeadRoutingRotationState(supabase, {
    nextRoundRobinIndex: (nextIndex + 1) % roundRobinUserIds.length,
  });

  return assignee;
}

export function resolveLeadRoutingAssignee(
  lead: { lead_type?: string | null; form_payload?: unknown },
  settings: LeadRoutingSettings,
) {
  if (!settings.enabled) return null;
  const leadType = normalizeLeadType(readRawLeadType(lead));
  if (!leadType) return null;
  const match = settings.rules.find((rule) => rule.leadType === leadType);
  return match?.userId ?? null;
}

export async function ensureLeadRouted({
  supabase,
  leadId,
  actorUserId,
}: {
  supabase: any;
  leadId: string;
  actorUserId?: string | null;
}) {
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, assigned_to, lead_type, form_payload")
    .eq("id", leadId)
    .maybeSingle();
  if (leadError) throw new Error(leadError.message);
  if (!lead) return null;
  if (lead.assigned_to) return lead.assigned_to;

  const normalizedLeadType = normalizeLeadType(readRawLeadType(lead));
  if (normalizedLeadType) {
    const managedAssignee = await resolveManagedRoutingAssignee(supabase, normalizedLeadType);
    if (managedAssignee) {
      const now = new Date().toISOString();
      const { error: updateLeadError } = await supabase
        .from("leads")
        .update({ assigned_to: managedAssignee, last_action_at: now })
        .eq("id", leadId);
      if (updateLeadError) throw new Error(updateLeadError.message);

      const { error: updateConvError } = await supabase
        .from("whatsapp_conversations")
        .update({ assigned_user_id: managedAssignee })
        .eq("lead_id", leadId);
      if (updateConvError) throw new Error(updateConvError.message);

      await supabase.from("lead_interactions").insert({
        lead_id: leadId,
        author_id: actorUserId ?? null,
        type: "routing",
        content:
          normalizedLeadType === "consultoria"
            ? "Lead de consultoria roteado automaticamente para Mariana Borges."
            : "Lead roteado automaticamente na roleta entre Camila Mattie e Lisiane Baudini.",
        metadata: {
          assignee_user_id: String(managedAssignee),
          mode: normalizedLeadType === "consultoria" ? "fixed" : "round_robin",
          criterion: "lead_type",
          lead_type: normalizedLeadType,
        },
      });

      return managedAssignee;
    }
  }

  const settings = await readLeadRoutingSettings(supabase);
  const assignee = resolveLeadRoutingAssignee(lead, settings);
  if (!assignee) return null;

  const now = new Date().toISOString();
  const { error: updateLeadError } = await supabase
    .from("leads")
    .update({ assigned_to: assignee, last_action_at: now })
    .eq("id", leadId);
  if (updateLeadError) throw new Error(updateLeadError.message);

  const { error: updateConvError } = await supabase
    .from("whatsapp_conversations")
    .update({ assigned_user_id: assignee })
    .eq("lead_id", leadId);
  if (updateConvError) throw new Error(updateConvError.message);

  await supabase.from("lead_interactions").insert({
    lead_id: leadId,
    author_id: actorUserId ?? null,
    type: "routing",
    content: "Lead roteado automaticamente para SDR por tipo de lead.",
    metadata: { assignee_user_id: String(assignee), mode: "fixed", criterion: "lead_type" },
  });

  return assignee;
}