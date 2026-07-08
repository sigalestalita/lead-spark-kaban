import { normalizeLeadType } from "./lead-type";

export const LEAD_ROUTING_SETTINGS_KEY = "whatsapp_lead_routing";

export type LeadRoutingRule = {
  leadType: "consultoria" | "empresa" | "pessoa_fisica";
  userId: string;
};

export type LeadRoutingSettings = {
  enabled: boolean;
  fallbackMode: "general_queue";
  rules: LeadRoutingRule[];
};

const DEFAULT_SETTINGS: LeadRoutingSettings = {
  enabled: false,
  fallbackMode: "general_queue",
  rules: [],
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

export async function readLeadRoutingSettings(supabase: {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: { value: unknown } | null; error: { message: string } | null }> };
    };
  };
}) {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", LEAD_ROUTING_SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return parseSettings(data?.value);
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
  supabase: {
    from: (table: string) => any;
  };
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

  const settings = await readLeadRoutingSettings(supabase as never);
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
    metadata: { assignee_user_id: assignee, mode: "fixed", criterion: "lead_type" },
  });

  return assignee;
}