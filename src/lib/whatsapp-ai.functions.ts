import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

async function callAI(messages: Array<{ role: string; content: string }>, tool?: unknown) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente");
  const body: Record<string, unknown> = { model: MODEL, messages };
  if (tool) {
    body.tools = [tool];
    body.tool_choice = {
      type: "function",
      function: { name: (tool as { function: { name: string } }).function.name },
    };
  }
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("Rate limit atingido. Tente novamente em alguns segundos.");
  if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos em Settings → Workspace → Usage.");
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<{
    choices: Array<{ message: { content?: string; tool_calls?: Array<{ function: { arguments: string } }> } }>;
  }>;
}

/** Carrega conversa + últimas N mensagens + dados do lead. */
async function loadContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  conversationId: string,
  limit = 40,
) {
  const { data: conv, error: cErr } = await supabase
    .from("whatsapp_conversations")
    .select(
      "*, leads(id,name,company_name,position,company_segment,company_size,company_website,stage_id,priority,score,demo_free,lead_type,assigned_to,phone,email,linkedin_url)",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  if (!conv) throw new Error("Conversa não encontrada");

  const leadId = (conv as { lead_id?: string }).lead_id;
  const stageId = (conv as { leads?: { stage_id?: string | null } }).leads?.stage_id ?? null;
  const [msgsRes, notesRes, stageRes, icpRes] = await Promise.all([
    supabase
      .from("whatsapp_messages")
      .select("sender_type, message_type, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit),
    leadId
      ? supabase
          .from("lead_notes")
          .select("content, created_at")
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    stageId
      ? supabase.from("stages").select("name, slug").eq("id", stageId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("icp_config").select("rules").eq("is_active", true).maybeSingle(),
  ]);
  if (msgsRes.error) throw new Error(msgsRes.error.message);

  const messages = (msgsRes.data ?? []).slice().reverse();
  return {
    conv,
    messages,
    notes: (notesRes.data ?? []) as Array<{ content: string; created_at: string }>,
    stage: (stageRes.data ?? null) as { name: string; slug: string } | null,
    icp: (icpRes.data?.rules ?? null) as Record<string, unknown> | null,
  };
}

function leadBrief(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lead: any,
  stage: { name: string; slug: string } | null,
  notes: Array<{ content: string; created_at: string }>,
  icp: Record<string, unknown> | null,
) {
  const lines: string[] = [];
  lines.push(
    `Lead: ${JSON.stringify({
      nome: lead?.name,
      cargo: lead?.position,
      empresa: lead?.company_name,
      segmento: lead?.company_segment,
      tamanho: lead?.company_size,
      site: lead?.company_website,
      prioridade: lead?.priority,
      score: lead?.score,
      tipo: lead?.lead_type,
      etapa_funil: stage?.name,
    })}`,
  );
  if (notes.length > 0) {
    lines.push(
      `Observações internas do CRM (mais recentes primeiro):\n` +
        notes
          .map((n) => `- (${new Date(n.created_at).toLocaleDateString("pt-BR")}) ${n.content}`)
          .join("\n"),
    );
  }
  if (icp && Object.keys(icp).length > 0) {
    lines.push(
      `ICP da operação (referência interna de fit — não cite ao lead): ${JSON.stringify(icp).slice(0, 800)}`,
    );
  }
  return lines.join("\n\n");
}

function transcript(messages: Array<{ sender_type: string; message_type: string; body: string | null; created_at: string }>) {
  return messages
    .map((m) => {
      const who = m.sender_type === "lead" ? "Lead" : m.sender_type === "sdr" ? "SDR" : m.sender_type === "bot" ? "Bot" : m.sender_type;
      const ts = new Date(m.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      const body = m.body?.trim() || `[${m.message_type}]`;
      return `[${ts}] ${who}: ${body}`;
    })
    .join("\n");
}

const SYSTEM_BASE = [
  "Você é um SDR sênior B2B brasileiro, especialista em prospecção outbound consultiva e qualificação via WhatsApp.",
  "Domina e aplica naturalmente: SPIN Selling (Situação, Problema, Implicação, Necessidade-Solução), MEDDIC (Métricas, Decisor, Critério, Processo, Dor, Champion), Challenger Sale e tratamento de objeções (acolher → reformular → prova → reabrir).",
  "Objetivo PRIMÁRIO: agendar reunião/demo com o decisor. Cada mensagem move o lead 1 passo no funil.",
  "Princípios:",
  "1) Foco em DOR e IMPACTO mensurável (receita, custo, tempo, risco) — nunca em features soltas.",
  "2) Personalize por cargo, segmento, tamanho e sinais observados. Não invente fatos.",
  "3) Mensagens curtas (2-5 linhas, máx. 600 caracteres), 1 ideia por mensagem, sempre terminando em UMA pergunta aberta OU CTA específico (data/horário, link de agenda).",
  "4) Tom humano, direto, consultivo. Sem 'tudo bem?', sem 'espero que esteja bem', sem jargão, sem CAIXA ALTA, sem promessas irreais. Português do Brasil.",
  "5) Sem emojis a menos que o lead use primeiro.",
  "6) Objeções: acolha, reformule a dor, traga prova social/dado curto, reabra com pergunta. Nunca rebata de frente.",
  "7) Lead frio/sem resposta: use quebra-padrão baseada no segmento OU ofereça opt-out educado para gerar resposta.",
  "8) Respeite estágio do funil e histórico. Após muitos follow-ups sem resposta, sugira encerrar com elegância.",
].join(" ");

/** Gera resumo curto da conversa e persiste em whatsapp_conversations.ai_summary. */
export const summarizeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { conv, messages, notes, stage, icp } = await loadContext(context.supabase, data.conversationId, 60);
    if (messages.length === 0) return { summary: "Conversa ainda sem mensagens." };

    const lead = (conv.leads ?? {}) as Record<string, unknown>;
    const result = await callAI([
      { role: "system", content: SYSTEM_BASE },
      {
        role: "user",
        content:
          `Resuma esta conversa de WhatsApp em até 6 bullets curtos (máx. 1 linha cada). ` +
          `Cubra: contexto do lead, dor identificada, objeções, sinais de compra, fit com ICP, próximo passo recomendado. ` +
          `Não invente fatos.\n\n` +
          `${leadBrief(lead, stage, notes, icp)}\n\n` +
          `Conversa:\n${transcript(messages)}`,
      },
    ]);
    const summary = result.choices?.[0]?.message?.content?.trim() ?? "";
    if (!summary) throw new Error("IA não retornou resumo");

    await context.supabase
      .from("whatsapp_conversations")
      .update({ ai_summary: summary, ai_summary_at: new Date().toISOString() })
      .eq("id", data.conversationId);

    return { summary, summarized_at: new Date().toISOString() };
  });

/** Sugere a próxima mensagem do SDR (não envia — devolve para o composer). */
export const suggestReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        conversationId: z.string().uuid(),
        instructions: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { conv, messages, notes, stage, icp } = await loadContext(context.supabase, data.conversationId, 30);
    const lead = (conv.leads ?? {}) as Record<string, unknown>;
    const result = await callAI([
      { role: "system", content: SYSTEM_BASE },
      {
        role: "user",
        content:
          `Sugira a PRÓXIMA mensagem que o SDR deve enviar para maximizar conversão (resposta + avanço de funil). ` +
          `Aplique SPIN/MEDDIC implicitamente: identifique a dor mais provável do cargo/segmento, conecte a um impacto mensurável e termine com 1 pergunta aberta OU CTA claro (ex: "terça 15h ou quinta 10h?"). ` +
          `Não use saudações genéricas se a conversa já está em andamento. Não invente dados.\n\n` +
          (data.instructions ? `Direção adicional do SDR: ${data.instructions}\n\n` : "") +
          `${leadBrief(lead, stage, notes, icp)}\n\n` +
          `Conversa:\n${transcript(messages)}\n\n` +
          `Responda APENAS com o texto da mensagem, sem aspas, sem prefixos, sem assinatura.`,
      },
    ]);
    const reply = result.choices?.[0]?.message?.content?.trim() ?? "";
    if (!reply) throw new Error("IA não retornou sugestão");
    return { reply };
  });

/** Classifica temperatura do lead (quente/morno/frio) e persiste. */
export const classifyTemperature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { conv, messages, notes, stage, icp } = await loadContext(context.supabase, data.conversationId, 40);
    if (messages.length === 0) throw new Error("Sem mensagens para classificar");

    const tool = {
      type: "function",
      function: {
        name: "classify_lead",
        description: "Classifica a temperatura comercial do lead a partir da conversa.",
        parameters: {
          type: "object",
          properties: {
            temperature: {
              type: "string",
              enum: ["quente", "morno", "frio"],
              description:
                "quente = demonstrou intenção clara de compra/agendamento; morno = engajado mas explorando; frio = sem resposta ou sem interesse claro",
            },
            reason: {
              type: "string",
              description: "Justificativa curta (1-2 frases) baseada em sinais concretos da conversa",
            },
            buying_signals: {
              type: "array",
              items: { type: "string" },
              description: "Lista curta de sinais de compra observados (vazio se não houver)",
            },
            objections: {
              type: "array",
              items: { type: "string" },
              description: "Objeções/atritos identificados (vazio se não houver)",
            },
          },
          required: ["temperature", "reason", "buying_signals", "objections"],
          additionalProperties: false,
        },
      },
    };

    const lead = (conv.leads ?? {}) as Record<string, unknown>;
    const result = await callAI(
      [
        { role: "system", content: SYSTEM_BASE },
        {
          role: "user",
          content:
            `Classifique a temperatura comercial deste lead com base nos sinais concretos da conversa e no fit com o ICP.\n\n` +
            `${leadBrief(lead, stage, notes, icp)}\n\n` +
            `Conversa:\n${transcript(messages)}`,
        },
      ],
      tool,
    );
    const call = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("IA não retornou estrutura esperada");
    const args = JSON.parse(call.function.arguments) as {
      temperature: "quente" | "morno" | "frio";
      reason: string;
      buying_signals: string[];
      objections: string[];
    };

    await context.supabase
      .from("whatsapp_conversations")
      .update({
        temperature: args.temperature,
        temperature_reason: args.reason,
        temperature_at: new Date().toISOString(),
      })
      .eq("id", data.conversationId);

    return args;
  });

/** Devolve o estado AI persistido da conversa. */
export const getConversationAi = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("whatsapp_conversations")
      .select("ai_summary, ai_summary_at, temperature, temperature_reason, temperature_at")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

/** Plano de abordagem: 3 próximos passos com táticas distintas (estratégia, ângulo, mensagem pronta). */
export const suggestApproachPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { conv, messages, notes, stage, icp } = await loadContext(context.supabase, data.conversationId, 40);
    const lead = (conv.leads ?? {}) as Record<string, unknown>;

    const tool = {
      type: "function",
      function: {
        name: "approach_plan",
        description: "Plano de abordagem do SDR com 3 opções de próximo passo, ordenadas por probabilidade de conversão.",
        parameters: {
          type: "object",
          properties: {
            diagnosis: {
              type: "string",
              description: "1-2 frases: onde o lead está no funil e qual o bloqueio/oportunidade principal agora.",
            },
            options: {
              type: "array",
              minItems: 3,
              maxItems: 3,
              items: {
                type: "object",
                properties: {
                  strategy: {
                    type: "string",
                    description: "Nome curto da tática (ex: 'CTA direto de agenda', 'Quebra-padrão por dor', 'Prova social do segmento', 'Reframe de objeção').",
                  },
                  rationale: {
                    type: "string",
                    description: "Por que essa tática é a melhor agora, em 1 frase, baseada em sinais concretos.",
                  },
                  message: {
                    type: "string",
                    description: "Mensagem PRONTA para enviar no WhatsApp (2-5 linhas, termina em pergunta ou CTA específico).",
                  },
                  expected_conversion: {
                    type: "string",
                    enum: ["alta", "média", "baixa"],
                  },
                },
                required: ["strategy", "rationale", "message", "expected_conversion"],
                additionalProperties: false,
              },
            },
          },
          required: ["diagnosis", "options"],
          additionalProperties: false,
        },
      },
    };

    const result = await callAI(
      [
        { role: "system", content: SYSTEM_BASE },
        {
          role: "user",
          content:
            `Monte um plano de abordagem com 3 opções de PRÓXIMO PASSO para este lead, ordenadas pela maior probabilidade de conversão. ` +
            `Cada opção deve usar uma tática DIFERENTE (não 3 variações da mesma). ` +
            `Considere o histórico, a etapa do funil, sinais de compra/objeção e o fit com o ICP.\n\n` +
            `${leadBrief(lead, stage, notes, icp)}\n\n` +
            `Conversa:\n${transcript(messages) || "(sem mensagens ainda — é primeira abordagem)"}`,
        },
      ],
      tool,
    );
    const call = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("IA não retornou plano estruturado");
    return JSON.parse(call.function.arguments) as {
      diagnosis: string;
      options: Array<{
        strategy: string;
        rationale: string;
        message: string;
        expected_conversion: "alta" | "média" | "baixa";
      }>;
    };
  });