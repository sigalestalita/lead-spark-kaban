import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeLeadType } from "./lead-type";
import { notifyNewLead } from "./lead-notify.server";

const SPREADSHEET_ID = "1gGib1CJCUaS-1xNKBrexP7OzuY87u_ZDWehsJdz1U5A";
const SHEETS: Array<{ tab: string; source: string; channel: string }> = [
  { tab: "entrada_correta", source: "meta_ads", channel: "meta_ads" },
  { tab: "entrada_organico_e_outbound", source: "organico_outbound", channel: "organico_outbound" },
];
const SHEET_RANGES = SHEETS.map((s) => `${s.tab}!A2:W`);
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
const SYNC_MIN_INTERVAL_MS = 90_000;

// Índices das colunas (A=0..W=22)
const C = {
  data: 0,
  tipo: 1,
  nome: 2,
  sobrenome: 3,
  telefone: 4,
  email: 5,
  empresa: 7,
  area: 8,
  porte: 9,
  cargo: 10,
  dor: 11,
  demo_free: 12,
  campanha: 13,
  conjunto: 14,
  ad: 15,
  campanha_id: 17,
  adset_id: 18,
  ad_id: 19,
  form_id: 21,
  lead_id: 22,
};

function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 11) return `+55${digits}`;
  return `+${digits}`;
}

function cleanStr(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s || s === ".") return null;
  return s;
}

function parseDate(v: unknown): string | null {
  const s = cleanStr(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseDemoFree(v: unknown): boolean | null {
  const s = cleanStr(v);
  if (!s) return null;
  const t = s.toLowerCase();
  if (/^(sim|s|yes|y|true|1|x|✓)$/.test(t)) return true;
  if (/^(não|nao|n|no|false|0)$/.test(t)) return false;
  return null;
}

type LeadRow = {
  meta_lead_id: string;
  source: string;
  channel: string;
  payload: {
    name: string;
    email: string | null;
    phone: string | null;
    company_name: string | null;
    position: string | null;
    company_segment: string | null;
    company_size: string | null;
    probable_pain: string | null;
    demo_free: boolean | null;
    demo_free_raw: string | null;
    campaign: string | null;
    ad_name: string | null;
    form_name: string | null;
    submitted_at: string | null;
    form_payload: Record<string, unknown>;
  };
};

type SheetFetchResult =
  | { ok: true; rows: Array<{ row: string[]; sheetIndex: number; rowIndex: number }> }
  | { ok: false; status: number; message: string; rateLimited: boolean };

function hashRow(parts: Array<string | null>): string {
  let h = 0;
  const s = parts.map((p) => p ?? "").join("|");
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function rowToLead(row: string[], sheetIndex: number, rowIndex: number): LeadRow | null {
  const sheet = SHEETS[sheetIndex] ?? SHEETS[0];
  const nome = cleanStr(row[C.nome]) ?? "";
  const sobrenome = cleanStr(row[C.sobrenome]) ?? "";
  const name = `${nome} ${sobrenome}`.trim() || "(sem nome)";
  const email = cleanStr(row[C.email]);
  const phone = normalizePhone(cleanStr(row[C.telefone]));
  let leadId = cleanStr(row[C.lead_id]);
  if (!leadId) {
    // Fallback estável para abas sem Lead_ID (organico/outbound):
    // usa email/phone se houver, senão hash do conteúdo + posição.
    const base = email ?? phone ?? hashRow([
      cleanStr(row[C.data]),
      nome,
      sobrenome,
      cleanStr(row[C.empresa]),
      cleanStr(row[C.cargo]),
      String(rowIndex),
    ]);
    leadId = `${sheet.tab}:${base}`;
  }
  // Se a linha estiver totalmente vazia (sem nome, email, phone, empresa), ignora.
  if (!nome && !sobrenome && !email && !phone && !cleanStr(row[C.empresa])) return null;
  return {
    meta_lead_id: leadId,
    source: sheet.source,
    channel: sheet.channel,
    payload: {
      name,
      email,
      phone,
      company_name: cleanStr(row[C.empresa]),
      position: cleanStr(row[C.cargo]),
      company_segment: cleanStr(row[C.area]),
      company_size: cleanStr(row[C.porte]),
      probable_pain: cleanStr(row[C.dor]),
      demo_free: parseDemoFree(row[C.demo_free]),
      demo_free_raw: cleanStr(row[C.demo_free]),
      campaign: cleanStr(row[C.campanha]),
      ad_name: cleanStr(row[C.ad]),
      form_name: cleanStr(row[C.form_id]),
      submitted_at: parseDate(row[C.data]),
      form_payload: {
        lead_id: leadId,
        sheet_tab: sheet.tab,
        form_id: cleanStr(row[C.form_id]),
        lead_type: cleanStr(row[C.tipo]),
        demo_free_raw: cleanStr(row[C.demo_free]),
        ad_set: cleanStr(row[C.conjunto]),
        meta_ids: {
          campaign_id: cleanStr(row[C.campanha_id]),
          adset_id: cleanStr(row[C.adset_id]),
          ad_id: cleanStr(row[C.ad_id]),
        },
        submitted_at: parseDate(row[C.data]),
      },
    },
  };
}

async function fetchSheetRows(): Promise<SheetFetchResult> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
  if (!LOVABLE_API_KEY) return { ok: false, status: 500, message: "LOVABLE_API_KEY ausente", rateLimited: false };
  if (!GOOGLE_SHEETS_API_KEY) {
    return { ok: false, status: 500, message: "GOOGLE_SHEETS_API_KEY ausente — conecte o Google Sheets em Connectors", rateLimited: false };
  }
  const params = SHEET_RANGES.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  const url = `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values:batchGet?${params}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_SHEETS_API_KEY,
    },
  }).catch(() => null);
  if (!res) {
    return { ok: false, status: 503, message: "Falha temporária ao consultar o Google Sheets", rateLimited: false };
  }
  if (!res.ok) {
    const body = await res.text();
    const rateLimited = res.status === 429 || body.includes('"code": 429') || body.includes("Quota exceeded");
    return {
      ok: false,
      status: res.status,
      message: `Google Sheets API ${res.status}: ${body.slice(0, 300)}`,
      rateLimited,
    };
  }
  const json = (await res.json()) as { valueRanges?: Array<{ values?: string[][] }> };
  const rows: Array<{ row: string[]; sheetIndex: number; rowIndex: number }> = [];
  (json.valueRanges ?? []).forEach((vr, sheetIndex) => {
    (vr.values ?? []).forEach((r, rowIndex) => {
      rows.push({ row: r, sheetIndex, rowIndex });
    });
  });
  return { ok: true, rows };
}

export const syncLeadsFromSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(5000).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Throttle: não buscar a planilha se já tentamos sincronizar há pouco.
    const { data: prev } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "sheets_sync_state")
      .maybeSingle();
    const prevState = (prev?.value ?? null) as null | { last_sync_at?: string; last_attempt_at?: string };
    const lastAttempt = prevState?.last_attempt_at ?? prevState?.last_sync_at;
    if (lastAttempt) {
      const ageMs = Date.now() - new Date(lastAttempt).getTime();
      if (ageMs < SYNC_MIN_INTERVAL_MS) {
        return { total: 0, parsed: 0, inserted: 0, skipped: 0, throttled: true, retry_after_ms: SYNC_MIN_INTERVAL_MS - ageMs };
      }
    }

    const startedAt = new Date().toISOString();
    await supabase.from("app_settings").upsert(
      { key: "sheets_sync_state", value: { ...(prevState ?? {}), last_attempt_at: startedAt, status: "running" } as never } as never,
      { onConflict: "key" },
    );

    const sheetResult = await fetchSheetRows();
    if (!sheetResult.ok) {
      const stateValue = {
        ...(prevState ?? {}),
        last_attempt_at: startedAt,
        last_error_at: new Date().toISOString(),
        last_error: sheetResult.message,
        status: sheetResult.rateLimited ? "rate_limited" : "error",
      };
      await supabase.from("app_settings").upsert(
        { key: "sheets_sync_state", value: stateValue as never } as never,
        { onConflict: "key" },
      );
      await supabase.from("integration_logs").insert({
        provider: "google_sheets",
        action: "sync_leads",
        status: sheetResult.rateLimited ? "rate_limited" : "error",
        detail: { error: sheetResult.message, status: sheetResult.status } as never,
      });
      return {
        total: 0,
        parsed: 0,
        inserted: 0,
        skipped: 0,
        rate_limited: sheetResult.rateLimited,
        error: sheetResult.message,
      };
    }
    const rows = sheetResult.rows;
    const total = rows.length;

    const parsed: LeadRow[] = [];
    const seen = new Set<string>();
    for (const item of rows) {
      const r = rowToLead(item.row, item.sheetIndex, item.rowIndex);
      if (!r) continue;
      if (seen.has(r.meta_lead_id)) continue;
      seen.add(r.meta_lead_id);
      parsed.push(r);
    }

    // Buscar todos os lead_ids já importados via Meta (paginando para evitar o limite de 1000).
    const existingIds = new Set<string>();
    const existingEmails = new Set<string>();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data: rows2, error } = await supabase
        .from("leads")
        .select("email, form_payload")
        .range(from, from + PAGE - 1);
      if (error || !rows2 || rows2.length === 0) break;
      for (const r of rows2) {
        const rr = r as { email: string | null; form_payload: { lead_id?: string } | null };
        const lid = rr.form_payload?.lead_id;
        if (lid) existingIds.add(lid);
        if (rr.email) existingEmails.add(rr.email.toLowerCase());
      }
      if (rows2.length < PAGE) break;
    }

    // Dedup também por email (índice único em lower(email)) para evitar
    // que um único conflito derrube o chunk inteiro.
    const seenEmail = new Set<string>();
    const toInsert = parsed.filter((p) => {
      if (existingIds.has(p.meta_lead_id)) return false;
      const em = p.payload.email?.toLowerCase() ?? null;
      if (em) {
        if (existingEmails.has(em)) return false;
        if (seenEmail.has(em)) return false;
        seenEmail.add(em);
      }
      return true;
    });
    const limit = data.limit ?? toInsert.length;
    const batch = toInsert.slice(0, limit);

    // Stage "novo"
    const { data: novo } = await supabase
      .from("stages")
      .select("id")
      .eq("slug", "novo")
      .maybeSingle();
    const novoId = novo?.id ?? null;

    let inserted = 0;
    const insertErrors: string[] = [];
    const insertedLeads: Array<{
      id: string;
      name: string;
      company_name: string | null;
      lead_type: string | null;
      score: number | null;
      priority: string | null;
    }> = [];
    const CHUNK = 100;
    for (let i = 0; i < batch.length; i += CHUNK) {
      const slice = batch.slice(i, i + CHUNK);
      const chunk = slice.map((p) => {
        const createdAt = p.payload.submitted_at ?? new Date().toISOString();
        return {
          name: p.payload.name,
          email: p.payload.email,
          phone: p.payload.phone,
          company_name: p.payload.company_name,
          original_company_name: p.payload.company_name,
          position: p.payload.position,
          company_segment: p.payload.company_segment,
          company_size: p.payload.company_size,
          probable_pain: p.payload.probable_pain,
          demo_free: p.payload.demo_free,
          campaign: p.payload.campaign,
          ad_name: p.payload.ad_name,
          form_name: p.payload.form_name,
          source: p.source,
          channel: p.channel,
          stage_id: novoId,
          enrichment_status: "pending" as const,
          form_payload: p.payload.form_payload as never,
          lead_type: normalizeLeadType(
            (p.payload.form_payload as { lead_type?: string } | null)?.lead_type ?? null,
          ),
          created_at: createdAt,
          last_action_at: createdAt,
          stage_entered_at: createdAt,
        };
      });
      const { data: insData, error } = await supabase
        .from("leads")
        .insert(chunk as never)
        .select("id, name, company_name, lead_type, score, priority");
      if (!error) {
        inserted += chunk.length;
        for (const r of insData ?? []) {
          insertedLeads.push(r as never);
        }
        continue;
      }
      // Fallback row-by-row para isolar conflitos (email duplicado, etc.).
      for (const row of chunk) {
        const { data: rowData, error: rowErr } = await supabase
          .from("leads")
          .insert(row as never)
          .select("id, name, company_name, lead_type, score, priority")
          .maybeSingle();
        if (!rowErr) {
          inserted += 1;
          if (rowData) insertedLeads.push(rowData as never);
        } else if (insertErrors.length < 10) insertErrors.push(rowErr.message);
      }
    }

    // Disparar notificações por e-mail (não bloqueia o resultado da sync).
    await Promise.allSettled(
      insertedLeads.map((l) =>
        notifyNewLead({
          id: l.id,
          name: l.name,
          company_name: l.company_name,
          lead_type: (l.lead_type as never) ?? null,
          score: l.score,
          priority: l.priority,
        }),
      ),
    );

    const skipped = parsed.length - inserted;
    const stateValue = {
      last_attempt_at: startedAt,
      last_sync_at: new Date().toISOString(),
      status: insertErrors.length ? "partial" : "ok",
      total_rows: total,
      parsed: parsed.length,
      inserted_total_run: inserted,
      skipped_existing: existingIds.size,
      insert_errors: insertErrors,
    };
    await supabase.from("app_settings").upsert(
      { key: "sheets_sync_state", value: stateValue as never } as never,
      { onConflict: "key" },
    );
    await supabase.from("integration_logs").insert({
      provider: "google_sheets",
      action: "sync_leads",
      status: insertErrors.length ? "partial" : "ok",
      detail: { total, parsed: parsed.length, inserted, skipped, insert_errors: insertErrors } as never,
    });

    return { total, parsed: parsed.length, inserted, skipped };
  });

export const getSheetSyncState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("app_settings")
      .select("value, updated_at")
      .eq("key", "sheets_sync_state")
      .maybeSingle();
    return {
      state: (data?.value ?? null) as null | {
        last_sync_at?: string;
        total_rows?: number;
        parsed?: number;
        inserted_total_run?: number;
        skipped_existing?: number;
      },
      updated_at: data?.updated_at ?? null,
      spreadsheet_url: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`,
    };
  });

/** Backfill: lê a planilha e popula `demo_free` nos leads já importados. */
export const backfillDemoFreeFromSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    const { data: isSuper } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (!isAdmin && !isSuper) throw new Error("Forbidden");

    const sheetResult = await fetchSheetRows();
    if (!sheetResult.ok) {
      return { ok: false as const, error: sheetResult.message };
    }
    const parsed: Array<{ lead_id: string; demo_free: boolean }> = [];
    for (const item of sheetResult.rows) {
      const r = rowToLead(item.row, item.sheetIndex, item.rowIndex);
      if (!r) continue;
      if (r.payload.demo_free === null) continue;
      parsed.push({ lead_id: r.meta_lead_id, demo_free: r.payload.demo_free });
    }
    let updated = 0;
    for (const p of parsed) {
      const { data: rows, error } = await supabase
        .from("leads")
        .update({ demo_free: p.demo_free } as never)
        .filter("form_payload->>lead_id", "eq", p.lead_id)
        .select("id");
      if (!error && rows && rows.length > 0) updated += rows.length;
    }
    return { ok: true as const, scanned: parsed.length, updated };
  });