// Cliente Graph API para Message Templates da Meta.
// Docs: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates

const DEFAULT_BASE = "https://graph.facebook.com/v21.0";

export type MetaButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phone_number: string };

export type MetaTemplateInput = {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  body: string;
  bodyExamples?: string[];
  headerText?: string | null;
  footerText?: string | null;
  buttons?: MetaButton[];
};

type GraphAccount = {
  access_token: string;
  provider_base_url?: string | null;
  metadata?: Record<string, unknown> | null;
};

function wabaId(account: GraphAccount): string {
  const meta = (account.metadata ?? {}) as Record<string, unknown>;
  const id = typeof meta.waba_id === "string" ? meta.waba_id : "";
  if (!id) throw new Error("waba_id ausente em metadata da conta WhatsApp");
  return id;
}

function baseUrl(account: GraphAccount): string {
  return (account.provider_base_url || DEFAULT_BASE).replace(/\/+$/, "");
}

function buildComponents(input: MetaTemplateInput) {
  const comps: Array<Record<string, unknown>> = [];
  if (input.headerText && input.headerText.trim()) {
    comps.push({ type: "HEADER", format: "TEXT", text: input.headerText.trim() });
  }
  const bodyComp: Record<string, unknown> = { type: "BODY", text: input.body };
  if (input.bodyExamples && input.bodyExamples.length > 0) {
    bodyComp.example = { body_text: [input.bodyExamples.map((v) => v || "exemplo")] };
  }
  comps.push(bodyComp);
  if (input.footerText && input.footerText.trim()) {
    comps.push({ type: "FOOTER", text: input.footerText.trim() });
  }
  if (input.buttons && input.buttons.length > 0) {
    comps.push({ type: "BUTTONS", buttons: input.buttons });
  }
  return comps;
}

export async function submitMetaTemplate(
  account: GraphAccount,
  input: MetaTemplateInput,
): Promise<{ id: string; status: string; category?: string }> {
  const url = `${baseUrl(account)}/${wabaId(account)}/message_templates`;
  const payload = {
    name: input.name,
    language: input.language,
    category: input.category,
    components: buildComponents(input),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json: { id?: string; status?: string; category?: string; error?: { message?: string; error_user_msg?: string } } = {};
  try { json = JSON.parse(text); } catch { /* ignore */ }
  if (!res.ok) {
    const msg = json.error?.error_user_msg || json.error?.message || `HTTP ${res.status}: ${text.slice(0, 400)}`;
    throw new Error(msg);
  }
  return { id: json.id ?? "", status: json.status ?? "PENDING", category: json.category };
}

export type MetaTemplateRow = {
  id: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  rejected_reason?: string;
};

export async function listMetaTemplates(account: GraphAccount): Promise<MetaTemplateRow[]> {
  const url = `${baseUrl(account)}/${wabaId(account)}/message_templates?fields=id,name,language,status,category,rejected_reason&limit=200`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });
  const text = await res.text();
  let json: { data?: MetaTemplateRow[]; error?: { message?: string } } = {};
  try { json = JSON.parse(text); } catch { /* ignore */ }
  if (!res.ok) throw new Error(json.error?.message || `HTTP ${res.status}: ${text.slice(0, 300)}`);
  return json.data ?? [];
}

export type MetaTemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  buttons?: unknown[];
};

export async function fetchMetaTemplateDetails(
  account: GraphAccount,
  templateId: string,
): Promise<{ components: MetaTemplateComponent[] }> {
  const url = `${baseUrl(account)}/${templateId}?fields=name,language,status,category,components`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${account.access_token}` },
  });
  const text = await res.text();
  let json: { components?: MetaTemplateComponent[]; error?: { message?: string } } = {};
  try { json = JSON.parse(text); } catch { /* ignore */ }
  if (!res.ok) throw new Error(json.error?.message || `HTTP ${res.status}: ${text.slice(0, 300)}`);
  return { components: json.components ?? [] };
}

export async function deleteMetaTemplate(account: GraphAccount, name: string): Promise<void> {
  const url = `${baseUrl(account)}/${wabaId(account)}/message_templates?name=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${account.access_token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
}