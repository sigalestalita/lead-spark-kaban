import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderTemplate } from "./whatsapp-templates.functions";

const AudienceFilters = z
  .object({
    stageIds: z.array(z.string().uuid()).optional(),
    priorities: z.array(z.enum(["alta", "media", "baixa"])).optional(),
    demoFree: z.enum(["any", "yes", "no"]).optional(),
    assignedToMe: z.boolean().optional(),
    leadType: z.array(z.string()).optional(),
  })
  .default({});
type AudienceFiltersT = z.infer<typeof AudienceFilters>;

type _AudienceFiltersT = AudienceFiltersT;

/** Lista campanhas com contagem de mensagens. */
export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_campaigns")
      .select("*, whatsapp_templates:template_id(name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { campaigns: data ?? [] };
  });

/** Detalhe da campanha + métricas de envio. */
export const getCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: campaign, error: cErr } = await supabase
      .from("whatsapp_campaigns")
      .select("*, whatsapp_templates:template_id(*)")
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campanha não encontrada");

    const { data: msgs } = await supabase
      .from("whatsapp_campaign_messages")
      .select("*, leads:lead_id(id,name,company_name,phone)")
      .eq("campaign_id", data.id)
      .order("created_at", { ascending: false })
      .limit(500);

    const list = msgs ?? [];
    const stats = {
      total: list.length,
      sent: list.filter((m) => m.status === "sent" || m.status === "delivered" || m.status === "read").length,
      delivered: list.filter((m) => m.status === "delivered" || m.status === "read").length,
      read: list.filter((m) => m.status === "read").length,
      failed: list.filter((m) => m.status === "failed").length,
      pending: list.filter((m) => m.status === "pending").length,
    };

    return { campaign, messages: list, stats };
  });

/** Preview de audiência: conta e amostra de leads. */
export const previewAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ filters: AudienceFilters }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("leads").select("id, name, company_name, phone, priority, stage_id", { count: "exact" });
    if (data.filters.stageIds?.length) q = q.in("stage_id", data.filters.stageIds);
    if (data.filters.priorities?.length) q = q.in("priority", data.filters.priorities);
    if (data.filters.demoFree === "yes") q = q.eq("demo_free", true);
    if (data.filters.demoFree === "no") q = q.eq("demo_free", false);
    if (data.filters.assignedToMe) q = q.eq("assigned_to", userId);
    if (data.filters.leadType?.length) q = q.in("lead_type", data.filters.leadType);
    q = q.not("phone", "is", null).limit(20);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return { count: count ?? 0, sample: rows ?? [] };
  });

/** Cria campanha em rascunho. */
export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(1).max(160),
        templateId: z.string().uuid(),
        accountId: z.string().uuid().nullable().optional(),
        filters: AudienceFilters,
        scheduledAt: z.string().datetime().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("whatsapp_campaigns")
      .insert({
        name: data.name,
        template_id: data.templateId,
        account_id: data.accountId ?? null,
        audience_filters: data.filters,
        status: "draft",
        scheduled_at: data.scheduledAt ?? null,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { campaign: row };
  });

/** Dispara a campanha agora (envia até `limit` mensagens). */
export const launchCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), limit: z.number().int().min(1).max(500).default(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // checa permissão (manager)
    const { data: isMgr } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isMgr) throw new Error("Apenas gestão/admin podem disparar campanhas");

    const { data: campaign, error: cErr } = await supabase
      .from("whatsapp_campaigns")
      .select("*, whatsapp_templates:template_id(*)")
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campanha não encontrada");
    const tmpl = (campaign as { whatsapp_templates: { body: string } | null }).whatsapp_templates;
    if (!tmpl?.body) throw new Error("Template inválido");

    const filters = AudienceFilters.parse(campaign.audience_filters ?? {});

    // monta audiência
    let q = supabase.from("leads").select("id, name, company_name, phone, assigned_to");
    if (filters.stageIds?.length) q = q.in("stage_id", filters.stageIds);
    if (filters.priorities?.length) q = q.in("priority", filters.priorities);
    if (filters.demoFree === "yes") q = q.eq("demo_free", true);
    if (filters.demoFree === "no") q = q.eq("demo_free", false);
    if (filters.assignedToMe) q = q.eq("assigned_to", userId);
    if (filters.leadType?.length) q = q.in("lead_type", filters.leadType);
    q = q.not("phone", "is", null).limit(data.limit);

    const { data: leads, error: lErr } = await q;
    if (lErr) throw new Error(lErr.message);
    const targets = leads ?? [];

    if (targets.length === 0) {
      await supabase
        .from("whatsapp_campaigns")
        .update({ status: "completed", started_at: new Date().toISOString(), completed_at: new Date().toISOString() })
        .eq("id", data.id);
      return { ok: true, queued: 0, sent: 0, failed: 0 };
    }

    await supabase
      .from("whatsapp_campaigns")
      .update({ status: "sending", started_at: new Date().toISOString() })
      .eq("id", data.id);

    // imports server-only
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getProvider } = await import("./whatsapp/provider-registry.server");

    const accountQuery = campaign.account_id
      ? supabaseAdmin.from("whatsapp_accounts").select("*").eq("id", campaign.account_id).maybeSingle()
      : supabaseAdmin.from("whatsapp_accounts").select("*").eq("is_default", true).maybeSingle();
    const { data: account } = await accountQuery;
    if (!account) throw new Error("Nenhuma conta de WhatsApp configurada");
    const provider = getProvider(account.provider);

    let sent = 0;
    let failed = 0;

    for (const lead of targets) {
      const phone = (lead.phone ?? "").replace(/\D+/g, "");
      if (!phone) {
        failed++;
        continue;
      }
      const body = renderTemplate(tmpl.body, {
        nome: lead.name ?? "",
        primeiro_nome: (lead.name ?? "").split(" ")[0] ?? "",
        empresa: lead.company_name ?? "",
      });

      // garante conversa
      let convId: string | null = null;
      const { data: existing } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("id")
        .eq("lead_id", lead.id)
        .maybeSingle();
      if (existing) {
        convId = existing.id;
      } else {
        const { data: created } = await supabaseAdmin
          .from("whatsapp_conversations")
          .insert({
            lead_id: lead.id,
            account_id: account.id,
            assigned_user_id: lead.assigned_to ?? userId,
            status: "open",
          })
          .select("id")
          .single();
        convId = created?.id ?? null;
      }
      if (!convId) {
        failed++;
        continue;
      }

      const { data: msg } = await supabaseAdmin
        .from("whatsapp_messages")
        .insert({
          conversation_id: convId,
          lead_id: lead.id,
          sender_type: "sdr",
          sender_user_id: userId,
          message_type: "text",
          body,
          status: "sending",
        })
        .select("id")
        .single();

      try {
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
          to: phone,
          type: "text",
          body,
        });

        if (msg?.id) {
          await supabaseAdmin
            .from("whatsapp_messages")
            .update({
              provider_message_id: result.providerMessageId,
              status: result.status === "failed" ? "failed" : "sent",
              error: result.error ?? null,
              sent_at: new Date().toISOString(),
            })
            .eq("id", msg.id);
        }

        await supabaseAdmin
          .from("whatsapp_conversations")
          .update({
            last_message_at: new Date().toISOString(),
            last_preview: body.slice(0, 200),
            status: "open",
          })
          .eq("id", convId);

        await supabaseAdmin.from("whatsapp_campaign_messages").insert({
          campaign_id: data.id,
          lead_id: lead.id,
          message_id: msg?.id ?? null,
          status: result.status === "failed" ? "failed" : "sent",
          error: result.error ?? null,
          sent_at: new Date().toISOString(),
        });

        if (result.status === "failed") failed++;
        else sent++;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Falha";
        if (msg?.id) {
          await supabaseAdmin
            .from("whatsapp_messages")
            .update({ status: "failed", error: message })
            .eq("id", msg.id);
        }
        await supabaseAdmin.from("whatsapp_campaign_messages").insert({
          campaign_id: data.id,
          lead_id: lead.id,
          message_id: msg?.id ?? null,
          status: "failed",
          error: message,
        });
        failed++;
      }
    }

    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", data.id);

    return { ok: true, queued: targets.length, sent, failed };
  });

/** Lista estágios e tipos de lead (para o builder de filtros). */
export const getCampaignFilterMeta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: stages }, { data: types }] = await Promise.all([
      supabase.from("stages").select("id, name, order_index").order("order_index"),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      supabase.from("leads").select("lead_type").not("lead_type", "is", null).limit(2000),
    ]);
    const leadTypes = Array.from(
      new Set((types ?? []).map((r) => (r as { lead_type: string | null }).lead_type).filter(Boolean) as string[]),
    );
    return { stages: stages ?? [], leadTypes };
  });