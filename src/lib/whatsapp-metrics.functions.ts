import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Métricas agregadas do módulo WhatsApp para o período informado.
 * Período default: últimos 30 dias.
 * Respeita RLS — gestores veem tudo; SDR vê apenas suas conversas/leads.
 */
export const getWhatsappMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .optional()
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const now = new Date();
    const to = data?.to ? new Date(data.to) : now;
    const from = data?.from ? new Date(data.from) : new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const fromISO = from.toISOString();
    const toISO = to.toISOString();

    // --- mensagens no período ---
    const { data: msgs, error: mErr } = await supabase
      .from("whatsapp_messages")
      .select("id, conversation_id, sender_type, status, created_at, sent_at, delivered_at, read_at, sdr_user_id, campaign_id")
      .gte("created_at", fromISO)
      .lte("created_at", toISO)
      .limit(20000);
    if (mErr) throw new Error(mErr.message);

    const messages = msgs ?? [];
    const outbound = messages.filter((m) => m.sender_type === "sdr" || m.sender_type === "bot");
    const inbound = messages.filter((m) => m.sender_type === "lead");

    const delivered = outbound.filter((m) => m.delivered_at || m.status === "delivered" || m.status === "read").length;
    const read = outbound.filter((m) => m.read_at || m.status === "read").length;
    const failed = outbound.filter((m) => m.status === "failed").length;

    // série diária
    const dayBuckets = new Map<string, { date: string; sent: number; received: number }>();
    for (const m of messages) {
      const d = (m.created_at as string).slice(0, 10);
      const b = dayBuckets.get(d) ?? { date: d, sent: 0, received: 0 };
      if (m.sender_type === "lead") b.received += 1;
      else b.sent += 1;
      dayBuckets.set(d, b);
    }
    const series = Array.from(dayBuckets.values()).sort((a, b) => a.date.localeCompare(b.date));

    // --- conversas / temperatura ---
    const { data: convs, error: cErr } = await supabase
      .from("whatsapp_conversations")
      .select("id, status, assigned_user_id, temperature, created_at, last_message_at, unread_count")
      .limit(5000);
    if (cErr) throw new Error(cErr.message);

    const conversations = convs ?? [];
    const newConvs = conversations.filter(
      (c) => c.created_at >= fromISO && c.created_at <= toISO,
    ).length;

    const tempCounts = { quente: 0, morno: 0, frio: 0, sem: 0 };
    for (const c of conversations) {
      const t = c.temperature as string | null;
      if (t === "quente") tempCounts.quente += 1;
      else if (t === "morno") tempCounts.morno += 1;
      else if (t === "frio") tempCounts.frio += 1;
      else tempCounts.sem += 1;
    }

    const statusCounts = {
      open: conversations.filter((c) => c.status === "open").length,
      pending: conversations.filter((c) => c.status === "pending").length,
      closed: conversations.filter((c) => c.status === "closed").length,
    };

    // --- tempo médio de primeira resposta do SDR (por conversa) ---
    // Agrupa mensagens por conversa; pra cada msg de lead, mede até a próxima outbound.
    const byConv = new Map<string, typeof messages>();
    for (const m of messages) {
      const arr = byConv.get(m.conversation_id) ?? [];
      arr.push(m);
      byConv.set(m.conversation_id, arr);
    }
    let respCount = 0;
    let respSumMs = 0;
    for (const arr of byConv.values()) {
      arr.sort((a, b) => (a.created_at as string).localeCompare(b.created_at as string));
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].sender_type !== "lead") continue;
        for (let j = i + 1; j < arr.length; j++) {
          if (arr[j].sender_type !== "lead") {
            const diff = new Date(arr[j].created_at).getTime() - new Date(arr[i].created_at).getTime();
            if (diff >= 0 && diff < 7 * 24 * 3600 * 1000) {
              respSumMs += diff;
              respCount += 1;
            }
            break;
          }
        }
      }
    }
    const avgFirstResponseMin = respCount > 0 ? Math.round(respSumMs / respCount / 60000) : null;

    // --- por SDR ---
    const sdrMap = new Map<string, { sent: number; received: number; conversations: number; quente: number }>();
    for (const m of outbound) {
      const id = (m.sdr_user_id as string | null) ?? "—";
      const e = sdrMap.get(id) ?? { sent: 0, received: 0, conversations: 0, quente: 0 };
      e.sent += 1;
      sdrMap.set(id, e);
    }
    for (const c of conversations) {
      const id = (c.assigned_user_id as string | null) ?? "—";
      const e = sdrMap.get(id) ?? { sent: 0, received: 0, conversations: 0, quente: 0 };
      e.conversations += 1;
      if (c.temperature === "quente") e.quente += 1;
      sdrMap.set(id, e);
    }
    // contar received por sdr (via conversation.assigned_user_id)
    const convAssigned = new Map<string, string | null>();
    for (const c of conversations) convAssigned.set(c.id, (c.assigned_user_id as string | null) ?? null);
    for (const m of inbound) {
      const owner = convAssigned.get(m.conversation_id) ?? "—";
      const key = owner ?? "—";
      const e = sdrMap.get(key) ?? { sent: 0, received: 0, conversations: 0, quente: 0 };
      e.received += 1;
      sdrMap.set(key, e);
    }
    const sdrIds = Array.from(sdrMap.keys()).filter((id) => id !== "—");
    let profiles: Array<{ id: string; full_name: string | null; email: string | null }> = [];
    if (sdrIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", sdrIds);
      profiles = (profs as typeof profiles) ?? [];
    }
    const profMap = new Map(profiles.map((p) => [p.id, p]));
    const bySdr = Array.from(sdrMap.entries())
      .map(([id, v]) => ({
        user_id: id,
        name: id === "—" ? "Sem atribuição" : (profMap.get(id)?.full_name || profMap.get(id)?.email || id.slice(0, 8)),
        ...v,
      }))
      .sort((a, b) => b.sent + b.received - (a.sent + a.received));

    // --- por campanha ---
    const { data: campRows, error: campErr } = await supabase
      .from("whatsapp_campaigns")
      .select("id, name, status, created_at")
      .gte("created_at", fromISO)
      .lte("created_at", toISO)
      .order("created_at", { ascending: false })
      .limit(50);
    if (campErr) throw new Error(campErr.message);
    const campaigns = campRows ?? [];
    const campIds = campaigns.map((c) => c.id);
    let byCampaign: Array<{
      id: string; name: string; status: string;
      total: number; sent: number; delivered: number; read: number; failed: number;
    }> = [];
    if (campIds.length > 0) {
      const { data: cmsgs } = await supabase
        .from("whatsapp_campaign_messages")
        .select("campaign_id, status")
        .in("campaign_id", campIds);
      const cm = (cmsgs as Array<{ campaign_id: string; status: string }>) ?? [];
      byCampaign = campaigns.map((c) => {
        const items = cm.filter((x) => x.campaign_id === c.id);
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          total: items.length,
          sent: items.filter((x) => ["sent", "delivered", "read"].includes(x.status)).length,
          delivered: items.filter((x) => ["delivered", "read"].includes(x.status)).length,
          read: items.filter((x) => x.status === "read").length,
          failed: items.filter((x) => x.status === "failed").length,
        };
      });
    }

    // --- automações ---
    const { data: autoLogs } = await supabase
      .from("whatsapp_automation_logs")
      .select("status, rule_id, executed_at")
      .gte("executed_at", fromISO)
      .lte("executed_at", toISO)
      .limit(5000);
    const al = (autoLogs as Array<{ status: string; rule_id: string }>) ?? [];
    const automations = {
      executed: al.length,
      sent: al.filter((l) => l.status === "sent").length,
      skipped: al.filter((l) => l.status === "skipped").length,
      failed: al.filter((l) => l.status === "failed").length,
    };

    return {
      period: { from: fromISO, to: toISO },
      totals: {
        outbound: outbound.length,
        inbound: inbound.length,
        delivered,
        read,
        failed,
        deliveryRate: outbound.length > 0 ? delivered / outbound.length : 0,
        readRate: outbound.length > 0 ? read / outbound.length : 0,
        newConvs,
        activeConvs: statusCounts.open + statusCounts.pending,
      },
      statusCounts,
      tempCounts,
      avgFirstResponseMin,
      series,
      bySdr,
      byCampaign,
      automations,
    };
  });