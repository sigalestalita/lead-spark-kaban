import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
};

async function callAI(messages: ChatMsg[], tools: unknown[]) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY ausente");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: "auto" }),
  });
  if (res.status === 429) throw new Error("Rate limit atingido. Tente novamente em alguns segundos.");
  if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione mais créditos para continuar.");
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<{
    choices: Array<{
      message: {
        role: "assistant";
        content: string | null;
        tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
      };
      finish_reason: string;
    }>;
  }>;
}

const SYSTEM = `Você é um analista de dados sênior de vendas B2B integrado ao CRM da Grou.
Você ajuda SDRs e gestores a entender o perfil dos leads, performance de campanhas/anúncios, conversão no funil e gargalos.

Regras:
- SEMPRE use as ferramentas para obter dados reais antes de responder. Nunca invente números.
- Quando o usuário pedir números/insights, chame get_analytics e/ou query_leads.
- Use português direto, com bullets curtos e números destacados (use markdown).
- Quando útil, destaque hipóteses ("provavelmente...") separando do que é fato.
- Ao final, sugira 1–3 próximas perguntas que o usuário pode explorar.
- Datas: se o usuário não disser, use os últimos 30 dias.`;

// ---------------- Tool definitions ----------------
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_analytics",
      description:
        "Métricas agregadas de leads no período: totais, série diária, funil, perfil (segmento, porte, tipo, fonte), e performance por dimensão (campaign, ad_name, source, channel, form_name).",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Janela em dias (default 30)", default: 30 },
          dimension: {
            type: "string",
            enum: ["campaign", "ad_name", "source", "channel", "form_name"],
            description: "Dimensão para o ranking de performance",
            default: "campaign",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_leads",
      description:
        "Consulta leads com filtros e retorna contagem + amostra de até 25 leads. Use para perguntas específicas como 'quais leads quentes da campanha X' ou 'leads do segmento Y sem reunião'.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Filtra created_at nos últimos N dias" },
          stage_slug: { type: "string", description: "Filtra por slug do estágio (ex: 'reuniao', 'ganho')" },
          priority: { type: "string", enum: ["frio", "morno", "quente"] },
          lead_type: { type: "string" },
          source: { type: "string" },
          channel: { type: "string" },
          campaign: { type: "string" },
          ad_name: { type: "string" },
          segment_like: { type: "string", description: "ILIKE no company_segment" },
          has_meeting: { type: "boolean" },
          contacted: { type: "boolean", description: "true = first_approach_at não nulo" },
          min_score: { type: "number" },
          limit: { type: "number", default: 25 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_stages",
      description: "Lista os estágios do funil em ordem com slug, nome, posição e se é terminal.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_dimensions",
      description:
        "Para uma dimensão (campaign/ad_name/source/channel/form_name) retorna top 20 valores com leads, contatados, reuniões, ganhos, perdidos, win % e score médio.",
      parameters: {
        type: "object",
        properties: {
          dimension: {
            type: "string",
            enum: ["campaign", "ad_name", "source", "channel", "form_name"],
          },
          days: { type: "number", default: 30 },
        },
        required: ["dimension"],
      },
    },
  },
];

// ---------------- Tool executors ----------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function execTool(supabase: any, name: string, args: Record<string, unknown>) {
  if (name === "list_stages") {
    const { data } = await supabase
      .from("stages")
      .select("id,slug,name,position,is_terminal")
      .order("position");
    return { stages: data ?? [] };
  }

  if (name === "get_analytics" || name === "compare_dimensions") {
    const days = (args.days as number | undefined) ?? 30;
    const dimension = (args.dimension as string | undefined) ?? "campaign";
    const from = new Date(Date.now() - days * 86400000).toISOString();

    const { data: stagesData } = await supabase
      .from("stages")
      .select("id,name,slug,is_terminal,position")
      .order("position");
    const stages = stagesData ?? [];
    const stageMap = new Map<string, { name: string; slug: string; is_terminal: boolean }>(
      stages.map((s: { id: string; name: string; slug: string; is_terminal: boolean }) => [s.id, s]),
    );

    const { data: leads } = await supabase
      .from("leads")
      .select(
        "created_at,source,channel,campaign,ad_name,form_name,stage_id,priority,score,lead_type,company_segment,company_size,meeting_at,first_approach_at,lost_reason",
      )
      .gte("created_at", from)
      .limit(20000);
    const L = leads ?? [];
    const isWon = (sid: string | null) => {
      const s = sid ? stageMap.get(sid) : null;
      return !!s?.is_terminal && /ganho|cliente|fechad|won|venda/i.test(s.name + " " + (s.slug || ""));
    };
    const isLost = (sid: string | null) => {
      const s = sid ? stageMap.get(sid) : null;
      return !!s?.is_terminal && /perd|lost|descart/i.test(s.name + " " + (s.slug || ""));
    };

    const totals = {
      leads: L.length,
      contacted: L.filter((l: { first_approach_at: string | null }) => l.first_approach_at).length,
      meetings: L.filter((l: { meeting_at: string | null }) => l.meeting_at).length,
      hot: L.filter((l: { priority: string }) => l.priority === "quente").length,
      won: L.filter((l: { stage_id: string | null }) => isWon(l.stage_id)).length,
      lost: L.filter((l: { stage_id: string | null }) => isLost(l.stage_id)).length,
    };

    const bucket = (get: (l: Record<string, unknown>) => unknown, top = 8) => {
      const m = new Map<string, number>();
      for (const l of L) {
        const k = ((get(l) as string) || "—").toString().trim() || "—";
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return Array.from(m.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, top);
    };

    type Row = {
      key: string;
      total: number;
      contacted: number;
      meeting: number;
      won: number;
      lost: number;
      hot: number;
      score: number;
    };
    const dm = new Map<string, Row>();
    for (const l of L) {
      const k = (((l as Record<string, unknown>)[dimension] as string) || "—").toString().trim() || "—";
      const r = dm.get(k) ?? { key: k, total: 0, contacted: 0, meeting: 0, won: 0, lost: 0, hot: 0, score: 0 };
      r.total += 1;
      if ((l as { first_approach_at: string | null }).first_approach_at) r.contacted += 1;
      if ((l as { meeting_at: string | null }).meeting_at) r.meeting += 1;
      if (isWon((l as { stage_id: string | null }).stage_id)) r.won += 1;
      if (isLost((l as { stage_id: string | null }).stage_id)) r.lost += 1;
      if ((l as { priority: string }).priority === "quente") r.hot += 1;
      r.score += (l as { score: number }).score ?? 0;
      dm.set(k, r);
    }
    const byDimension = Array.from(dm.values())
      .map((r) => ({
        ...r,
        avg_score: r.total ? Math.round(r.score / r.total) : 0,
        win_pct: r.total ? Math.round((r.won / r.total) * 100) : 0,
        meeting_pct: r.total ? Math.round((r.meeting / r.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    if (name === "compare_dimensions") {
      return { dimension, days, byDimension };
    }

    const funnel = stages.map((s: { id: string; name: string; position: number; is_terminal: boolean }) => ({
      name: s.name,
      position: s.position,
      is_terminal: s.is_terminal,
      count: L.filter((l: { stage_id: string | null }) => l.stage_id === s.id).length,
    }));

    return {
      period_days: days,
      dimension,
      totals,
      funnel,
      profile: {
        lead_type: bucket((l) => l.lead_type),
        priority: bucket((l) => l.priority),
        segment: bucket((l) => l.company_segment),
        size: bucket((l) => l.company_size),
        source: bucket((l) => l.source),
        channel: bucket((l) => l.channel),
      },
      byDimension: byDimension.slice(0, 12),
    };
  }

  if (name === "query_leads") {
    const limit = Math.min((args.limit as number) ?? 25, 50);
    let q = supabase
      .from("leads")
      .select(
        "id,name,company_name,position,priority,score,lead_type,source,channel,campaign,ad_name,company_segment,stage_id,meeting_at,first_approach_at,created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (args.days) q = q.gte("created_at", new Date(Date.now() - (args.days as number) * 86400000).toISOString());
    if (args.priority) q = q.eq("priority", args.priority);
    if (args.lead_type) q = q.eq("lead_type", args.lead_type);
    if (args.source) q = q.eq("source", args.source);
    if (args.channel) q = q.eq("channel", args.channel);
    if (args.campaign) q = q.eq("campaign", args.campaign);
    if (args.ad_name) q = q.eq("ad_name", args.ad_name);
    if (args.segment_like) q = q.ilike("company_segment", `%${args.segment_like}%`);
    if (args.has_meeting === true) q = q.not("meeting_at", "is", null);
    if (args.has_meeting === false) q = q.is("meeting_at", null);
    if (args.contacted === true) q = q.not("first_approach_at", "is", null);
    if (args.contacted === false) q = q.is("first_approach_at", null);
    if (typeof args.min_score === "number") q = q.gte("score", args.min_score);

    if (args.stage_slug) {
      const { data: st } = await supabase.from("stages").select("id").eq("slug", args.stage_slug).maybeSingle();
      if (st?.id) q = q.eq("stage_id", st.id);
    }

    const { data, count, error } = await q;
    if (error) return { error: error.message };
    return { count: count ?? data?.length ?? 0, sample: data ?? [] };
  }

  return { error: `Ferramenta desconhecida: ${name}` };
}

// ---------------- Server functions ----------------

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("analytics_chat_threads")
      .select("id,title,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("analytics_chat_threads")
      .insert({ user_id: context.userId, title: "Nova conversa" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id as string };
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("analytics_chat_threads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: thread, error } = await context.supabase
      .from("analytics_chat_threads")
      .select("id,title,created_at,updated_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!thread) throw new Error("Thread não encontrada");
    const { data: msgs } = await context.supabase
      .from("analytics_chat_messages")
      .select("id,role,content,tool_calls,tool_results,created_at")
      .eq("thread_id", data.id)
      .order("created_at");
    return { thread, messages: msgs ?? [] };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ threadId: z.string().uuid(), content: z.string().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verifica thread
    const { data: thread } = await supabase
      .from("analytics_chat_threads")
      .select("id,title")
      .eq("id", data.threadId)
      .maybeSingle();
    if (!thread) throw new Error("Thread não encontrada");

    // Persiste mensagem do usuário
    await supabase.from("analytics_chat_messages").insert({
      thread_id: data.threadId,
      user_id: userId,
      role: "user",
      content: data.content,
    });

    // Carrega histórico (últimas 30)
    const { data: history } = await supabase
      .from("analytics_chat_messages")
      .select("role,content,tool_calls,tool_results")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: false })
      .limit(30);
    const ordered = (history ?? []).slice().reverse();

    const messages: ChatMsg[] = [{ role: "system", content: SYSTEM }];
    for (const m of ordered) {
      if (m.role === "assistant" && m.tool_calls) {
        messages.push({ role: "assistant", content: m.content || null, tool_calls: m.tool_calls });
        const results = (m.tool_results as Array<{ id: string; name: string; result: unknown }>) ?? [];
        for (const r of results) {
          messages.push({
            role: "tool",
            tool_call_id: r.id,
            name: r.name,
            content: JSON.stringify(r.result).slice(0, 12000),
          });
        }
      } else if (m.role === "user" || m.role === "assistant") {
        messages.push({ role: m.role, content: m.content });
      }
    }

    // Loop agente
    let finalContent = "";
    let pendingToolCalls: ChatMsg["tool_calls"] | undefined;
    let pendingToolResults: Array<{ id: string; name: string; result: unknown }> = [];

    for (let step = 0; step < 6; step++) {
      const res = await callAI(messages, TOOLS);
      const msg = res.choices[0]?.message;
      if (!msg) throw new Error("Resposta vazia da IA");

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
        if (!pendingToolCalls) pendingToolCalls = [];
        pendingToolCalls.push(...msg.tool_calls);
        for (const tc of msg.tool_calls) {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(tc.function.arguments || "{}");
          } catch {
            /* noop */
          }
          let result: unknown;
          try {
            result = await execTool(supabase, tc.function.name, parsed);
          } catch (e) {
            result = { error: e instanceof Error ? e.message : String(e) };
          }
          pendingToolResults.push({ id: tc.id, name: tc.function.name, result });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            name: tc.function.name,
            content: JSON.stringify(result).slice(0, 12000),
          });
        }
        continue;
      }

      finalContent = msg.content ?? "";
      break;
    }

    // Persiste resposta do assistente (com tool_calls + resultados, se houver)
    const { data: inserted } = await supabase
      .from("analytics_chat_messages")
      .insert({
        thread_id: data.threadId,
        user_id: userId,
        role: "assistant",
        content: finalContent || "(sem resposta)",
        tool_calls: pendingToolCalls ?? null,
        tool_results: pendingToolResults.length ? pendingToolResults : null,
      })
      .select("id")
      .single();

    // Atualiza updated_at e título se ainda for default
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (thread.title === "Nova conversa") {
      patch.title = data.content.slice(0, 60);
    }
    await supabase.from("analytics_chat_threads").update(patch).eq("id", data.threadId);

    return { id: inserted?.id, content: finalContent };
  });

export const renameThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), title: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("analytics_chat_threads")
      .update({ title: data.title })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });