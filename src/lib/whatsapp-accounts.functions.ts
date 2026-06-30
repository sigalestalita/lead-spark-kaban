import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

const REDACT = "••••••";

function redact<T extends { access_token?: string | null; webhook_secret?: string | null; metadata?: unknown }>(row: T) {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    ...row,
    access_token: row.access_token ? REDACT : null,
    webhook_secret: row.webhook_secret ? REDACT : null,
    metadata: {
      ...meta,
      verify_token: meta.verify_token ? REDACT : undefined,
    },
  };
}

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_accounts")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { accounts: (data ?? []).map(redact) };
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1).max(120),
  phone_number: z.string().min(5).max(32),
  provider: z.enum(["meta_cloud", "mock"]).default("meta_cloud"),
  provider_instance_id: z.string().min(1).max(64), // phone_number_id
  access_token: z.string().optional(), // omit to keep current
  webhook_secret: z.string().optional(), // app_secret; omit to keep current
  verify_token: z.string().optional(), // omit to keep current
  waba_id: z.string().optional(),
  provider_base_url: z.string().optional(),
  is_default: z.boolean().default(false),
  status: z.enum(["active", "disabled"]).default("active"),
});

export const upsertAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // manager-only enforced by RLS (wa_accounts_manager_write), mas validamos para erro melhor:
    const { data: isMgr } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isMgr) throw new Error("Apenas gestores podem editar contas de WhatsApp.");

    // carrega atual para preservar segredos quando vazios
    let current: { access_token: string | null; webhook_secret: string; metadata: Record<string, unknown> } | null = null;
    if (data.id) {
      const { data: row } = await supabase
        .from("whatsapp_accounts")
        .select("access_token, webhook_secret, metadata")
        .eq("id", data.id)
        .maybeSingle();
      if (row) {
        current = {
          access_token: row.access_token,
          webhook_secret: row.webhook_secret,
          metadata: (row.metadata as Record<string, unknown>) ?? {},
        };
      }
    }

    const metaPrev = (current?.metadata ?? {}) as Record<string, unknown>;
    const nextMetaObj: Record<string, unknown> = { ...metaPrev };
    if (data.verify_token) nextMetaObj.verify_token = data.verify_token.trim();
    if (data.waba_id !== undefined) nextMetaObj.waba_id = data.waba_id.trim() || undefined;
    const nextMeta = nextMetaObj as unknown as Json;

    const payload = {
      label: data.label,
      phone_number: data.phone_number.trim(),
      provider: data.provider,
      provider_instance_id: data.provider_instance_id.trim(),
      provider_base_url: data.provider_base_url?.trim() || null,
      access_token: data.access_token ? data.access_token.trim() : (current?.access_token ?? null),
      webhook_secret: data.webhook_secret ? data.webhook_secret.trim() : (current?.webhook_secret?.trim() ?? ""),
      metadata: nextMeta,
      is_default: data.is_default,
      status: data.status,
      owner_user_id: userId,
    };

    if (!payload.webhook_secret && data.provider === "meta_cloud") {
      throw new Error("Informe o App Secret (webhook_secret) — usado para validar a assinatura HMAC.");
    }

    // garante apenas uma default
    if (data.is_default) {
      await supabase.from("whatsapp_accounts").update({ is_default: false }).neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }

    if (data.id) {
      const { error } = await supabase.from("whatsapp_accounts").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await supabase
      .from("whatsapp_accounts")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: ins.id };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("whatsapp_accounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Envia uma mensagem de teste via a conta (texto livre) — útil para validar credenciais. */
export const testSendAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), to: z.string().min(5), body: z.string().min(1).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!isMgr) throw new Error("Apenas gestores.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: account, error } = await supabaseAdmin
      .from("whatsapp_accounts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !account) throw new Error(error?.message || "Conta não encontrada.");
    const { getProvider } = await import("@/lib/whatsapp/provider-registry.server");
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
      to: data.to,
      type: "text",
      body: data.body,
    });

    // Se o destinatário bate com um lead existente, grava no inbox (cria conversa se preciso)
    let inboxLinked: { leadId: string; conversationId: string } | null = null;
    if (result.status !== "failed") {
      const phone = data.to.replace(/\D+/g, "");
      const tail = phone.slice(-8);
      const { data: leadMatch } = await supabaseAdmin
        .from("leads")
        .select("id, assigned_to")
        .filter("phone", "ilike", `%${tail}%`)
        .limit(1)
        .maybeSingle();
      if (leadMatch) {
        let { data: conv } = await supabaseAdmin
          .from("whatsapp_conversations")
          .select("id")
          .eq("lead_id", leadMatch.id)
          .maybeSingle();
        if (!conv) {
          const ins = await supabaseAdmin
            .from("whatsapp_conversations")
            .insert({
              lead_id: leadMatch.id,
              account_id: account.id,
              assigned_user_id: leadMatch.assigned_to ?? context.userId,
              status: "open",
            })
            .select("id")
            .single();
          conv = ins.data;
        }
        if (conv) {
          const ts = new Date().toISOString();
          await supabaseAdmin.from("whatsapp_messages").insert({
            conversation_id: conv.id,
            lead_id: leadMatch.id,
            sender_type: "agent",
            sender_user_id: context.userId,
            message_type: "text",
            body: data.body,
            provider_message_id: result.providerMessageId || null,
            status: result.status === "sending" ? "sent" : result.status,
            sent_at: ts,
          });
          await supabaseAdmin
            .from("whatsapp_conversations")
            .update({ last_message_at: ts, last_preview: data.body.slice(0, 200), status: "open" })
            .eq("id", conv.id);
          inboxLinked = { leadId: leadMatch.id, conversationId: conv.id };
        }
      }
    }
    return { ...result, inboxLinked };
  });

/** Registra o número na Meta Cloud API (POST /{phone_number_id}/register).
 *  Necessário uma única vez antes de enviar/receber mensagens. Define também o PIN
 *  da verificação em duas etapas. */
export const registerCloudNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), pin: z.string().regex(/^\d{6}$/, "PIN deve ter 6 dígitos") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!isMgr) throw new Error("Apenas gestores.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: account, error } = await supabaseAdmin
      .from("whatsapp_accounts")
      .select("provider, provider_instance_id, provider_base_url, access_token")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !account) throw new Error(error?.message || "Conta não encontrada.");
    if (account.provider !== "meta_cloud") throw new Error("Disponível apenas para Meta Cloud API.");
    if (!account.access_token) throw new Error("Conta sem Access Token salvo.");
    if (!account.provider_instance_id) throw new Error("Conta sem Phone Number ID.");
    const base = (account.provider_base_url || "https://graph.facebook.com/v21.0").replace(/\/+$/, "");
    const url = `${base}/${account.provider_instance_id}/register`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", pin: data.pin }),
    });
    const text = await res.text();
    let json: { success?: boolean; error?: { message?: string; code?: number; error_subcode?: number } } = {};
    try { json = JSON.parse(text); } catch { /* ignore */ }
    if (!res.ok || !json.success) {
      const msg = json.error?.message || `HTTP ${res.status}: ${text.slice(0, 300)}`;
      throw new Error(msg);
    }
    return { ok: true };
  });