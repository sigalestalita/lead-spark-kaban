import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- COMERCIAL ----------
export const listDeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("commercial_deals")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { deals: data ?? [] };
  });

export const createDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        title: z.string().min(1),
        company_name: z.string().optional().nullable(),
        amount: z.number().optional().nullable(),
        stage: z.enum(["novo", "qualificado", "proposta", "negociacao", "ganho", "perdido"]).default("novo"),
        lead_id: z.string().uuid().optional().nullable(),
        expected_close_date: z.string().optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("commercial_deals")
      .insert({ ...data, owner_user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateDealStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        stage: z.enum(["novo", "qualificado", "proposta", "negociacao", "ganho", "perdido"]),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("commercial_deals")
      .update({ stage: data.stage })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCommercialStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("commercial_deals")
      .select("stage, amount");
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const byStage: Record<string, { count: number; total: number }> = {};
    for (const r of rows) {
      const s = r.stage as string;
      const amt = Number(r.amount ?? 0);
      byStage[s] = byStage[s] ?? { count: 0, total: 0 };
      byStage[s].count++;
      byStage[s].total += amt;
    }
    const won = byStage["ganho"] ?? { count: 0, total: 0 };
    const open = rows.filter((r) => !["ganho", "perdido"].includes(r.stage as string));
    return {
      totalDeals: rows.length,
      wonCount: won.count,
      wonAmount: won.total,
      openCount: open.length,
      openAmount: open.reduce((s, r) => s + Number(r.amount ?? 0), 0),
      byStage,
    };
  });

// ---------- CS ----------
export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cs_customers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { customers: data ?? [] };
  });

export const updateCustomerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["onboarding", "ativo", "em_risco", "churn"]),
        health_score: z.number().min(0).max(100).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const patch: { status: "onboarding" | "ativo" | "em_risco" | "churn"; health_score?: number; churned_at?: string } = {
      status: data.status,
    };
    if (data.health_score != null) patch.health_score = data.health_score;
    if (data.status === "churn") patch.churned_at = new Date().toISOString().slice(0, 10);
    const { error } = await context.supabase.from("cs_customers").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCsStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cs_customers")
      .select("status, mrr, health_score");
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const active = rows.filter((r) => r.status === "ativo" || r.status === "em_risco");
    const mrr = active.reduce((s, r) => s + Number(r.mrr ?? 0), 0);
    const avgHealth =
      rows.length > 0
        ? Math.round(rows.reduce((s, r) => s + Number(r.health_score ?? 0), 0) / rows.length)
        : 0;
    return {
      total: rows.length,
      onboarding: rows.filter((r) => r.status === "onboarding").length,
      active: rows.filter((r) => r.status === "ativo").length,
      atRisk: rows.filter((r) => r.status === "em_risco").length,
      churn: rows.filter((r) => r.status === "churn").length,
      mrr,
      avgHealth,
    };
  });

// ---------- FINANCEIRO ----------
export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("finance_invoices")
      .select("*, cs_customers(company_name)")
      .order("due_date", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { invoices: data ?? [] };
  });

export const updateInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pendente", "pago", "atrasado", "cancelado"]),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const patch: { status: "pendente" | "pago" | "atrasado" | "cancelado"; paid_at?: string } = { status: data.status };
    if (data.status === "pago") patch.paid_at = new Date().toISOString().slice(0, 10);
    const { error } = await context.supabase.from("finance_invoices").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getFinanceStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("finance_invoices")
      .select("status, amount, due_date, paid_at");
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const paid = rows.filter((r) => r.status === "pago");
    const pending = rows.filter((r) => r.status === "pendente");
    const overdue = rows.filter(
      (r) => r.status === "atrasado" || (r.status === "pendente" && (r.due_date as string) < today),
    );
    return {
      totalInvoices: rows.length,
      paidAmount: paid.reduce((s, r) => s + Number(r.amount ?? 0), 0),
      pendingAmount: pending.reduce((s, r) => s + Number(r.amount ?? 0), 0),
      overdueAmount: overdue.reduce((s, r) => s + Number(r.amount ?? 0), 0),
      overdueCount: overdue.length,
    };
  });
