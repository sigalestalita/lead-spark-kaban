import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY = "https://connector-gateway.lovable.dev/resend/emails";
const FROM = "COMPASS CS <onboarding@resend.dev>";
const APP_URL = process.env.APP_PUBLIC_URL || "https://lead-spark-kaban.lovable.app";

const ACTIVITY_LABEL: Record<string, string> = {
  reuniao_estrategica: "Reunião estratégica",
  onboarding: "Onboarding",
  masterclass: "Masterclass",
  outro: "Atividade",
};

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export async function notifySignalActivity(params: {
  clientId: string;
  clientName: string;
  sinaleira: string | null;
  activityType: string;
  title?: string | null;
  notes?: string | null;
  performedByName?: string | null;
  assignedUserId: string | null;
}) {
  try {
    if (!params.assignedUserId) return;
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) return;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", params.assignedUserId)
      .maybeSingle();
    const to = profile?.email;
    if (!to) return;

    const label = ACTIVITY_LABEL[params.activityType] ?? params.activityType;
    const subject = `Sinaleira PDA — ${label}: ${params.clientName}`;
    const color = params.sinaleira === "VERDE" ? "#16a34a"
      : params.sinaleira === "AMARELO" ? "#eab308"
      : params.sinaleira === "VERMELHO" ? "#dc2626"
      : "#111827";

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f5f6f8;padding:24px;">
        <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
          <h2 style="margin:0 0 4px 0;color:#111827;font-size:18px;">Nova atividade registrada</h2>
          <p style="margin:0 0 16px 0;color:#6b7280;font-size:13px;">Um cliente da sua carteira teve uma atividade registrada.</p>
          <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:${color};color:#fff;font-size:12px;font-weight:600;margin-bottom:16px;">Sinaleira ${esc(params.sinaleira || "—")}</div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;">
            <tr><td style="padding:6px 0;color:#6b7280;width:130px;">Cliente</td><td style="padding:6px 0;font-weight:600;">${esc(params.clientName)}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Tipo</td><td style="padding:6px 0;">${esc(label)}</td></tr>
            ${params.title ? `<tr><td style="padding:6px 0;color:#6b7280;">Título</td><td style="padding:6px 0;">${esc(params.title)}</td></tr>` : ""}
            ${params.performedByName ? `<tr><td style="padding:6px 0;color:#6b7280;">Registrado por</td><td style="padding:6px 0;">${esc(params.performedByName)}</td></tr>` : ""}
            ${params.notes ? `<tr><td style="padding:6px 0;color:#6b7280;vertical-align:top;">Notas</td><td style="padding:6px 0;white-space:pre-wrap;">${esc(params.notes)}</td></tr>` : ""}
          </table>
          <div style="margin-top:20px;">
            <a href="${APP_URL}/cs/sinaleira-pda" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#111827;color:#fff;text-decoration:none;font-size:13px;font-weight:600;">Abrir Sinaleira PDA</a>
          </div>
        </div>
      </div>`;

    await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
  } catch {
    // silencioso
  }
}
