import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Só considerar leads criados a partir desta data (início da operação na planilha)
const MIN_LEAD_DATE = "2025-05-15";

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

  const minDate = new Date(MIN_LEAD_DATE + "T00:00:00Z");
  const effectiveStart = weekStart > minDate ? weekStart : minDate;
  const startStr = effectiveStart.toISOString();
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
    data_cutoff: MIN_LEAD_DATE,
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

async function generateContentWithAI(stats: any) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

  const systemPrompt = `Você escreve a newsletter semanal do time comercial da Grou. Tom: leve, próximo, motivador, em português brasileiro. NÃO use jargão técnico, NÃO fale de plataforma, sistema, integrações, scoring, ICP, webhooks, dashboard ou qualquer termo de tecnologia. Fale como se fosse um colega comentando os números e os destaques da semana com o time.`;

  const userPrompt = `Escreva a newsletter desta semana para o time comercial.

# Período: ${stats.week_start} a ${stats.week_end}
(Considerando apenas leads cadastrados a partir de ${stats.data_cutoff}.)

# Números da semana
${JSON.stringify(stats, null, 2)}

Instruções de escrita:
- subject: assunto curto e humano, máx 70 caracteres, pode ter um emoji.
- summary_markdown: resumo em markdown (3 a 5 parágrafos curtos), em linguagem simples e amigável.
- html_body: corpo COMPLETO do e-mail em HTML com estilos inline (sem <html>/<body>, só o conteúdo do container). Use fundo claro #ffffff, texto #0f172a, títulos em #1e293b, destaque #2563eb. Estrutura:
  1. Saudação calorosa ao time.
  2. Bloco "Resumo da semana" — 1 parágrafo curto contando como foi.
  3. Bloco "Nossos números" — cards/tabela visual com os principais indicadores (leads novos, enriquecidos, convertidos, interações), sempre em linguagem do dia a dia (ex: "novos contatos chegaram", "oportunidades avançaram"), nunca termos técnicos.
  4. Bloco "Destaques da semana" — empresas e pessoas que se destacaram.
  5. Fechamento curto, motivador.
Importante: ZERO jargão técnico. Nada de "pipeline", "ICP", "score", "API". Fale de pessoas, empresas, oportunidades, contatos, conversas.`;

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

export async function generateWeeklyDigestInternal(opts: {
  weekStart?: string;
  force?: boolean;
}) {
    const weekStart = opts.weekStart ?? mondayOf(new Date());

    const { data: existing } = await supabaseAdmin
      .from("weekly_digests")
      .select("id, status")
      .eq("week_start", weekStart)
      .maybeSingle();

    if (existing && existing.status === "sent" && !opts.force) {
      return { ok: true, alreadySent: true, digestId: existing.id };
    }

    const stats = await collectWeekStats(weekStart);
    const ai = await generateContentWithAI(stats);

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
}

export const generateWeeklyDigest = createServerFn({ method: "POST" })
  .inputValidator((input: { weekStart?: string; force?: boolean }) => input ?? {})
  .handler(async ({ data }) => generateWeeklyDigestInternal(data));

function wrapHtml(inner: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Novidades da semana — Grou</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
<tr><td style="padding:24px 28px;">
${inner}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;text-align:center;">
Novidades da semana · Time Grou
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