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
        header_text: z.string().max(60).nullable().optional(),
        footer_text: z.string().max(60).nullable().optional(),
        buttons: z
          .array(
            z.discriminatedUnion("type", [
              z.object({ type: z.literal("QUICK_REPLY"), text: z.string().min(1).max(25) }),
              z.object({ type: z.literal("URL"), text: z.string().min(1).max(25), url: z.string().url() }),
              z.object({ type: z.literal("PHONE_NUMBER"), text: z.string().min(1).max(25), phone_number: z.string().min(5) }),
            ]),
          )
          .max(10)
          .default([]),
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
        header_text: data.header_text ?? null,
        header_type: data.header_text ? "TEXT" : null,
        footer_text: data.footer_text ?? null,
        buttons: data.buttons,
        status: "draft",
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
        status: z.enum(["draft", "pending", "approved", "rejected", "paused", "disabled"]).optional(),
        provider_template_name: z.string().nullable().optional(),
        header_text: z.string().max(60).nullable().optional(),
        footer_text: z.string().max(60).nullable().optional(),
        buttons: z.array(z.any()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, header_text, ...rest } = data;
    const headerPatch =
      header_text !== undefined
        ? { header_text, header_type: header_text ? "TEXT" : null }
        : {};
    const { error } = await context.supabase
      .from("whatsapp_templates")
      .update({ ...rest, ...headerPatch })
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

/**
 * Envia o template à Meta para aprovação (cria via Graph API).
 * Usa a conta `meta_cloud` padrão (is_default) ou a primeira disponível.
 */
export const submitTemplateToMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tpl, error: tplErr } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("id", data.id)
      .single();
    if (tplErr || !tpl) throw new Error(tplErr?.message ?? "Template não encontrado");

    const { data: accounts, error: accErr } = await supabase
      .from("whatsapp_accounts")
      .select("id,label,access_token,provider_base_url,metadata,is_default")
      .eq("provider", "meta_cloud")
      .eq("status", "active")
      .order("is_default", { ascending: false })
      .limit(1);
    if (accErr) throw new Error(accErr.message);
    const account = accounts?.[0];
    if (!account) throw new Error("Nenhuma conta Meta Cloud ativa configurada");

    const { submitMetaTemplate } = await import("@/lib/whatsapp/meta-templates.server");
    const variables = Array.isArray(tpl.variables) ? (tpl.variables as string[]) : [];
    // Meta exige BODY com {{1}},{{2}},… numéricos sequenciais. Converte {{nome}} → {{1}} etc.
    let bodyForMeta = tpl.body as string;
    variables.forEach((v, i) => {
      const re = new RegExp(`\\{\\{\\s*${v.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*\\}\\}`, "g");
      bodyForMeta = bodyForMeta.replace(re, `{{${i + 1}}}`);
    });
    const bodyExamples = variables.map((v) => {
      switch (v) {
        case "primeiro_nome": return "Maria";
        case "nome": return "Maria Silva";
        case "empresa": return "Acme";
        default: return v;
      }
    });

    const providerName = (tpl.provider_template_name as string | null) || (tpl.name as string)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);

    const result = await submitMetaTemplate(
      {
        access_token: account.access_token as string,
        provider_base_url: account.provider_base_url as string | null,
        metadata: (account.metadata as Record<string, unknown>) ?? null,
      },
      {
        name: providerName,
        language: (tpl.language as string) || "pt_BR",
        category: ((tpl.category as string) || "utility").toUpperCase() as "MARKETING" | "UTILITY" | "AUTHENTICATION",
        body: bodyForMeta,
        bodyExamples,
        headerText: (tpl.header_text as string | null) ?? null,
        footerText: (tpl.footer_text as string | null) ?? null,
        buttons: Array.isArray(tpl.buttons) ? (tpl.buttons as never) : [],
      },
    );

    const statusMap: Record<string, string> = {
      APPROVED: "approved",
      PENDING: "pending",
      REJECTED: "rejected",
      PAUSED: "paused",
      DISABLED: "disabled",
    };

    const { error: upErr } = await supabase
      .from("whatsapp_templates")
      .update({
        provider_template_name: providerName,
        meta_template_id: result.id || null,
        status: statusMap[result.status] ?? "pending",
        meta_last_synced_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, providerName, status: result.status, id: result.id };
  });

/**
 * Sincroniza status (APPROVED/PENDING/REJECTED) dos templates locais
 * com a Meta, casando por provider_template_name + language.
 */
export const syncTemplatesFromMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: accounts, error: accErr } = await supabase
      .from("whatsapp_accounts")
      .select("access_token,provider_base_url,metadata,is_default")
      .eq("provider", "meta_cloud")
      .eq("status", "active")
      .order("is_default", { ascending: false })
      .limit(1);
    if (accErr) throw new Error(accErr.message);
    const account = accounts?.[0];
    if (!account) throw new Error("Nenhuma conta Meta Cloud ativa configurada");

    const { listMetaTemplates } = await import("@/lib/whatsapp/meta-templates.server");
    const remote = await listMetaTemplates({
      access_token: account.access_token as string,
      provider_base_url: account.provider_base_url as string | null,
      metadata: (account.metadata as Record<string, unknown>) ?? null,
    });

    const statusMap: Record<string, string> = {
      APPROVED: "approved",
      PENDING: "pending",
      REJECTED: "rejected",
      PAUSED: "paused",
      DISABLED: "disabled",
    };

    const { data: local } = await supabase
      .from("whatsapp_templates")
      .select("id,provider_template_name,language");

    let updated = 0;
    let imported = 0;
    const localKeys = new Set(
      (local ?? [])
        .filter((t) => t.provider_template_name)
        .map((t) => `${t.provider_template_name}::${t.language ?? ""}`),
    );
    for (const tpl of local ?? []) {
      if (!tpl.provider_template_name) continue;
      const match = remote.find(
        (r) => r.name === tpl.provider_template_name && (r.language === tpl.language || !tpl.language),
      );
      if (!match) continue;
      await supabase
        .from("whatsapp_templates")
        .update({
          status: statusMap[match.status] ?? "pending",
          meta_template_id: match.id,
          rejection_reason: match.rejected_reason ?? null,
          meta_last_synced_at: new Date().toISOString(),
        })
        .eq("id", tpl.id);
      updated += 1;
    }

    // Importa templates que existem só na Meta (criados direto no gerenciador).
    const { fetchMetaTemplateDetails } = await import("@/lib/whatsapp/meta-templates.server");
    const accountForDetails = {
      access_token: account.access_token as string,
      provider_base_url: account.provider_base_url as string | null,
      metadata: (account.metadata as Record<string, unknown>) ?? null,
    };
    for (const r of remote) {
      const key = `${r.name}::${r.language ?? ""}`;
      if (localKeys.has(key)) continue;
      let body = "";
      let header: string | null = null;
      let footer: string | null = null;
      let buttons: unknown[] = [];
      let varCount = 0;
      try {
        const det = await fetchMetaTemplateDetails(accountForDetails, r.id);
        for (const c of det.components ?? []) {
          const type = String(c.type ?? "").toUpperCase();
          if (type === "BODY") {
            body = String(c.text ?? "");
            const matches = body.match(/\{\{\s*\d+\s*\}\}/g);
            varCount = matches ? matches.length : 0;
          } else if (type === "HEADER" && String(c.format ?? "").toUpperCase() === "TEXT") {
            header = String(c.text ?? "") || null;
          } else if (type === "FOOTER") {
            footer = String(c.text ?? "") || null;
          } else if (type === "BUTTONS" && Array.isArray(c.buttons)) {
            buttons = c.buttons as unknown[];
          }
        }
      } catch {
        body = `[importado da Meta: ${r.name}]`;
      }
      const variables = Array.from({ length: varCount }, (_, i) => `var${i + 1}`);
      const { error: insErr } = await supabase.from("whatsapp_templates").insert({
        name: r.name,
        category: (r.category ?? "utility").toLowerCase(),
        language: r.language,
        body: body || " ",
        variables,
        provider_template_name: r.name,
        meta_template_id: r.id,
        status: statusMap[r.status] ?? "pending",
        rejection_reason: r.rejected_reason ?? null,
        header_text: header,
        header_type: header ? "TEXT" : null,
        footer_text: footer,
        buttons: buttons as never,
        meta_last_synced_at: new Date().toISOString(),
      });
      if (!insErr) imported += 1;
    }

    return { ok: true, updated, imported, remoteCount: remote.length };
  });