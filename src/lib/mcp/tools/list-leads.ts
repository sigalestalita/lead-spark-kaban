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
  name: "list_leads",
  title: "Listar leads",
  description:
    "Lista os leads do CRM COMPASS visíveis para o usuário autenticado, ordenados por criação (mais recentes primeiro).",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Quantidade máxima de leads a retornar (1-100)."),
    stageSlug: z
      .string()
      .optional()
      .describe("Filtrar por slug de etapa (ex.: 'novo', 'em_contato', 'qualificacao', 'agendado')."),
    search: z.string().optional().describe("Busca por nome, email ou empresa."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, stageSlug, search }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("leads")
      .select(
        "id, name, email, phone, company, lead_type, source, campaign, priority, score, created_at, stage_id, stages(name, slug)"
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = (data ?? []).filter((l) => {
      if (!stageSlug) return true;
      const s = (l as { stages?: { slug?: string } | null }).stages;
      return s?.slug === stageSlug;
    });
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { leads: rows, count: rows.length },
    };
  },
});
