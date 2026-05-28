import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

async function collectWeekStats(weekStartISO: string) {
  const weekStart = new Date(weekStartISO + "T00:00:00Z");
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const startStr = weekStart.toISOString();
  const endStr = weekEnd.toISOString();

  const [
    newLeadsRes,
    enrichedRes,
    convertedRes,
    interactionsRes,
    topLeadsRes,
    stageBreakdownRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .select("id, name, company_name, source, score, created_at", { count: "exact" })
      .gte("created_at", startStr)
      .lt("created_at", endStr)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("enriched_at", startStr)
      .lt("enriched_at", endStr),
    supabaseAdmin
      .from("leads")
      .select("id, name, company_name", { count: "exact" })
      .gte("converted_at", startStr)
      .lt("converted_at", endStr),
    supabaseAdmin
      .from("lead_interactions")
      .select("id, type", { count: "exact" })
      .gte("created_at", startStr)
      .lt("created_at", endStr),
    supabaseAdmin
      .from("leads")
      .select("id, name, company_name, score, company_segment")
      .gte("created_at", startStr)
      .lt("created_at", endStr)
      .order("score", { ascending: false })
      .limit(5),
    supabaseAdmin
      .from("leads")
      .select("priority")
      .gte("created_at", startStr)
      .lt("created_at", endStr),
  ]);

  const interactionsByType: Record<string, number> = {};
  for (const row of interactionsRes.data ?? []) {
    const t = (row as any).type ?? "outro";
    interactionsByType[t] = (interactionsByType[t] ?? 0) + 1;
  }

  const priorityBreakdown: Record<string, number> = {};
  for (const row of stageBreakdownRes.data ?? []) {
    const p = (row as any).priority ?? "pendente";
    priorityBreakdown[p] = (priorityBreakdown[p] ?? 0) + 1;
  }

  return {
    week_start: weekStartISO,
    week_end: weekEnd.toISOString().slice(0, 10),
    new_leads_count: newLeadsRes.count ?? 0,
    enriched_count: enrichedRes.count ?? 0,
    converted_count: convertedRes.count ?? 0,
    interactions_count: interactionsRes.count ?? 0,
    interactions_by_type: interactionsByType,
    priority_breakdown: priorityBreakdown,
    top_leads: (topLeadsRes.data ?? []).map((l: any) => ({
      name: l.name,
      company: l.company_name,
      score: l.score,
      segment: l.company_segment,
    })),
    converted_leads: (convertedRes.data ?? []).map((l: any) => ({
      name: l.name,
      company: l.company_name,
    })),
    sample_new_leads: (newLeadsRes.data ?? []).slice(0, 8).map((l: any) => ({
      name: l.name,
      company: l.company_name,
      source: l.source,
    })),
  };
}

const PLATFORM_CONTEXT = `
SDR GROU é a plataforma interna de qualificação de leads da Grou. Funcionalidades principais:
- CRM kanban de leads (stages customizáveis, drag-and-drop)
- Captura via Meta Ads, RD Station Marketing, Google Sheets e webhooks
- Enriquecimento automático (LinkedIn, site, segmento, tamanho de empresa)
- Scoring ICP configurável com sinais ponderados (prioridade alta/média/baixa/pendente)
- Integração bidirecional com RD Station CRM (sync de deals)
- Histórico de interações por lead (ligações, emails, reuniões, WhatsApp)
- Dashboard com métricas de funil e conversão
- Multi-usuário com autenticação
`;

async function generateContentWithAI(stats: any, recentChanges: string[]) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

  const systemPrompt = `Você é o redator interno da plataforma SDR GROU. Gere uma newsletter semanal em português brasileiro, tom profissional mas próximo, para o time interno da Grou. ${PLATFORM_CONTEXT}`;

  const userPrompt = `Gere a edição desta semana da newsletter do SDR GROU.

# Estatísticas da semana (${stats.week_start} a ${stats.week_end})
${JSON.stringify(stats, null, 2)}

# Mudanças/novidades recentes da plataforma (autodetectadas)
${recentChanges.length ? recentChanges.map((c) => `- ${c}`).join("\n") : "- (sem mudanças técnicas detectadas — fale do conceito da plataforma e dos números)"}

Instruções:
- subject: assunto curto, max 70 chars, com emoji opcional.
- summary_markdown: resumo em markdown (3-6 parágrafos curtos) para arquivamento interno.
- html_body: corpo COMPLETO de email em HTML inline-styled (sem <html>/<body>, apenas o conteúdo que vai dentro de um container). Use cores escuras (#0f172a fundo de seções, #f1f5f9 texto, accent #3b82f6). Estrutura: header com nome da plataforma, seção "Conceito da semana" (1 parágrafo lembrando o que a plataforma faz), "Números da semana" (cards visuais com os principais KPIs), "Destaques" (top leads/conversões), "Novidades técnicas" (mudanças), e um fechamento. Use tabelas e divs com style inline (compatível com clientes de email).`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "publish_newsletter",
            description: "Publica a edição semanal da newsletter SDR GROU",
            parameters: {
              type: "object",
              properties: {
                subject: { type: "string" },
                summary_markdown: { type: "string" },
                html_body: { type: "string" },
              },
              required: ["subject", "summary_markdown", "html_body"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "publish_newsletter" } },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI gateway ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error("IA não retornou tool_call");
  const parsed = JSON.parse(call.function.arguments);
  return parsed as { subject: string; summary_markdown: string; html_body: string };
}

export const generateWeeklyDigest = createServerFn({ method: "POST" })
  .inputValidator((input: { weekStart?: string; force?: boolean }) => input ?? {})
  .handler(async ({ data }) => {
    const weekStart = data.weekStart ?? mondayOf(new Date());

    const { data: existing } = await supabaseAdmin
      .from("weekly_digests")
      .select("id, status")
      .eq("week_start", weekStart)
      .maybeSingle();

    if (existing && existing.status === "sent" && !data.force) {
      return { ok: true, alreadySent: true, digestId: existing.id };
    }

    const stats = await collectWeekStats(weekStart);
    const recentChanges: string[] = []; // placeholder; pode ser populado por changelog futuro
    const ai = await generateContentWithAI(stats, recentChanges);

    if (existing) {
      const { error } = await supabaseAdmin
        .from("weekly_digests")
        .update({
          subject: ai.subject,
          content_html: wrapHtml(ai.html_body),
          content_summary: ai.summary_markdown,
          stats,
          status: "draft",
          error_message: null,
        })
        .eq("id", existing.id);
      if (error) throw error;
      return { ok: true, digestId: existing.id };
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("weekly_digests")
        .insert({
          week_start: weekStart,
          subject: ai.subject,
          content_html: wrapHtml(ai.html_body),
          content_summary: ai.summary_markdown,
          stats,
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw error;
      return { ok: true, digestId: inserted.id };
    }
  });

function wrapHtml(inner: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SDR GROU</title></head>
<body style="margin:0;padding:0;background:#0b1120;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#0f172a;border-radius:12px;overflow:hidden;border:1px solid #1e293b;">
<tr><td style="padding:24px 28px;">
${inner}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #1e293b;font-size:11px;color:#64748b;text-align:center;">
Esta é a newsletter interna do SDR GROU · Enviado automaticamente toda quinta-feira
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export async function sendDigestEmail(digestId: string) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error("RESEND_API_KEY não configurada");

  const { data: digest, error } = await supabaseAdmin
    .from("weekly_digests")
    .select("*")
    .eq("id", digestId)
    .single();
  if (error || !digest) throw new Error("Digest não encontrado");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "SDR GROU <noreply@grougp.com.br>",
      to: ["time@grougp.com.br"],
      subject: digest.subject,
      html: digest.content_html,
    }),
  });

  const respText = await res.text();
  if (!res.ok) {
    await supabaseAdmin
      .from("weekly_digests")
      .update({ status: "failed", error_message: respText.slice(0, 1000) })
      .eq("id", digestId);
    throw new Error(`Resend ${res.status}: ${respText.slice(0, 500)}`);
  }

  await supabaseAdmin
    .from("weekly_digests")
    .update({ status: "sent", sent_at: new Date().toISOString(), error_message: null })
    .eq("id", digestId);

  return { ok: true, providerResponse: respText.slice(0, 200) };
}