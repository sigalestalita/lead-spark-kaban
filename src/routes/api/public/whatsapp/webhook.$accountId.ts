import { createFileRoute } from "@tanstack/react-router";
import type { Json } from "@/integrations/supabase/types";
import { LISIANE_USER_ID } from "@/lib/whatsapp-ai.functions";

// Webhook público de WhatsApp. URL estável:
//   https://<host>/api/public/whatsapp/webhook/<accountId>
// Cada conta tem seu próprio webhook_secret; provider.verifySignature valida.
// Salva mensagens recebidas e atualizações de status.

export const Route = createFileRoute("/api/public/whatsapp/webhook/$accountId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        // Verificação inicial do webhook Meta Cloud:
        //   GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode !== "subscribe" || !token || !challenge) {
          return new Response("bad request", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: account } = await supabaseAdmin
          .from("whatsapp_accounts")
          .select("metadata")
          .eq("id", params.accountId)
          .maybeSingle();
        const expected = (account?.metadata as { verify_token?: string } | null)?.verify_token;
        if (!expected || token !== expected) {
          return new Response("forbidden", { status: 403 });
        }
        return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
      },
      POST: async ({ request, params }) => {
        const accountId = params.accountId;
        const rawBody = await request.text();
        const headers: Record<string, string> = {};
        request.headers.forEach((v, k) => { headers[k] = v; });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { getProvider } = await import("@/lib/whatsapp/provider-registry.server");

        const { data: account } = await supabaseAdmin
          .from("whatsapp_accounts")
          .select("*")
          .eq("id", accountId)
          .maybeSingle();
        if (!account) return new Response("account not found", { status: 404 });

        const provider = getProvider(account.provider);
        if (provider.verifySignature && !provider.verifySignature(rawBody, headers, account.webhook_secret)) {
          return new Response("invalid signature", { status: 401 });
        }

        const accountConfig = {
          id: account.id,
          phone_number: account.phone_number,
          provider: account.provider,
          provider_instance_id: account.provider_instance_id,
          provider_base_url: account.provider_base_url,
          access_token: account.access_token,
          webhook_secret: account.webhook_secret,
        };

        let events;
        try {
          events = provider.parseWebhook(rawBody, headers, accountConfig);
        } catch (e) {
          console.error("[wa webhook] parse error", e);
          return new Response("parse error", { status: 400 });
        }

        for (const ev of events) {
          if (ev.kind === "message") {
            await handleInbound(supabaseAdmin, account.id, accountConfig, ev.data);
          } else if (ev.kind === "status") {
            await handleStatus(supabaseAdmin, ev.data);
          }
        }
        return Response.json({ ok: true, processed: events.length });
      },
    },
  },
});

async function handleInbound(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  accountId: string,
  accountConfig: {
    id: string;
    phone_number: string;
    provider: string;
    provider_instance_id: string | null;
    provider_base_url: string | null;
    access_token: string | null;
    webhook_secret: string;
  },
  msg: {
    providerMessageId: string;
    from: string;
    type: string;
    body?: string;
    mediaUrl?: string;
    mediaId?: string;
    mediaMime?: string;
    timestamp: number;
    senderName?: string;
  },
) {
  const phone = msg.from.replace(/\D+/g, "");

  // 1) acha contato → lead
  let contact = (
    await admin.from("whatsapp_contacts").select("*").eq("phone", phone).maybeSingle()
  ).data;

  let leadId = contact?.lead_id ?? null;
  if (!leadId) {
    // tenta achar lead por telefone (qualquer formato dígitos)
    const { data: leadMatch } = await admin
      .from("leads")
      .select("id")
      .filter("phone", "ilike", `%${phone.slice(-8)}%`)
      .limit(1)
      .maybeSingle();
    leadId = leadMatch?.id ?? null;
  }

  if (!contact) {
    const ins = await admin
      .from("whatsapp_contacts")
      .insert({ phone, name: msg.senderName ?? null, lead_id: leadId })
      .select("*")
      .single();
    contact = ins.data;
  }

  if (!leadId) {
    // cria lead "incoming" automático pra não perder a mensagem
    const ins = await admin
      .from("leads")
      .insert({
        name: msg.senderName ?? `WhatsApp ${phone.slice(-4)}`,
        phone,
        source: "whatsapp_inbound",
      })
      .select("id")
      .single();
    leadId = ins.data?.id ?? null;
    if (!leadId) {
      console.warn("[wa webhook] falha ao criar lead, phone=", phone, ins.error);
      return;
    }
    if (contact) {
      await admin.from("whatsapp_contacts").update({ lead_id: leadId }).eq("id", contact.id);
    }
  }

  if (leadId) {
    const { ensureLeadRouted } = await import("@/lib/lead-routing.server");
    await ensureLeadRouted({ supabase: admin, leadId, actorUserId: null });
  }

  // 2) acha/cria conversa
  let conv = (
    await admin.from("whatsapp_conversations").select("*").eq("lead_id", leadId).maybeSingle()
  ).data;
  if (!conv) {
    const { data: lead } = await admin
      .from("leads")
      .select("assigned_to")
      .eq("id", leadId)
      .maybeSingle();
    const ins = await admin
      .from("whatsapp_conversations")
      .insert({
        lead_id: leadId,
        contact_id: contact?.id ?? null,
        account_id: accountId,
        assigned_user_id: lead?.assigned_to ?? null,
        status: "open",
      })
      .select("*")
      .single();
    conv = ins.data;
  }
  if (!conv) return;

  // 3) baixa mídia recebida (áudio/imagem/vídeo/documento) para o storage privado
  const ts = new Date(msg.timestamp).toISOString();
  let mediaUrl = msg.mediaUrl ?? null;
  let mediaMime = msg.mediaMime ?? null;
  let mediaMetadata: Json = {};

  if ((msg.mediaId || msg.mediaUrl) && accountConfig.access_token) {
    try {
      const base = (accountConfig.provider_base_url || "https://graph.facebook.com/v21.0").replace(/\/+$/, "");
      let mediaInfo: { url?: string; mime_type?: string } = { url: msg.mediaUrl, mime_type: msg.mediaMime };
      if (msg.mediaId) {
        const metaRes = await fetch(`${base}/${encodeURIComponent(msg.mediaId)}`, {
          headers: { Authorization: `Bearer ${accountConfig.access_token}` },
        });
        if (!metaRes.ok) throw new Error(`media metadata HTTP ${metaRes.status}`);
        mediaInfo = await metaRes.json() as { url?: string; mime_type?: string };
      }
      if (!mediaInfo.url) throw new Error("media URL ausente");

      const fileRes = await fetch(mediaInfo.url, {
        headers: { Authorization: `Bearer ${accountConfig.access_token}` },
      });
      if (!fileRes.ok) throw new Error(`media download HTTP ${fileRes.status}`);

      mediaMime = mediaInfo.mime_type || fileRes.headers.get("content-type") || mediaMime;
      const ext = extensionFromMime(mediaMime, msg.type);
      const safeMessageId = msg.providerMessageId.replace(/[^a-zA-Z0-9_-]/g, "_");
      const storagePath = `inbound/${accountId}/${phone}/${safeMessageId}${ext}`;
      const bytes = await fileRes.arrayBuffer();
      const { error: uploadErr } = await admin.storage
        .from("whatsapp-media")
        .upload(storagePath, bytes, { contentType: mediaMime ?? "application/octet-stream", upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: signed } = await admin.storage
        .from("whatsapp-media")
        .createSignedUrl(storagePath, 60 * 60 * 24);
      mediaUrl = signed?.signedUrl ?? null;
      mediaMetadata = {
        provider_media_id: msg.mediaId ?? null,
        storage_bucket: "whatsapp-media",
        storage_path: storagePath,
      };
    } catch (e) {
      console.error("[wa webhook] media download error", e);
      mediaMetadata = { provider_media_id: msg.mediaId, media_error: e instanceof Error ? e.message : String(e) };
    }
  }

  // 4) grava mensagem
  await admin.from("whatsapp_messages").insert({
    conversation_id: conv.id,
    lead_id: leadId,
    sender_type: "lead",
    message_type: msg.type,
    body: msg.body ?? null,
    media_url: mediaUrl,
    media_mime: mediaMime,
    metadata: mediaMetadata,
    provider_message_id: msg.providerMessageId,
    status: "delivered",
    sent_at: ts,
    delivered_at: ts,
  });

  let conversationStatus: "open" | "pending" = "open";
  let conversationAssignee = conv.assigned_user_id ?? null;

  await admin
    .from("whatsapp_contacts")
    .update({ last_message_at: ts })
    .eq("id", contact!.id);

  await admin
    .from("whatsapp_conversations")
    .update({
      last_message_at: ts,
      last_preview: msg.body?.slice(0, 200) ?? `[${msg.type}]`,
      unread_count: (conv.unread_count ?? 0) + 1,
      status: conversationStatus,
      assigned_user_id: conversationAssignee,
    })
    .eq("id", conv.id);

  // 4) resposta automática da IA quando habilitada
  try {
    const { data: aiCfg } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "whatsapp_ai_agent")
      .maybeSingle();
    const cfg = (aiCfg?.value ?? {}) as Record<string, unknown>;
    const autoReplyEnabled = cfg.enabled === true && cfg.autoReplyEnabled === true;
    const stopOnLeadReply = cfg.stopOnLeadReply !== false;
    const responseMaxPerConversation = typeof cfg.responseMaxPerConversation === "number" ? cfg.responseMaxPerConversation : 12;

    if (!autoReplyEnabled || !conv?.id || !leadId) return;

    const { data: recentMsgs } = await admin
      .from("whatsapp_messages")
      .select("sender_type")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(50);

    const hasHumanTakeover = (recentMsgs ?? []).some((m) => ["sdr", "agent", "human"].includes(m.sender_type));
    if (hasHumanTakeover) return;

    if (stopOnLeadReply) {
      const agentReplies = (recentMsgs ?? []).filter((m) => ["bot", "automation"].includes(m.sender_type)).length;
      if (agentReplies >= responseMaxPerConversation) return;
    }

    const { evaluateAiHandoffInternal, generateAutoReplyInternal } = await import("@/lib/whatsapp-ai.functions");
    const handoff = await evaluateAiHandoffInternal(admin, conv.id);
    if (handoff.shouldHandoff) {
      conversationStatus = "pending";
      conversationAssignee = LISIANE_USER_ID;

      await admin
        .from("whatsapp_conversations")
        .update({
          assigned_user_id: LISIANE_USER_ID,
          status: "pending",
          unread_count: (conv.unread_count ?? 0) + 1,
          last_message_at: ts,
          last_preview: msg.body?.slice(0, 200) ?? `[${msg.type}]`,
        })
        .eq("id", conv.id);

      await admin
        .from("leads")
        .update({ assigned_to: LISIANE_USER_ID, last_action_at: new Date().toISOString() })
        .eq("id", leadId);

      await admin.from("lead_interactions").insert({
        lead_id: leadId,
        author_id: null,
        type: "routing",
        content: "Lead transferido automaticamente da IA para a Lisiane por intenção comercial/agendamento.",
        metadata: {
          assignee_user_id: LISIANE_USER_ID,
          source: "ai_handoff",
          reason: handoff.reason,
          urgency: handoff.urgency,
        },
      });

      if (handoff.suggestedReply) {
        const { getProvider } = await import("@/lib/whatsapp/provider-registry.server");
        const provider = getProvider(accountConfig.provider);
        const botMsg = await admin
          .from("whatsapp_messages")
          .insert({
            conversation_id: conv.id,
            lead_id: leadId,
            sender_type: "bot",
            message_type: "text",
            body: handoff.suggestedReply,
            metadata: { source: "ai_handoff", handoff_reason: handoff.reason },
            status: "sending",
          })
          .select("id")
          .single();

        const sendResult = await provider.sendMessage({
          account: accountConfig,
          to: phone,
          type: "text",
          body: handoff.suggestedReply,
        });

        await admin
          .from("whatsapp_messages")
          .update({
            provider_message_id: sendResult.providerMessageId || null,
            status: sendResult.status === "failed" ? "failed" : "sent",
            error: sendResult.error ?? null,
            sent_at: new Date().toISOString(),
          })
          .eq("id", botMsg.data?.id ?? "00000000-0000-0000-0000-000000000000");

        await admin
          .from("whatsapp_conversations")
          .update({
            last_message_at: new Date().toISOString(),
            last_preview: handoff.suggestedReply.slice(0, 200),
            assigned_user_id: LISIANE_USER_ID,
            status: "pending",
          })
          .eq("id", conv.id);
      }

      return;
    }

    const aiResult = await generateAutoReplyInternal(admin, conv.id);
    const reply = aiResult?.reply?.trim();
    if (!reply) return;

    const { getProvider } = await import("@/lib/whatsapp/provider-registry.server");
    const provider = getProvider(accountConfig.provider);
    const botMsg = await admin
      .from("whatsapp_messages")
      .insert({
        conversation_id: conv.id,
        lead_id: leadId,
        sender_type: "bot",
        message_type: "text",
        body: reply,
        metadata: { source: "ai_auto_reply" },
        status: "sending",
      })
      .select("id")
      .single();

    const sendResult = await provider.sendMessage({
      account: accountConfig,
      to: phone,
      type: "text",
      body: reply,
    });

    await admin
      .from("whatsapp_messages")
      .update({
        provider_message_id: sendResult.providerMessageId || null,
        status: sendResult.status === "failed" ? "failed" : "sent",
        error: sendResult.error ?? null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", botMsg.data?.id ?? "00000000-0000-0000-0000-000000000000");

    await admin
      .from("whatsapp_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_preview: reply.slice(0, 200),
        status: "open",
      })
      .eq("id", conv.id);
  } catch (e) {
    console.error("[wa webhook] ai auto-reply error", e);
  }
}

async function handleStatus(
  admin: Awaited<ReturnType<typeof getAdmin>>,
  st: { providerMessageId: string; status: string; error?: string; timestamp: number },
) {
  const ts = new Date(st.timestamp).toISOString();
  const patch: {
    status: string;
    delivered_at?: string;
    read_at?: string;
    error?: string | null;
  } = { status: st.status };
  if (st.status === "delivered") patch.delivered_at = ts;
  if (st.status === "read") patch.read_at = ts;
  if (st.status === "failed") patch.error = st.error ?? null;
  await admin
    .from("whatsapp_messages")
    .update(patch)
    .eq("provider_message_id", st.providerMessageId);
}

function extensionFromMime(mime: string | null, type: string) {
  const normalized = (mime ?? "").toLowerCase().split(";")[0].trim();
  if (normalized === "audio/ogg") return ".ogg";
  if (normalized === "audio/mpeg") return ".mp3";
  if (normalized === "audio/mp4") return ".m4a";
  if (normalized === "audio/aac") return ".aac";
  if (normalized === "audio/amr") return ".amr";
  if (normalized === "image/jpeg") return ".jpg";
  if (normalized === "image/png") return ".png";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "video/mp4") return ".mp4";
  if (normalized === "application/pdf") return ".pdf";
  if (type === "audio") return ".ogg";
  if (type === "image") return ".jpg";
  if (type === "video") return ".mp4";
  return "";
}

// helper só pro tipo
async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}