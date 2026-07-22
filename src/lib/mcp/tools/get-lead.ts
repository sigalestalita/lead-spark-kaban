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
  name: "get_lead",
  title: "Detalhes do lead",
  description: "Retorna os detalhes completos de um lead do COMPASS por ID, incluindo etapa e interações recentes.",
  inputSchema: {
    id: z.string().uuid().describe("ID do lead."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const [{ data: lead, error }, { data: interactions }] = await Promise.all([
      supabase
        .from("leads")
        .select("*, stages(name, slug)")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("lead_interactions")
        .select("type, content, created_at, author_id")
        .eq("lead_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!lead) return { content: [{ type: "text", text: "Lead não encontrado." }], isError: true };
    const payload = { lead, interactions: interactions ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
