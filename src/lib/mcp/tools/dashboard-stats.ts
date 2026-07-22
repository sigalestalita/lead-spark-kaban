import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "dashboard_stats",
  title: "Estatísticas do funil",
  description:
    "Resumo do funil COMPASS: total de leads, contagem por etapa e por prioridade em um período (dias).",
  inputSchema: {
    days: z.number().int().min(1).max(365).default(30).describe("Janela em dias (padrão 30)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const fromISO = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    const [{ data: leads, error }, { data: stages }] = await Promise.all([
      supabase
        .from("leads")
        .select("id, priority, stage_id, created_at")
        .gte("created_at", fromISO)
        .limit(10000),
      supabase.from("stages").select("id, name, slug").order("position"),
    ]);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const stageMap = new Map((stages ?? []).map((s) => [s.id, s]));
    const byStage: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    for (const l of leads ?? []) {
      const s = stageMap.get(l.stage_id ?? "");
      const slug = s?.slug ?? "sem_etapa";
      byStage[slug] = (byStage[slug] ?? 0) + 1;
      const p = l.priority ?? "pendente";
      byPriority[p] = (byPriority[p] ?? 0) + 1;
    }
    const payload = {
      periodDays: days,
      total: (leads ?? []).length,
      byStage,
      byPriority,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
