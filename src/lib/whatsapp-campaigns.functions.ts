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
    companySizes: z.array(z.string()).optional(),
    emailDomains: z.array(z.string()).optional(),
  })
  .default({});
type AudienceFiltersT = z.infer<typeof AudienceFilters>;
export type CampaignAudienceFilters = AudienceFiltersT;

const PhoneEntry = z.object({
  phone: z.string().min(6).max(40),
  name: z.string().max(160).optional(),
  company: z.string().max(160).optional(),
});
export type CampaignPhoneEntry = z.infer<typeof PhoneEntry>;

const Audience = z
  .object({
    source: z.enum(["filters", "phones"]).default("filters"),
    filters: AudienceFilters.optional(),
    phones: z.array(PhoneEntry).max(5000).optional(),
  })
  .default({ source: "filters" });
export type CampaignAudience = z.infer<typeof Audience>;

/** Parser tolerante: aceita o formato antigo (filtros diretos) e o novo (com source). */
function parseAudience(raw: unknown): CampaignAudience {
  if (raw && typeof raw === "object" && "source" in (raw as Record<string, unknown>)) {
    return Audience.parse(raw);
  }
  return Audience.parse({ source: "filters", filters: AudienceFilters.parse(raw ?? {}) });
}

function normPhone(raw: string): string {
  const digits = raw.replace(/\D+/g, "").replace(/^0+/, "");
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
}

function normDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, "");
}

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
  .inputValidator((d) =>
    z
      .object({
        // legado
        filters: AudienceFilters.optional(),
        // novo
        audience: Audience.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const audience = data.audience ?? parseAudience(data.filters ?? {});

    if (audience.source === "phones") {
      const phones = (audience.phones ?? []).map((p) => ({ ...p, phone: normPhone(p.phone) })).filter((p) => p.phone);
      return {
        count: phones.length,
        sample: phones.slice(0, 20).map((p, i) => ({
          id: `phone-${i}`,
          name: p.name ?? null,
          company_name: p.company ?? null,
          phone: p.phone,
          priority: null,
          stage_id: null,
        })),
      };
    }

    const f = audience.filters ?? {};
    let q = supabase.from("leads").select("id, name, company_name, phone, priority, stage_id", { count: "exact" });
    if (f.stageIds?.length) q = q.in("stage_id", f.stageIds);
    if (f.priorities?.length) q = q.in("priority", f.priorities);
    if (f.demoFree === "yes") q = q.eq("demo_free", true);
    if (f.demoFree === "no") q = q.eq("demo_free", false);
    if (f.assignedToMe) q = q.eq("assigned_to", userId);
    if (f.leadType?.length) q = q.in("lead_type", f.leadType);
    if (f.companySizes?.length) q = q.in("company_size", f.companySizes);
    if (f.emailDomains?.length) {
      const ors = f.emailDomains.map((d) => `email.ilike.%@${normDomain(d)}`).join(",");
      q = q.or(ors);
    }
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
        filters: AudienceFilters.optional(),
        audience: Audience.optional(),
        scheduledAt: z.string().datetime().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const audience = data.audience ?? parseAudience(data.filters ?? {});
    const { data: row, error } = await supabase
      .from("whatsapp_campaigns")
      .insert({
        name: data.name,
        template_id: data.templateId,
        account_id: data.accountId ?? null,
        audience_filters: audience,
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

    const audience = parseAudience(campaign.audience_filters ?? {});

    // imports server-only
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getProvider } = await import("./whatsapp/provider-registry.server");

    type Target = { id: string; name: string | null; company_name: string | null; phone: string | null; assigned_to: string | null };
    let targets: Target[] = [];

    if (audience.source === "phones") {
      const entries = (audience.phones ?? []).slice(0, data.limit);
      for (const e of entries) {
        const phone = normPhone(e.phone);
        if (!phone) continue;
        // tenta achar lead existente pelo final do telefone
        const tail = phone.slice(-8);
        const { data: match } = await supabaseAdmin
          .from("leads")
          .select("id, name, company_name, phone, assigned_to")
          .filter("phone", "ilike", `%${tail}%`)
          .limit(1)
          .maybeSingle();
        if (match) {
          targets.push(match as Target);
          continue;
        }
        const ins = await supabaseAdmin
          .from("leads")
          .insert({
            name: e.name?.trim() || `+${phone}`,
            phone,
            company_name: e.company?.trim() || null,
            source: "campaign_upload",
          })
          .select("id, name, company_name, phone, assigned_to")
          .single();
        if (ins.data) targets.push(ins.data as Target);
      }
    } else {
      const f = audience.filters ?? {};
      let q = supabase.from("leads").select("id, name, company_name, phone, assigned_to");
      if (f.stageIds?.length) q = q.in("stage_id", f.stageIds);
      if (f.priorities?.length) q = q.in("priority", f.priorities);
      if (f.demoFree === "yes") q = q.eq("demo_free", true);
      if (f.demoFree === "no") q = q.eq("demo_free", false);
      if (f.assignedToMe) q = q.eq("assigned_to", userId);
      if (f.leadType?.length) q = q.in("lead_type", f.leadType);
      if (f.companySizes?.length) q = q.in("company_size", f.companySizes);
      if (f.emailDomains?.length) {
        const ors = f.emailDomains.map((d) => `email.ilike.%@${normDomain(d)}`).join(",");
        q = q.or(ors);
      }
      q = q.not("phone", "is", null).limit(data.limit);
      const { data: leads, error: lErr } = await q;
      if (lErr) throw new Error(lErr.message);
      targets = (leads ?? []) as Target[];
    }

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

    const accountQuery = campaign.account_id
      ? supabaseAdmin.from("whatsapp_accounts").select("*").eq("id", campaign.account_id).maybeSingle()
      : supabaseAdmin.from("whatsapp_accounts").select("*").eq("is_default", true).maybeSingle();
    const { data: account } = await accountQuery;
    if (!account) throw new Error("Nenhuma conta de WhatsApp configurada");
    const provider = getProvider(account.provider);

    let sent = 0;
    let failed = 0;

    for (const lead of targets) {
      const phone = normPhone(lead.phone ?? "");
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
    const [{ data: stages }, { data: types }, { data: sizes }] = await Promise.all([
      supabase.from("stages").select("id, name, position").order("position"),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      supabase.from("leads").select("lead_type").not("lead_type", "is", null).limit(2000),
      supabase.from("leads").select("company_size").not("company_size", "is", null).limit(2000),
    ]);
    const leadTypes = Array.from(
      new Set((types ?? []).map((r) => (r as { lead_type: string | null }).lead_type).filter(Boolean) as string[]),
    );
    const companySizes = Array.from(
      new Set((sizes ?? []).map((r) => (r as { company_size: string | null }).company_size).filter(Boolean) as string[]),
    ).sort();
    return { stages: stages ?? [], leadTypes, companySizes };
  });