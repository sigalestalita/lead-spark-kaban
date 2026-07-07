import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GROU_PLAYBOOK } from "./grou-playbook";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const AI_CONFIG_KEY = "whatsapp_ai_agent";

type AiAgentSettings = {
  enabled: boolean;
  autoReplyEnabled: boolean;
  initialOutreachEnabled: boolean;
  handoffStageIds: string[];
  stopOnLeadReply: boolean;
  responseMaxPerConversation: number;
  initialTemplateId: string | null;
  knowledgeBase: string;
  qualificationObjective: string;
  toneGuide: string;
  prohibitedClaims: string;
  firstMessagePrompt: string;
  replyPrompt: string;
  handoffPrompt: string;
};

const AiAgentSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  autoReplyEnabled: z.boolean().default(false),
  initialOutreachEnabled: z.boolean().default(false),
  handoffStageIds: z.array(z.string().uuid()).default([]),
  stopOnLeadReply: z.boolean().default(true),
  responseMaxPerConversation: z.number().int().min(1).max(50).default(12),
  initialTemplateId: z.string().uuid().nullable().default(null),
  knowledgeBase: z.string().max(20000).default(""),
  qualificationObjective: z.string().max(2000).default("Fazer o primeiro atendimento, descobrir rapidamente o motivo da conversão, qualificar nos filtros comerciais da Grou e conduzir para conversa comercial com handoff humano no momento certo."),
  toneGuide: z.string().max(2000).default("Tom de SDR sênior: consultivo, humano, seguro, curto e direto no WhatsApp. Mensagens objetivas, naturais e sem cara de robô."),
  prohibitedClaims: z.string().max(2000).default("Não inventar dados do lead, campanha, criativo, preço, ROI, prazo, integração, case ou funcionalidade. Não escrever mensagens longas. Não insistir quando o lead pedir humano."),
  firstMessagePrompt: z.string().max(5000).default("Na primeira interação útil, descubra o motivo da conversão e conecte a abordagem ao contexto da origem, campanha, formulário ou criativo quando esses dados existirem. Priorize perguntas curtas para entender dor, momento e interesse. Deixe claro que, se preferir, o lead pode falar com um especialista humano desde já."),
  replyPrompt: z.string().max(5000).default("Responda a última mensagem do lead de forma curta e consultiva. Priorize: 1) entender o motivo da conversão e a dor principal, 2) qualificar perfil, contexto e timing, 3) avançar para atendimento comercial. Se o lead pedir humano, reconheça isso e conduza imediatamente para handoff."),
  handoffPrompt: z.string().max(2000).default("Faça handoff para humano imediatamente quando o lead pedir falar com uma pessoa, demonstrar intenção comercial clara, pedir proposta/demonstração/agendamento, trouxer negociação sensível ou quando a conversa estiver madura para um SDR assumir e marcar agenda."),
});

const UpdateAiAgentSettingsSchema = AiAgentSettingsSchema.partial();

async function readAiAgentSettings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<AiAgentSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", AI_CONFIG_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return AiAgentSettingsSchema.parse(data?.value ?? {});
}

async function writeAiAgentSettings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  settings: AiAgentSettings,
) {
  const payload = { key: AI_CONFIG_KEY, value: settings, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("app_settings").upsert(payload);
  if (error) throw new Error(error.message);
}

function buildAgentSystemPrompt(settings: AiAgentSettings) {
  return [
    SYSTEM_BASE,
    "Você está operando como a IA de atendimento ativo da Lidi no WhatsApp.",
    `Objetivo principal: ${settings.qualificationObjective}`,
    `Guia de tom: ${settings.toneGuide}`,
    `Restrições obrigatórias: ${settings.prohibitedClaims}`,
    `Regras de handoff: ${settings.handoffPrompt}`,
    "Base de conhecimento comercial da operação:",
    GROU_PLAYBOOK,
    settings.knowledgeBase?.trim() ? `Conhecimento adicional configurado pelo time:\n${settings.knowledgeBase.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function campaignBrief(lead: Record<string, unknown>) {
  const campaignData = {
    origem: lead?.source,
    canal: lead?.channel,
    campanha: lead?.campaign,
    anuncio: lead?.ad_name,
    formulario: lead?.form_name,
  };
  if (!Object.values(campaignData).some(Boolean)) return "";
  return `Origem de aquisição/campanha (usar apenas se existir no CRM, sem inventar): ${JSON.stringify(campaignData)}`;
}

function countAgentReplies(messages: Array<{ sender_type: string }>) {
  return messages.filter((m) => ["bot", "automation"].includes(m.sender_type)).length;
}

function lastInboundLeadMessage(messages: Array<{ sender_type: string; body: string | null }>) {
  return [...messages].reverse().find((m) => m.sender_type === "lead" && (m.body?.trim() ?? ""));
}

export async function generateAutoReplyInternal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  conversationId: string,
  instruction?: string,
) {
  const settings = await readAiAgentSettings(supabase);
  if (!settings.enabled || !settings.autoReplyEnabled) {
    throw new Error("IA automática de atendimento está desativada");
  }
  const { conv, messages, notes, stage, icp } = await loadContext(supabase, conversationId, 40);
  const lead = (conv.leads ?? {}) as Record<string, unknown>;
  const currentStageId = (conv.leads as { stage_id?: string | null } | null)?.stage_id ?? null;
  if (currentStageId && settings.handoffStageIds.includes(currentStageId)) {
    throw new Error("Conversa já está em etapa de handoff humano");
  }
  if (countAgentReplies(messages) >= settings.responseMaxPerConversation) {
    throw new Error("Limite de respostas automáticas atingido nesta conversa");
  }
  const lastLead = lastInboundLeadMessage(messages);
  if (!lastLead) throw new Error("Nenhuma mensagem recente do lead para responder");
  const result = await callAI([
    { role: "system", content: buildAgentSystemPrompt(settings) },
    {
      role: "user",
      content:
        `${settings.replyPrompt}\n\n` +
        (instruction ? `Instrução complementar: ${instruction}\n\n` : "") +
        `${leadBrief(lead, stage, notes, icp)}\n\n` +
        `Conversa:\n${transcript(messages)}\n\n` +
        `Última mensagem do lead: ${lastLead.body}\n\n` +
        `Responda APENAS com a mensagem de WhatsApp pronta, curta, natural, em português brasileiro, sem aspas.`,
    },
  ]);
  const reply = result.choices?.[0]?.message?.content?.trim() ?? "";
  if (!reply) throw new Error("IA não retornou resposta");
  return { reply };
}

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
      "*, leads(id,name,company_name,position,company_segment,company_size,company_website,stage_id,priority,score,demo_free,lead_type,assigned_to,phone,email,linkedin_url,source,channel,campaign,ad_name,form_name,probable_pain,company_description,company_summary)",
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
      origem: lead?.source,
      canal: lead?.channel,
      campanha: lead?.campaign,
      anuncio: lead?.ad_name,
      formulario: lead?.form_name,
      dor_sugerida: lead?.probable_pain,
      etapa_funil: stage?.name,
    })}`,
  );
  const campaign = campaignBrief(lead);
  if (campaign) lines.push(campaign);
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
  "Você é um SDR sênior B2B brasileiro, especialista em primeiro atendimento, prospecção consultiva e qualificação via WhatsApp.",
  "Domina e aplica naturalmente: SPIN Selling (Situação, Problema, Implicação, Necessidade-Solução), MEDDIC (Métricas, Decisor, Critério, Processo, Dor, Champion), Challenger Sale e tratamento de objeções (acolher → reformular → prova → reabrir).",
  "Objetivo PRIMÁRIO: fazer um primeiro atendimento excelente, descobrir a razão da conversão, qualificar rápido e levar o lead para atendimento comercial com o SDR humano no timing certo.",
  "Princípios:",
  "1) Foco em DOR e IMPACTO mensurável (receita, custo, tempo, risco) — nunca em features soltas.",
  "2) Personalize por cargo, segmento, tamanho, origem da campanha, formulário e sinais observados. Não invente fatos, criativos ou contexto ausente.",
  "3) Mensagens curtas (2-4 linhas, idealmente bem objetivas, máx. 600 caracteres), 1 ideia por mensagem, sempre terminando em UMA pergunta aberta OU CTA específico.",
  "4) Tom humano, direto, consultivo. Sem 'tudo bem?', sem 'espero que esteja bem', sem jargão, sem CAIXA ALTA, sem promessas irreais. Português do Brasil.",
  "5) Sem emojis a menos que o lead use primeiro.",
  "6) Objeções: acolha, reformule a dor, traga prova social/dado curto, reabra com pergunta. Nunca rebata de frente.",
  "7) No primeiro atendimento, priorize descobrir por que o lead converteu e qual problema ele quer resolver agora, principalmente quando vier de Meta Ads.",
  "8) O lead pode escolher falar com um humano logo no começo. Se ele pedir isso, reconheça imediatamente e conduza o handoff sem insistir em continuar qualificando.",
  "9) O foco não é fechar pelo WhatsApp: é gerar confiança, qualificar bem e criar vontade de avançar para conversa comercial/demo com um especialista da Grou.",
  "10) Respeite estágio do funil e histórico. Após muitos follow-ups sem resposta, sugira encerrar com elegância.",
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

export const getAiAgentSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const settings = await readAiAgentSettings(context.supabase);
    return { settings };
  });

export const updateAiAgentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateAiAgentSettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!isMgr) throw new Error("Apenas gestão/admin podem editar a IA de atendimento");
    const current = await readAiAgentSettings(context.supabase);
    const next = AiAgentSettingsSchema.parse({ ...current, ...data });
    await writeAiAgentSettings(context.supabase, next);
    return { ok: true, settings: next };
  });

export const generateInitialOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const settings = await readAiAgentSettings(context.supabase);
    if (!settings.enabled) throw new Error("IA de atendimento desativada");
    const { conv, messages, notes, stage, icp } = await loadContext(context.supabase, data.conversationId, 10);
    const lead = (conv.leads ?? {}) as Record<string, unknown>;
    const result = await callAI([
      { role: "system", content: buildAgentSystemPrompt(settings) },
      {
        role: "user",
        content:
          `${settings.firstMessagePrompt}\n\n` +
          `${leadBrief(lead, stage, notes, icp)}\n\n` +
          (messages.length ? `Mensagens já existentes:\n${transcript(messages)}\n\n` : "") +
          `Considere origem/campanha/formulário/payload quando existir. Responda APENAS com a primeira mensagem pronta para WhatsApp, sem aspas.`,
      },
    ]);
    const reply = result.choices?.[0]?.message?.content?.trim() ?? "";
    if (!reply) throw new Error("IA não retornou mensagem inicial");
    return { reply };
  });

export const autoReplyToConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversationId: z.string().uuid(), instruction: z.string().max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    return generateAutoReplyInternal(context.supabase, data.conversationId, data.instruction);
  });

export const triggerManualAiTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      phone: z.string().min(8).max(30),
      name: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const settings = await readAiAgentSettings(context.supabase);
    if (!settings.enabled) throw new Error("IA de atendimento desativada");
    if (!settings.initialOutreachEnabled) throw new Error("Disparo inicial proativo está desativado");

    const phone = data.phone.replace(/\D+/g, "").replace(/^0+/, "");
    const normalizedPhone = (phone.length === 10 || phone.length === 11) && !phone.startsWith("55") ? `55${phone}` : phone;

    let contactId: string | null = null;
    let leadId: string | null = null;

    const { data: existingContact, error: contactErr } = await context.supabase
      .from("whatsapp_contacts")
      .select("id, lead_id")
      .eq("phone", normalizedPhone)
      .maybeSingle();
    if (contactErr) throw new Error(contactErr.message);

    if (existingContact) {
      contactId = existingContact.id;
      leadId = existingContact.lead_id ?? null;
    }

    if (!leadId) {
      const { data: existingLead, error: leadLookupErr } = await context.supabase
        .from("leads")
        .select("id")
        .filter("phone", "ilike", `%${normalizedPhone.slice(-8)}%`)
        .limit(1)
        .maybeSingle();
      if (leadLookupErr) throw new Error(leadLookupErr.message);
      if (existingLead) leadId = existingLead.id;
    }

    if (!leadId) {
      const { data: stage } = await context.supabase
        .from("stages")
        .select("id")
        .eq("slug", "novo")
        .maybeSingle();

      const { data: createdLead, error: leadCreateErr } = await context.supabase
        .from("leads")
        .insert({
          name: data.name?.trim() || `Teste WhatsApp ${normalizedPhone.slice(-4)}`,
          phone: normalizedPhone,
          source: "whatsapp_ai_test",
          channel: "whatsapp",
          assigned_to: context.userId,
          stage_id: stage?.id ?? null,
        })
        .select("id")
        .single();
      if (leadCreateErr) throw new Error(leadCreateErr.message);
      leadId = createdLead.id;
    }

    if (!contactId) {
      const { data: createdContact, error: contactCreateErr } = await context.supabase
        .from("whatsapp_contacts")
        .upsert({
          phone: normalizedPhone,
          lead_id: leadId,
          name: data.name?.trim() || null,
        }, { onConflict: "phone" })
        .select("id")
        .single();
      if (contactCreateErr) throw new Error(contactCreateErr.message);
      contactId = createdContact.id;
    } else if (leadId) {
      await context.supabase.from("whatsapp_contacts").update({ lead_id: leadId }).eq("id", contactId);
    }

    const { data: existingConversation, error: existingConvErr } = await context.supabase
      .from("whatsapp_conversations")
      .select("id")
      .eq("lead_id", leadId)
      .maybeSingle();
    if (existingConvErr) throw new Error(existingConvErr.message);

    let conversationId = existingConversation?.id ?? null;
    if (!conversationId) {
      const { data: account } = await context.supabase
        .from("whatsapp_accounts")
        .select("id")
        .eq("is_default", true)
        .maybeSingle();

      const { data: createdConversation, error: convCreateErr } = await context.supabase
        .from("whatsapp_conversations")
        .insert({
          lead_id: leadId,
          contact_id: contactId,
          account_id: account?.id ?? null,
          assigned_user_id: context.userId,
          status: "open",
        })
        .select("id")
        .single();
      if (convCreateErr) throw new Error(convCreateErr.message);
      conversationId = createdConversation.id;
    }
    if (!conversationId) throw new Error("Não foi possível preparar a conversa de teste");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getProvider } = await import("./whatsapp/provider-registry.server");

    const { data: conv, error: convErr } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("id, lead_id, account_id, leads:lead_id(id,name,company_name,phone)")
      .eq("id", conversationId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv) throw new Error("Conversa de teste não encontrada");

    const lead = conv.leads as { id: string; name: string | null; company_name: string | null; phone: string | null } | null;
    if (!lead?.phone) throw new Error("Lead de teste sem telefone");
    if (!settings.initialTemplateId) throw new Error("Nenhum template HSM inicial configurado");

    const { data: tmpl } = await supabaseAdmin
      .from("whatsapp_templates")
      .select("provider_template_name, language, variables")
      .eq("id", settings.initialTemplateId)
      .maybeSingle();
    if (!tmpl?.provider_template_name) throw new Error("Template HSM inicial inválido");

    const accountQuery = conv.account_id
      ? supabaseAdmin.from("whatsapp_accounts").select("*").eq("id", conv.account_id).maybeSingle()
      : supabaseAdmin.from("whatsapp_accounts").select("*").eq("is_default", true).maybeSingle();
    const { data: account } = await accountQuery;
    if (!account) throw new Error("Nenhuma conta de WhatsApp configurada");

    const varNames = Array.isArray(tmpl.variables) ? (tmpl.variables as unknown[]).map(String) : [];
    const map: Record<string, string> = {
      nome: lead.name ?? "",
      primeiro_nome: (lead.name ?? "").split(" ")[0] ?? "",
      empresa: lead.company_name ?? "",
    };
    const templateParams = varNames.map((name) => map[name] ?? " ");

    const { data: msg, error: msgErr } = await supabaseAdmin
      .from("whatsapp_messages")
      .insert({
        conversation_id: conv.id,
        lead_id: conv.lead_id,
        sender_type: "bot",
        message_type: "template",
        body: null,
        metadata: {
          source: "manual_ai_test",
          template_id: settings.initialTemplateId,
          template_name: tmpl.provider_template_name,
          phone: data.phone,
        },
        status: "sending",
      })
      .select("id")
      .single();
    if (msgErr) throw new Error(msgErr.message);

    try {
      const provider = getProvider(account.provider);
      const result = await provider.sendMessage({
        account: {
          id: account.id,
          phone_number: account.phone_number,
          provider: account.provider,
          provider_instance_id: account.provider_instance_id,
          provider_base_url: account.provider_base_url,
          access_token: account.access_token,
          webhook_secret: account.webhook_secret,
        },
        to: String(lead.phone).replace(/\D+/g, ""),
        type: "template",
        templateName: tmpl.provider_template_name,
        templateLanguage: tmpl.language ?? "pt_BR",
        templateParams,
      });

      await supabaseAdmin
        .from("whatsapp_messages")
        .update({
          provider_message_id: result.providerMessageId,
          status: result.status === "failed" ? "failed" : "sent",
          error: result.error ?? null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", msg.id);

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_preview: `[HSM teste] ${tmpl.provider_template_name}`,
          status: "open",
        })
        .eq("id", conv.id);

      if (result.status === "failed") {
        throw new Error(result.error ?? "Falha ao enviar template de teste");
      }

      return { ok: true, conversationId: conv.id, providerMessageId: result.providerMessageId };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha no teste manual";
      await supabaseAdmin.from("whatsapp_messages").update({ status: "failed", error: message }).eq("id", msg.id);
      throw new Error(message);
    }
  });