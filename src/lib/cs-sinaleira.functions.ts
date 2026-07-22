import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SHEET_ID = "191ZmqoIwCPrmtL2KxDMMSBpZ3_bSBuCp6_H6b8iRNmY";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows;
}

function toNum(v: string | undefined | null): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

type TabInfo = { gid: string; name: string };

async function listTabs(): Promise<TabInfo[]> {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`);
  const html = await res.text();
  const m = html.match(/bootstrapData\s*=\s*(\{.*?\});/s);
  if (!m) return [];
  const data = m[1];
  const tabs: TabInfo[] = [];
  const re = /\\"(\d+)\\",\[\{\\"1\\":\[\[0,0,\\"([^\\]+)\\"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(data)) !== null) {
    tabs.push({ gid: match[1], name: match[2] });
  }
  return tabs;
}

function pickLatestSinaleiraTab(tabs: TabInfo[]): TabInfo | null {
  const withDate = tabs
    .map((t) => {
      const m = t.name.match(/(\d{4}-\d{2}-\d{2})/);
      return m ? { tab: t, date: m[1] } : null;
    })
    .filter((x): x is { tab: TabInfo; date: string } => x !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (withDate.length > 0) return withDate[0].tab;
  return tabs.find((t) => /sinaleira/i.test(t.name)) ?? null;
}

export const syncSinaleiraPDA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tabs = await listTabs();
    const tab = pickLatestSinaleiraTab(tabs);
    if (!tab) throw new Error("Não foi possível identificar uma aba de Sinaleira na planilha.");
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${tab.gid}`;
    const csvRes = await fetch(csvUrl);
    if (!csvRes.ok) throw new Error(`Falha ao ler CSV da planilha (${csvRes.status})`);
    const csv = await csvRes.text();
    const rows = parseCsv(csv);
    if (rows.length < 2) throw new Error("Planilha vazia.");

    const header = rows[0].map((h) => h.trim());
    const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    const iNome = idx("Nome da Conta");
    const iTipo = idx("Tipo de Conta");
    const iSinal = idx("Sinaleira");
    const iSaldo = idx("Saldo Atual");
    const iDataExp = idx("Data Expiracao dos Creditos");
    const iMeses = idx("Meses Restantes (base creditos)");
    const iMeta = idx("Meta Mensal");
    const iCons = idx("Consumo Ultimo Mes");
    const iComp = idx("Comparativo");
    const iCredTot = idx("Creditos Utilizados (Total)");
    const iDataExpC = idx("Data Expiracao da Conta (informativo)");
    const iMotivo = idx("Motivo Sinaleira");
    const iStatus = idx("Status dos Dados");
    const iDesab = idx("Conta Desabilitada");
    const iBase = idx("baseId");

    const upserts = rows.slice(1)
      .filter((r) => r.some((c) => c && c.trim()))
      .map((r) => ({
        base_id: iBase >= 0 ? (r[iBase] ?? "").trim() || null : null,
        nome: (r[iNome] ?? "").trim(),
        tipo_conta: r[iTipo]?.trim() || null,
        sinaleira: r[iSinal]?.trim().toUpperCase() || null,
        saldo_atual: toNum(r[iSaldo]),
        data_expiracao_creditos: r[iDataExp]?.trim() || null,
        meses_restantes: toNum(r[iMeses]),
        meta_mensal: toNum(r[iMeta]),
        consumo_ultimo_mes: toNum(r[iCons]),
        comparativo: toNum(r[iComp]),
        creditos_utilizados_total: toNum(r[iCredTot]),
        data_expiracao_conta: r[iDataExpC]?.trim() || null,
        motivo_sinaleira: r[iMotivo]?.trim() || null,
        status_dados: r[iStatus]?.trim() || null,
        conta_desabilitada: r[iDesab]?.trim() || null,
        sheet_tab: tab.name,
        synced_at: new Date().toISOString(),
      }))
      .filter((r) => r.nome && r.base_id);

    // Upsert em lotes
    let inserted = 0;
    const chunk = 200;
    for (let i = 0; i < upserts.length; i += chunk) {
      const slice = upserts.slice(i, i + chunk);
      const { error } = await context.supabase
        .from("cs_signal_clients")
        .upsert(slice, { onConflict: "base_id", ignoreDuplicates: false });
      if (error) throw new Error(error.message);
      inserted += slice.length;
    }

    return { ok: true, tab: tab.name, count: inserted };
  });

export const listSinaleiraClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cs_signal_clients")
      .select("*")
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return { clients: data ?? [] };
  });

export const updateSinaleiraClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      id: z.string().uuid(),
      kanban_status: z.string().optional(),
      assigned_user_id: z.string().uuid().nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const patch: { kanban_status?: string; assigned_user_id?: string | null } = {};
    if (data.kanban_status !== undefined) patch.kanban_status = data.kanban_status;
    if (data.assigned_user_id !== undefined) patch.assigned_user_id = data.assigned_user_id;
    const { error } = await context.supabase
      .from("cs_signal_clients")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSinaleiraActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ clientId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { data: acts, error } = await context.supabase
      .from("cs_signal_activities")
      .select("*")
      .eq("client_id", data.clientId)
      .order("performed_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { activities: acts ?? [] };
  });

export const addSinaleiraActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      clientId: z.string().uuid(),
      activity_type: z.enum(["reuniao_estrategica", "onboarding", "masterclass", "outro"]),
      title: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      performed_at: z.string().optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("cs_signal_activities")
      .insert({
        client_id: data.clientId,
        activity_type: data.activity_type,
        title: data.title ?? null,
        notes: data.notes ?? null,
        performed_by_user_id: context.userId,
        performed_at: data.performed_at ?? new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // notificar responsável por email (fire-and-forget)
    try {
      const { data: client } = await context.supabase
        .from("cs_signal_clients")
        .select("id, nome, sinaleira, assigned_user_id")
        .eq("id", data.clientId)
        .maybeSingle();
      const { data: me } = await context.supabase
        .from("profiles")
        .select("full_name")
        .eq("id", context.userId)
        .maybeSingle();
      if (client?.assigned_user_id) {
        const { notifySignalActivity } = await import("./cs-sinaleira-notify.server");
        await notifySignalActivity({
          clientId: client.id,
          clientName: client.nome,
          sinaleira: client.sinaleira,
          activityType: data.activity_type,
          title: data.title ?? null,
          notes: data.notes ?? null,
          performedByName: me?.full_name ?? null,
          assignedUserId: client.assigned_user_id,
        });
      }
    } catch {
      // ignora falha de e-mail
    }

    return row;
  });

export const listCsAssignableUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return { users: data ?? [] };
  });
