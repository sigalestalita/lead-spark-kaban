import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LEAD_TYPE_LABEL, type LeadType } from "./lead-type";

const GATEWAY = "https://connector-gateway.lovable.dev/resend/emails";
const FROM = "Grou SDR <onboarding@resend.dev>";
const APP_URL = process.env.APP_PUBLIC_URL || "https://sdr-grou.lovable.app";

const RECIPIENTS: Record<LeadType, string> = {
  empresa: "lisiane@grougp.com.br",
  pessoa_fisica: "lisiane@grougp.com.br",
  consultoria: "mariana.borges@grougp.com.br",
};

const TYPE_COLORS: Record<LeadType, string> = {
  consultoria: "#7c3aed",
  empresa: "#2563eb",
  pessoa_fisica: "#059669",
};

export type NewLeadNotification = {
  id?: string | null;
  name: string;
  company_name?: string | null;
  lead_type: LeadType | null | undefined;
  score?: number | null;
  priority?: string | null;
};

export async function notifyNewLead(lead: NewLeadNotification): Promise<void> {
  try {
    const type = lead.lead_type;
    if (!type) return;
    const to = RECIPIENTS[type];
    if (!to) return;

    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      await logResult("error", { reason: "missing_keys", lead_id: lead.id ?? null });
      return;
    }

    const label = LEAD_TYPE_LABEL[type];
    const color = TYPE_COLORS[type];
    const subject = `Novo lead: ${lead.name} — ${label}`;
    const leadUrl = lead.id ? `${APP_URL}/lead/${lead.id}` : APP_URL;
    const score = lead.score ?? 0;
    const priority = lead.priority ?? "pendente";
    const company = lead.company_name?.trim() || "—";

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f5f6f8;padding:24px;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 4px 0;color:#111827;font-size:18px;">Novo lead recebido</h2>
          <p style="margin:0 0 16px 0;color:#6b7280;font-size:13px;">Um novo contato entrou no funil.</p>
          <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:${color};color:#fff;font-size:12px;font-weight:600;margin-bottom:16px;">${label}</div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;">
            <tr><td style="padding:6px 0;color:#6b7280;width:120px;">Nome</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(lead.name)}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Empresa</td><td style="padding:6px 0;">${escapeHtml(company)}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Classificação</td><td style="padding:6px 0;">${label}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Score</td><td style="padding:6px 0;">${score} <span style="color:#6b7280;">(${escapeHtml(String(priority))})</span></td></tr>
          </table>
          <div style="margin-top:20px;">
            <a href="${leadUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600;">Abrir lead</a>
          </div>
        </div>
      </div>
    `;

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });

    if (!res.ok) {
      const body = await res.text();
      await logResult("error", {
        lead_id: lead.id ?? null,
        to,
        status: res.status,
        body: body.slice(0, 500),
      });
      return;
    }

    await logResult("ok", { lead_id: lead.id ?? null, to, lead_type: type });
  } catch (err) {
    await logResult("error", {
      lead_id: lead.id ?? null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function logResult(status: "ok" | "error", detail: Record<string, unknown>) {
  try {
    await supabaseAdmin.from("integration_logs").insert({
      provider: "resend",
      action: "notify_new_lead",
      status,
      detail: detail as never,
    });
  } catch {
    // swallow — logging must never throw
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}