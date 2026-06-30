import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Lista templates. */
export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { templates: data ?? [] };
  });

/** Cria template. */
export const createTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(1).max(120),
        category: z.enum(["marketing", "utility", "authentication"]).default("utility"),
        language: z.string().default("pt_BR"),
        body: z.string().min(1).max(4096),
        variables: z.array(z.string()).default([]),
        provider_template_name: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("whatsapp_templates")
      .insert({
        name: data.name,
        category: data.category,
        language: data.language,
        body: data.body,
        variables: data.variables,
        provider_template_name: data.provider_template_name ?? null,
        status: "approved",
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { template: row };
  });

/** Atualiza template. */
export const updateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        category: z.enum(["marketing", "utility", "authentication"]).optional(),
        language: z.string().optional(),
        body: z.string().min(1).max(4096).optional(),
        variables: z.array(z.string()).optional(),
        status: z.enum(["draft", "pending", "approved", "rejected"]).optional(),
        provider_template_name: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase
      .from("whatsapp_templates")
      .update(rest)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Remove template. */
export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("whatsapp_templates")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Renderiza um template substituindo variáveis {{nome}}. */
export function renderTemplate(body: string, vars: Record<string, string | null | undefined>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}