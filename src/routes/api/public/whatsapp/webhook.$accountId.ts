import { createFileRoute } from "@tanstack/react-router";

// Webhook público de WhatsApp. URL estável:
//   https://<host>/api/public/whatsapp/webhook/<accountId>
// Cada conta tem seu próprio webhook_secret; provider.verifySignature valida.
// Salva mensagens recebidas e atualizações de status.

export const Route = createFileRoute("/api/public/whatsapp/webhook/$accountId")({
  server: {
    handlers: {
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
            await handleInbound(supabaseAdmin, account.id, ev.data);
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
  msg: {
    providerMessageId: string;
    from: string;
    type: string;
    body?: string;
    mediaUrl?: string;
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
    console.warn("[wa webhook] inbound sem lead associado, phone=", phone);
    return; // sem lead, ignora (não criamos lead aqui)
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

  // 3) grava mensagem
  const ts = new Date(msg.timestamp).toISOString();
  await admin.from("whatsapp_messages").insert({
    conversation_id: conv.id,
    lead_id: leadId,
    sender_type: "lead",
    message_type: msg.type,
    body: msg.body ?? null,
    media_url: msg.mediaUrl ?? null,
    media_mime: msg.mediaMime ?? null,
    provider_message_id: msg.providerMessageId,
    status: "delivered",
    sent_at: ts,
    delivered_at: ts,
  });

  await admin
    .from("whatsapp_conversations")
    .update({
      last_message_at: ts,
      last_preview: msg.body?.slice(0, 200) ?? `[${msg.type}]`,
      unread_count: (conv.unread_count ?? 0) + 1,
      status: "open",
    })
    .eq("id", conv.id);

  await admin
    .from("whatsapp_contacts")
    .update({ last_message_at: ts })
    .eq("id", contact!.id);
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

// helper só pro tipo
async function getAdmin() {
  const m = await import("@/integrations/supabase/client.server");
  return m.supabaseAdmin;
}