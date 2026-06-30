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

async function collectWeekStats(weekStartISO: string, opts?: { rangeStartISO?: string; rangeEndISO?: string }) {
  const weekStart = new Date(weekStartISO + "T00:00:00Z");
  const defaultEnd = new Date(weekStart);
  defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 7);

  const minDate = new Date(MIN_LEAD_DATE + "T00:00:00Z");
  const rangeStart = opts?.rangeStartISO
    ? new Date(opts.rangeStartISO)
    : (weekStart > minDate ? weekStart : minDate);
  const rangeEnd = opts?.rangeEndISO ? new Date(opts.rangeEndISO) : defaultEnd;
  const startStr = rangeStart.toISOString();
  const endStr = rangeEnd.toISOString();

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
    week_end: rangeEnd.toISOString().slice(0, 10),
    range_start: startStr,
    range_end: endStr,
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

async function generateContentWithAI(stats: any, briefOverride?: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

  const systemPrompt = briefOverride
    ? `Você escreve a newsletter interna da Grou. Tom: leve, próximo, animado, em português brasileiro. Linguagem simples e humana, sem jargão técnico pesado. Quando falar de funcionalidades, fale com entusiasmo e clareza, traduzindo para o que muda no dia a dia do time.`
    : `Você escreve a newsletter semanal do time comercial da Grou. Tom: leve, próximo, motivador, em português brasileiro. NÃO use jargão técnico, NÃO fale de plataforma, sistema, integrações, scoring, ICP, webhooks, dashboard ou qualquer termo de tecnologia. Fale como se fosse um colega comentando os números e os destaques da semana com o time.`;

  const styleGuide = `
IMPORTANTE — paleta do email (fundo é ESCURO, use estas cores):
- Texto principal: #e6ecff
- Texto secundário/muted: #94a3c8
- Títulos: #ffffff
- Cor de destaque/links: #4A90E2
- Fundo de cards/seções: #121a33
- Borda de cards: #1f2a4a
Use SEMPRE estilos inline (style="..."). Use <table> para os cards de números (grid de 2 ou 4 colunas) com fundo #121a33, borda 1px solid #1f2a4a, border-radius 10px, padding 16px. Números grandes (font-size 28px, font-weight 700, color #ffffff) e label pequena abaixo (font-size 11px, text-transform uppercase, letter-spacing 1px, color #94a3c8).
NÃO inclua <html>, <body>, header com logo, nem footer — eles já são adicionados ao redor. Gere apenas o conteúdo interno do email.`;

  const userPrompt = briefOverride
    ? `${briefOverride}

# Período considerado: ${stats.range_start} até ${stats.range_end}
(Considerando apenas leads cadastrados a partir de ${stats.data_cutoff}.)

# Números reais do período (use estes dados, não invente)
${JSON.stringify(stats, null, 2)}

Instruções de saída:
- subject: assunto curto e marcante, máx 70 caracteres, pode ter emoji.
- summary_markdown: resumo em markdown (3 a 6 parágrafos curtos).
- html_body: corpo do conteúdo do email em HTML com estilos inline.
${styleGuide}`
    : `Escreva a newsletter desta semana para o time comercial.

# Período: ${stats.week_start} a ${stats.week_end}
(Considerando apenas leads cadastrados a partir de ${stats.data_cutoff}.)

# Números da semana
${JSON.stringify(stats, null, 2)}

Instruções de escrita:
- subject: assunto curto e humano, máx 70 caracteres, pode ter um emoji.
- summary_markdown: resumo em markdown (3 a 5 parágrafos curtos), em linguagem simples e amigável.
- html_body: corpo do conteúdo do email em HTML. Estrutura:
  1. Saudação calorosa ao time.
  2. Bloco "Resumo da semana" — 1 parágrafo curto contando como foi.
  3. Bloco "Nossos números" — cards visuais com os principais indicadores (leads novos, enriquecidos, convertidos, interações), em linguagem do dia a dia.
  4. Bloco "Destaques da semana" — empresas e pessoas que se destacaram.
  5. Fechamento curto, motivador.
Importante: ZERO jargão técnico. Nada de "pipeline", "ICP", "score", "API". Fale de pessoas, empresas, oportunidades, contatos, conversas.
${styleGuide}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
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
  rangeStartISO?: string;
  rangeEndISO?: string;
  briefOverride?: string;
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

    const stats = await collectWeekStats(weekStart, {
      rangeStartISO: opts.rangeStartISO,
      rangeEndISO: opts.rangeEndISO,
    });
    const ai = await generateContentWithAI(stats, opts.briefOverride);

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

const PUBLIC_SITE_URL = "https://sdr-grou.lovable.app";
const LOGO_URL = "https://vlfohgirjbgpqhqbnuks.supabase.co/storage/v1/object/public/email-assets/lidi-logo-white.png";

export function wrapHtml(inner: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lidi — Newsletter do time Grou</title></head>
<body style="margin:0;padding:0;background:#0b1226;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e6ecff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1226;padding:32px 0;"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#0b1226;border-radius:16px;overflow:hidden;border:1px solid #1f2a4a;">
<tr><td style="background:linear-gradient(135deg,#003DA5 0%,#4A90E2 55%,#6b46c1 100%);padding:36px 28px;text-align:center;">
<img src="${LOGO_URL}" alt="Lidi" height="44" style="height:44px;display:inline-block;border:0;outline:none;text-decoration:none;" />
<p style="margin:14px 0 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#dbe6ff;opacity:0.85;">Newsletter semanal · Time Grou</p>
</td></tr>
<tr><td style="padding:32px 28px;background:#0b1226;color:#e6ecff;font-size:15px;line-height:1.65;">
${inner}
</td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid #1f2a4a;background:#080f1f;text-align:center;">
<img src="${LOGO_URL}" alt="Lidi" height="20" style="height:20px;display:inline-block;border:0;outline:none;opacity:0.7;" />
<p style="margin:8px 0 0;font-size:11px;color:#94a3c8;">Gerado automaticamente pela Lidi · Plataforma de leads da Grou</p>
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
      from: "Lidi <noreply@grougp.com.br>",
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