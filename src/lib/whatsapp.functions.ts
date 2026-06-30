import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Normaliza telefone para E.164 sem '+'. Números BR vindos como DDD+número recebem DDI 55. */
function normPhone(raw: string): string {
  const digits = raw.replace(/\D+/g, "").replace(/^0+/, "");
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
}

/** Lista conversas (com filtros) — respeita RLS. */
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z.enum(["all", "open", "pending", "closed"]).optional(),
        assigned: z.enum(["all", "me", "unassigned"]).optional(),
        unread: z.boolean().optional(),
        search: z.string().optional(),
      })
      .optional()
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("whatsapp_conversations")
      .select("*, leads:lead_id(id,name,company_name,email,phone,priority,stage_id,assigned_to,lead_type,company_size)")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(300);
    if (data?.status && data.status !== "all") q = q.eq("status", data.status);
    if (data?.assigned === "me") q = q.eq("assigned_user_id", userId);
    if (data?.assigned === "unassigned") q = q.is("assigned_user_id", null);
    if (data?.unread) q = q.gt("unread_count", 0);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    let result = rows ?? [];
    if (data?.search) {
      const s = data.search.toLowerCase();
      result = result.filter((r) => {
        const lead = r.leads as { name?: string | null; company_name?: string | null } | null;
        return (
          lead?.name?.toLowerCase().includes(s) ||
          lead?.company_name?.toLowerCase().includes(s) ||
          r.last_preview?.toLowerCase().includes(s)
        );
      });
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email");
    return { conversations: result, profiles: profiles ?? [] };
  });

/** Busca/cria conversa para um lead. */
export const getOrCreateConversationForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, name, phone, assigned_to")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) throw new Error("Lead não encontrado");
    if (!lead.phone) throw new Error("Lead sem telefone — adicione um número para iniciar a conversa");

    const { data: existing } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("lead_id", data.leadId)
      .maybeSingle();
    if (existing) return { conversation: existing };

    // garante contato se houver telefone
    let contactId: string | null = null;
    if (lead.phone) {
      const phone = normPhone(lead.phone);
      const { data: contact } = await supabase
        .from("whatsapp_contacts")
        .upsert(
          { phone, lead_id: lead.id, name: lead.name },
          { onConflict: "phone" },
        )
        .select("id")
        .maybeSingle();
      contactId = contact?.id ?? null;
    }

    const { data: account } = await supabase
      .from("whatsapp_accounts")
      .select("id")
      .eq("is_default", true)
      .maybeSingle();

    const { data: created, error } = await supabase
      .from("whatsapp_conversations")
      .insert({
        lead_id: lead.id,
        contact_id: contactId,
        account_id: account?.id ?? null,
        assigned_user_id: lead.assigned_to ?? userId,
        status: "open",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { conversation: created };
  });

/** Apenas busca a conversa existente do lead (sem criar). */
export const findConversationForLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing, error } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("lead_id", data.leadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { conversation: existing ?? null };
  });

/** Lista mensagens de uma conversa. */
export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    // zera unread_count
    await supabase
      .from("whatsapp_conversations")
      .update({ unread_count: 0 })
      .eq("id", data.conversationId);
    return { messages: rows ?? [] };
  });

/** Envia mensagem via provider configurado. */
export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        conversationId: z.string().uuid(),
        body: z.string().min(1).max(4096).optional(),
        mediaUrl: z.string().url().optional(),
        mediaMime: z.string().optional(),
        messageType: z.enum(["text", "image", "file", "audio", "video", "template"]).default("text"),
        templateName: z.string().optional(),
        templateVariables: z.record(z.string(), z.string()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: conv, error: convErr } = await supabase
      .from("whatsapp_conversations")
      .select("*, leads:lead_id(id,name,phone)")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv) throw new Error("Conversa não encontrada");

    const lead = conv.leads as { id: string; phone: string | null; name: string | null } | null;
    if (!lead?.phone) throw new Error("Lead sem telefone — não dá pra enviar via WhatsApp");

    // 1) cria registro local em "sending"
    const { data: msg, error: msgErr } = await supabase
      .from("whatsapp_messages")
      .insert({
        conversation_id: data.conversationId,
        lead_id: conv.lead_id,
        sender_type: "sdr",
        sender_user_id: userId,
        message_type: data.messageType,
        body: data.body ?? null,
        media_url: data.mediaUrl ?? null,
        media_mime: data.mediaMime ?? null,
        status: "sending",
      })
      .select("*")
      .single();
    if (msgErr) throw new Error(msgErr.message);

    // 2) dispara via provider — admin import dentro do handler (regra de boundary)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { getProvider } = await import("./whatsapp/provider-registry.server");

      const accountQuery = conv.account_id
        ? supabaseAdmin.from("whatsapp_accounts").select("*").eq("id", conv.account_id).maybeSingle()
        : supabaseAdmin.from("whatsapp_accounts").select("*").eq("is_default", true).maybeSingle();
      const { data: account } = await accountQuery;
      if (!account) throw new Error("Nenhuma conta de WhatsApp configurada");

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
        to: normPhone(lead.phone),
        type: data.messageType,
        body: data.body,
        mediaUrl: data.mediaUrl,
        mediaMime: data.mediaMime,
        templateName: data.templateName,
        templateVariables: data.templateVariables,
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

      if (result.status === "failed") {
        throw new Error(result.error ?? "Falha ao enviar mensagem pelo WhatsApp");
      }

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_preview: data.body?.slice(0, 200) ?? `[${data.messageType}]`,
          status: "open",
        })
        .eq("id", data.conversationId);

      return { ok: true, messageId: msg.id, providerMessageId: result.providerMessageId };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha desconhecida";
      await supabase
        .from("whatsapp_messages")
        .update({ status: "failed", error: message })
        .eq("id", msg.id);
      throw new Error(message);
    }
  });

/** Cria signed URL para arquivo já enviado ao bucket whatsapp-media e dispara como mensagem. */
export const sendMediaFromStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        conversationId: z.string().uuid(),
        storagePath: z.string().min(1),
        mime: z.string().min(1),
        caption: z.string().max(1024).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: conv, error: convErr } = await supabase
      .from("whatsapp_conversations")
      .select("*, leads:lead_id(id,name,phone)")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv) throw new Error("Conversa não encontrada");
    const lead = conv.leads as { phone: string | null } | null;
    if (!lead?.phone) throw new Error("Lead sem telefone");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getProvider } = await import("./whatsapp/provider-registry.server");

    // signed URL com validade longa (Meta busca em segundos, mas deixamos 24h por segurança)
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("whatsapp-media")
      .createSignedUrl(data.storagePath, 60 * 60 * 24);
    if (signErr || !signed?.signedUrl) throw new Error(signErr?.message ?? "Falha ao gerar URL do anexo");

    const messageType: "image" | "video" | "audio" | "file" = data.mime.startsWith("image/")
      ? "image"
      : data.mime.startsWith("video/")
        ? "video"
        : data.mime.startsWith("audio/")
          ? "audio"
          : "file";

    const { data: msg, error: msgErr } = await supabase
      .from("whatsapp_messages")
      .insert({
        conversation_id: data.conversationId,
        lead_id: conv.lead_id,
        sender_type: "sdr",
        sender_user_id: userId,
        message_type: messageType,
        body: data.caption ?? null,
        media_url: signed.signedUrl,
        media_mime: data.mime,
        status: "sending",
      })
      .select("*")
      .single();
    if (msgErr) throw new Error(msgErr.message);

    try {
      const accountQuery = conv.account_id
        ? supabaseAdmin.from("whatsapp_accounts").select("*").eq("id", conv.account_id).maybeSingle()
        : supabaseAdmin.from("whatsapp_accounts").select("*").eq("is_default", true).maybeSingle();
      const { data: account } = await accountQuery;
      if (!account) throw new Error("Nenhuma conta de WhatsApp configurada");

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
        to: normPhone(lead.phone),
        type: messageType,
        body: data.caption,
        mediaUrl: signed.signedUrl,
        mediaMime: data.mime,
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

      if (result.status === "failed") {
        throw new Error(result.error ?? "Falha ao enviar anexo pelo WhatsApp");
      }

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_preview: data.caption?.slice(0, 200) ?? `[${messageType}]`,
          status: "open",
        })
        .eq("id", data.conversationId);

      return { ok: true, messageId: msg.id };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha desconhecida";
      await supabase.from("whatsapp_messages").update({ status: "failed", error: message }).eq("id", msg.id);
      throw new Error(message);
    }
  });

/** Atribuir conversa a um usuário. */
export const assignConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      conversationId: z.string().uuid(),
      userId: z.string().uuid().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("whatsapp_conversations")
      .update({ assigned_user_id: data.userId })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Muda status (open/pending/closed). */
export const setConversationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      conversationId: z.string().uuid(),
      status: z.enum(["open", "pending", "closed"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("whatsapp_conversations")
      .update({ status: data.status })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lista perfis (p/ atribuição). */
export const listProfilesForAssignment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name");
    if (error) throw new Error(error.message);
    return { profiles: data ?? [] };
  });