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
    const { ensureLeadRouted } = await import("./lead-routing.server");
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, name, phone, assigned_to")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) throw new Error("Lead não encontrado");
    if (!lead.phone) throw new Error("Lead sem telefone — adicione um número para iniciar a conversa");

    const routedUserId = await ensureLeadRouted({ supabase, leadId: lead.id, actorUserId: userId });

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
        assigned_user_id: lead.assigned_to ?? routedUserId ?? userId,
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
    const { renderTemplate } = await import("./whatsapp-templates.functions");
    const { data: rows, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);

    const messageRows = rows ?? [];
    const templateRows = messageRows.filter((row) => {
      const metadata = (row.metadata ?? {}) as { template_id?: string | null };
      return row.message_type === "template" && !row.body && metadata.template_id;
    });

    let hydratedRows = messageRows;
    if (templateRows.length > 0) {
      const templateIds = [...new Set(templateRows.map((row) => ((row.metadata ?? {}) as { template_id?: string | null }).template_id).filter(Boolean))] as string[];
      const leadIds = [...new Set(templateRows.map((row) => row.lead_id).filter(Boolean))] as string[];

      const [{ data: templates }, { data: leads }] = await Promise.all([
        supabase.from("whatsapp_templates").select("id, body").in("id", templateIds),
        supabase.from("leads").select("id, name, company_name").in("id", leadIds),
      ]);

      const templateMap = new Map((templates ?? []).map((template) => [template.id, template]));
      const leadMap = new Map((leads ?? []).map((lead) => [lead.id, lead]));

      hydratedRows = messageRows.map((row) => {
        const metadata = (row.metadata ?? {}) as {
          template_id?: string | null;
          rendered_body?: string | null;
        };
        if (row.message_type !== "template" || row.body || !metadata.template_id) return row;

        const template = templateMap.get(metadata.template_id);
        const lead = row.lead_id ? leadMap.get(row.lead_id) : null;
        const renderedBody = metadata.rendered_body
          ?? (template?.body
            ? renderTemplate(template.body, {
                nome: lead?.name ?? "",
                primeiro_nome: (lead?.name ?? "").split(" ")[0] ?? "",
                empresa: lead?.company_name ?? "",
              }).trim()
            : null);

        if (!renderedBody) return row;
        return {
          ...row,
          body: renderedBody,
          metadata: {
            ...metadata,
            rendered_body: renderedBody,
          },
        };
      });
    }

    const rowsWithFreshMediaUrls = await Promise.all(
      hydratedRows.map(async (row) => {
        const metadata = (row.metadata ?? {}) as { storage_bucket?: string | null; storage_path?: string | null };
        if (metadata.storage_bucket !== "whatsapp-media" || !metadata.storage_path) return row;

        const { data: signed } = await supabase.storage
          .from("whatsapp-media")
          .createSignedUrl(metadata.storage_path, 60 * 60 * 12);

        return signed?.signedUrl ? { ...row, media_url: signed.signedUrl } : row;
      }),
    );

    // zera unread_count
    await supabase
      .from("whatsapp_conversations")
      .update({ unread_count: 0 })
      .eq("id", data.conversationId);
    return { messages: rowsWithFreshMediaUrls };
  });

/** Informa se a conversa ainda está dentro da janela de 24h do WhatsApp. */
export const getConversationWindowState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        conversationId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: lastInbound, error } = await supabase
      .from("whatsapp_messages")
      .select("id, created_at")
      .eq("conversation_id", data.conversationId)
      .eq("sender_type", "contact")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const lastInboundAt = lastInbound?.created_at ?? null;
    if (!lastInboundAt) {
      return {
        isOpen: false,
        lastInboundAt: null,
        expiresAt: null,
      };
    }

    const expiresAt = new Date(new Date(lastInboundAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
    return {
      isOpen: new Date(expiresAt).getTime() > Date.now(),
      lastInboundAt,
      expiresAt,
    };
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
        templateId: z.string().uuid().optional(),
        templateName: z.string().optional(),
        templateVariables: z.record(z.string(), z.string()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { renderTemplate } = await import("./whatsapp-templates.functions");
    const { resolveTemplateSendParams } = await import("./whatsapp/template-send.server");

    const { data: conv, error: convErr } = await supabase
      .from("whatsapp_conversations")
      .select("*, leads:lead_id(id,name,phone)")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv) throw new Error("Conversa não encontrada");

    const lead = conv.leads as { id: string; phone: string | null; name: string | null } | null;
    if (!lead?.phone) throw new Error("Lead sem telefone — não dá pra enviar via WhatsApp");

    let body = data.body ?? null;
    let mediaUrl = data.mediaUrl ?? null;
    let mediaMime = data.mediaMime ?? null;
    let templateName = data.templateName;
    let templateLanguage = "pt_BR";
    let templateHeaderParams: string[] | undefined;
    let templateParams: string[] | undefined;
    let messageMetadata: Record<string, unknown> | null = null;

    if (data.messageType === "template") {
      if (!data.templateId) throw new Error("Selecione um template HSM para disparar.");

      const { data: tmpl, error: tmplErr } = await supabase
        .from("whatsapp_templates")
        .select("id, provider_template_name, language, variables, meta_template_id, body")
        .eq("id", data.templateId)
        .maybeSingle();
      if (tmplErr) throw new Error(tmplErr.message);
      if (!tmpl?.provider_template_name) throw new Error("O template HSM selecionado está inválido ou indisponível.");

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const accountQuery = conv.account_id
        ? supabaseAdmin.from("whatsapp_accounts").select("*").eq("id", conv.account_id).maybeSingle()
        : supabaseAdmin.from("whatsapp_accounts").select("*").eq("is_default", true).maybeSingle();
      const { data: account } = await accountQuery;
      if (!account) throw new Error("Nenhuma conta de WhatsApp configurada");

      const params = await resolveTemplateSendParams({
        account: {
          access_token: account.access_token ?? "",
          provider_base_url: account.provider_base_url,
        },
        metaTemplateId: tmpl.meta_template_id,
        storedVariables: tmpl.variables,
        lead: {
          name: lead.name,
          company_name: null,
        },
      });

      const renderedBody = renderTemplate(tmpl.body ?? "", {
        nome: lead.name ?? "",
        primeiro_nome: (lead.name ?? "").split(" ")[0] ?? "",
        empresa: "",
      }).trim();

      body = renderedBody || null;
      templateName = tmpl.provider_template_name;
      templateLanguage = tmpl.language ?? "pt_BR";
      templateHeaderParams = params.headerParams;
      templateParams = params.bodyParams;
      messageMetadata = {
        template_id: tmpl.id,
        template_name: tmpl.provider_template_name,
        rendered_body: renderedBody || null,
      };
    }

    // 1) cria registro local em "sending"
    const { data: msg, error: msgErr } = await supabase
      .from("whatsapp_messages")
      .insert({
        conversation_id: data.conversationId,
        lead_id: conv.lead_id,
        sender_type: "sdr",
        sender_user_id: userId,
        message_type: data.messageType,
        body,
        media_url: mediaUrl,
        media_mime: mediaMime,
        metadata: messageMetadata,
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
        body: body ?? undefined,
        mediaUrl: mediaUrl ?? undefined,
        mediaMime: mediaMime ?? undefined,
        templateName,
        templateLanguage,
        templateHeaderParams,
        templateParams,
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
          last_preview: body?.slice(0, 200) ?? `[${data.messageType}]`,
          status: "open",
          unread_count: 0,
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
        metadata: {
          storage_bucket: "whatsapp-media",
          storage_path: data.storagePath,
        },
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
          unread_count: 0,
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
    const { supabase, userId } = context;
    const { data: conversation, error: convError } = await supabase
      .from("whatsapp_conversations")
      .select("id, lead_id, assigned_user_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convError) throw new Error(convError.message);
    if (!conversation) throw new Error("Conversa não encontrada");

    const { error } = await supabase
      .from("whatsapp_conversations")
      .update({ assigned_user_id: data.userId })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);

    const { error: leadError } = await supabase
      .from("leads")
      .update({ assigned_to: data.userId, last_action_at: new Date().toISOString() })
      .eq("id", conversation.lead_id);
    if (leadError) throw new Error(leadError.message);

    await supabase.from("lead_interactions").insert({
      lead_id: conversation.lead_id,
      author_id: userId,
      type: "routing",
      content: data.userId ? "Conversa transferida para outra SDR." : "Conversa enviada para fila geral.",
      metadata: {
        previous_assignee_user_id: conversation.assigned_user_id,
        assignee_user_id: data.userId,
        source: "whatsapp_inbox",
      },
    });

    return { ok: true };
  });

/** Assume manualmente a conversa e derruba novos handoffs automáticos. */
export const assumeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      conversationId: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const assumedAt = new Date().toISOString();

    const { data: conversation, error: convError } = await supabase
      .from("whatsapp_conversations")
      .select("id, lead_id, assigned_user_id, assumed_by_user_id, assumed_at")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convError) throw new Error(convError.message);
    if (!conversation) throw new Error("Conversa não encontrada");

    const { error } = await supabase
      .from("whatsapp_conversations")
      .update({
        assigned_user_id: userId,
        status: "open",
        assumed_by_user_id: userId,
        assumed_at: assumedAt,
      })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);

    const { error: leadError } = await supabase
      .from("leads")
      .update({ assigned_to: userId, last_action_at: assumedAt })
      .eq("id", conversation.lead_id);
    if (leadError) throw new Error(leadError.message);

    await supabase.from("lead_interactions").insert({
      lead_id: conversation.lead_id,
      author_id: userId,
      type: "routing",
      content: "Conversa assumida manualmente por uma SDR.",
      metadata: {
        previous_assignee_user_id: conversation.assigned_user_id,
        assignee_user_id: userId,
        assumed_by_user_id: userId,
        assumed_at: assumedAt,
        source: "whatsapp_manual_assume",
      },
    });

    return { ok: true, assumedAt };
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

/** Busca/cria conversa por telefone para teste manual. */
export const getOrCreateConversationForPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      phone: z.string().min(8).max(30),
      name: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const phone = normPhone(data.phone);

    let contactId: string | null = null;
    let leadId: string | null = null;

    const { data: existingContact, error: contactErr } = await supabase
      .from("whatsapp_contacts")
      .select("id, lead_id")
      .eq("phone", phone)
      .maybeSingle();
    if (contactErr) throw new Error(contactErr.message);

    if (existingContact) {
      contactId = existingContact.id;
      leadId = existingContact.lead_id ?? null;
    }

    if (!leadId) {
      const { data: existingLead, error: leadLookupErr } = await supabase
        .from("leads")
        .select("id, assigned_to")
        .filter("phone", "ilike", `%${phone.slice(-8)}%`)
        .limit(1)
        .maybeSingle();
      if (leadLookupErr) throw new Error(leadLookupErr.message);
      if (existingLead) leadId = existingLead.id;
    }

    if (!leadId) {
      const { data: stage } = await supabase
        .from("stages")
        .select("id")
        .eq("slug", "novo")
        .maybeSingle();

      const { data: createdLead, error: leadCreateErr } = await supabase
        .from("leads")
        .insert({
          name: data.name?.trim() || `Teste WhatsApp ${phone.slice(-4)}`,
          phone,
          source: "whatsapp_ai_test",
          channel: "whatsapp",
          assigned_to: userId,
          stage_id: stage?.id ?? null,
        })
        .select("id")
        .single();
      if (leadCreateErr) throw new Error(leadCreateErr.message);
      leadId = createdLead.id;
    }

    if (!contactId) {
      const { data: createdContact, error: contactCreateErr } = await supabase
        .from("whatsapp_contacts")
        .upsert({
          phone,
          lead_id: leadId,
          name: data.name?.trim() || null,
        }, { onConflict: "phone" })
        .select("id")
        .single();
      if (contactCreateErr) throw new Error(contactCreateErr.message);
      contactId = createdContact.id;
    } else if (leadId) {
      await supabase.from("whatsapp_contacts").update({ lead_id: leadId }).eq("id", contactId);
    }

    const { data: existingConversation, error: convLookupErr } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("lead_id", leadId)
      .maybeSingle();
    if (convLookupErr) throw new Error(convLookupErr.message);
    if (existingConversation) return { conversation: existingConversation, leadId };

    const { data: account } = await supabase
      .from("whatsapp_accounts")
      .select("id")
      .eq("is_default", true)
      .maybeSingle();

    const { data: createdConversation, error: convCreateErr } = await supabase
      .from("whatsapp_conversations")
      .insert({
        lead_id: leadId,
        contact_id: contactId,
        account_id: account?.id ?? null,
        assigned_user_id: userId,
        status: "open",
      })
      .select("*")
      .single();
    if (convCreateErr) throw new Error(convCreateErr.message);

    return { conversation: createdConversation, leadId };
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