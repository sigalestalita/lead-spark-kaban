import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

async function callAI(messages: { role: string; content: string }[], tool?: unknown) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY não configurado");
  const body: Record<string, unknown> = { model: MODEL, messages };
  if (tool) {
    body.tools = [tool];
    body.tool_choice = { type: "function", function: { name: (tool as { function: { name: string } }).function.name } };
  }
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("Rate limit atingido. Tente novamente em alguns segundos.");
  if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos em Settings → Workspace → Usage.");
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Enriquecimento via IA — gera resumo, segmento, dor provável a partir dos dados existentes. */
export const enrichLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: lead } = await supabase.from("leads").select("*").eq("id", data.id).maybeSingle();
    if (!lead) throw new Error("Lead não encontrado");

    const tool = {
      type: "function",
      function: {
        name: "enrich_lead",
        description: "Sugere campos de enriquecimento da empresa e do lead a partir do contexto disponível.",
        parameters: {
          type: "object",
          properties: {
            company_summary: { type: "string", description: "Resumo de 1-2 frases sobre a empresa" },
            company_segment: { type: "string", description: "Segmento estimado (ex.: SaaS B2B, Indústria, Educação)" },
            company_size: { type: "string", enum: ["1-10", "11-50", "51-200", "201-500", "500+", "desconhecido"] },
            probable_pain: { type: "string", description: "Dor provável que justifica a busca por SDR/comercial" },
            confidence: { type: "string", enum: ["alta", "media", "baixa"] },
          },
          required: ["company_summary", "company_segment", "company_size", "probable_pain", "confidence"],
          additionalProperties: false,
        },
      },
    };

    const ctx = {
      nome: lead.name,
      email: lead.email,
      cargo: lead.position,
      empresa: lead.company_name,
      site: lead.company_website,
      segmento_atual: lead.company_segment,
      campanha: lead.campaign,
      anuncio: lead.ad_name,
      formulario: lead.form_name,
      payload: lead.form_payload,
    };

    const result = await callAI(
      [
        {
          role: "system",
          content:
            "Você é um analista de pré-vendas B2B. A partir do contexto fornecido (nome, email corporativo, empresa, cargo, campanha de origem), produza inferências realistas. Se não tiver dados suficientes para uma inferência confiável, use 'desconhecido' e marque confidence baixa. Não invente dados específicos verificáveis (CNPJ, faturamento, número exato de funcionários).",
        },
        {
          role: "user",
          content: `Contexto do lead:\n${JSON.stringify(ctx, null, 2)}`,
        },
      ],
      tool
    );

    const call = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("IA não retornou estrutura esperada");
    const args = JSON.parse(call.function.arguments);

    const patch = {
      company_summary: args.company_summary,
      company_segment: lead.company_segment || args.company_segment,
      company_size: lead.company_size || (args.company_size !== "desconhecido" ? args.company_size : lead.company_size),
      probable_pain: args.probable_pain,
      enrichment_status: "found" as const,
      enriched_at: new Date().toISOString(),
    };

    await supabase.from("leads").update(patch).eq("id", data.id);
    await supabase.from("lead_interactions").insert({
      lead_id: data.id,
      author_id: userId,
      type: "enrichment",
      content: `Enriquecimento via IA (confiança ${args.confidence})`,
      metadata: args,
    });
    await supabase.from("integration_logs").insert({
      provider: "lovable_ai",
      action: "enrich_lead",
      status: "ok",
      detail: { lead_id: data.id, confidence: args.confidence },
    });

    return { ok: true, ...args };
  });

/** Sugere mensagem de abordagem para WhatsApp */
export const suggestApproach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: lead } = await supabase.from("leads").select("*").eq("id", data.id).maybeSingle();
    if (!lead) throw new Error("Lead não encontrado");
    const { data: tplRow } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "whatsapp_template")
      .maybeSingle();
    const template =
      ((tplRow?.value as { text?: string } | null)?.text as string | undefined) ?? "";

    const result = await callAI([
      {
        role: "system",
        content:
          "Você é um SDR experiente. Gere UMA mensagem curta de WhatsApp (3-5 frases, máx 600 caracteres) em português brasileiro, tom consultivo e humano, primeira pessoa. Sem emoji exagerado, sem parecer template. Referencie o contexto da conversão e a possível dor. Termine com uma pergunta aberta convidando a uma conversa rápida. Não use saudação genérica do tipo 'Espero que esteja bem'.",
      },
      {
        role: "user",
        content: `Lead:
- Nome: ${lead.name}
- Empresa: ${lead.company_name ?? "—"}
- Cargo: ${lead.position ?? "—"}
- Campanha/anúncio: ${lead.campaign ?? "—"} / ${lead.ad_name ?? "—"}
- Formulário: ${lead.form_name ?? "—"}
- Dor provável: ${lead.probable_pain ?? "—"}
- Resumo empresa: ${lead.company_summary ?? "—"}

Template de referência (estrutura, não copiar literal):
${template}`,
      },
    ]);

    const message = result.choices?.[0]?.message?.content?.trim() ?? "";
    await supabase.from("lead_interactions").insert({
      lead_id: data.id,
      author_id: userId,
      type: "ai_suggestion",
      content: message,
    });
    return { message };
  });