import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SPREADSHEET_ID = "1gGib1CJCUaS-1xNKBrexP7OzuY87u_ZDWehsJdz1U5A";
const SHEET_RANGE = "entrada_correta!A2:W";
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

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

type LeadRow = {
  meta_lead_id: string;
  payload: {
    name: string;
    email: string | null;
    phone: string | null;
    company_name: string | null;
    position: string | null;
    company_segment: string | null;
    company_size: string | null;
    probable_pain: string | null;
    campaign: string | null;
    ad_name: string | null;
    form_name: string | null;
    submitted_at: string | null;
    form_payload: Record<string, unknown>;
  };
};

function rowToLead(row: string[]): LeadRow | null {
  const leadId = cleanStr(row[C.lead_id]);
  if (!leadId) return null;
  const nome = cleanStr(row[C.nome]) ?? "";
  const sobrenome = cleanStr(row[C.sobrenome]) ?? "";
  const name = `${nome} ${sobrenome}`.trim() || "(sem nome)";
  return {
    meta_lead_id: leadId,
    payload: {
      name,
      email: cleanStr(row[C.email]),
      phone: normalizePhone(cleanStr(row[C.telefone])),
      company_name: cleanStr(row[C.empresa]),
      position: cleanStr(row[C.cargo]),
      company_segment: cleanStr(row[C.area]),
      company_size: cleanStr(row[C.porte]),
      probable_pain: cleanStr(row[C.dor]),
      campaign: cleanStr(row[C.campanha]),
      ad_name: cleanStr(row[C.ad]),
      form_name: cleanStr(row[C.form_id]),
      submitted_at: parseDate(row[C.data]),
      form_payload: {
        lead_id: leadId,
        form_id: cleanStr(row[C.form_id]),
        lead_type: cleanStr(row[C.tipo]),
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

async function fetchSheetRows(): Promise<string[][]> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");
  if (!GOOGLE_SHEETS_API_KEY) throw new Error("GOOGLE_SHEETS_API_KEY ausente — conecte o Google Sheets em Connectors");
  const url = `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_RANGE}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_SHEETS_API_KEY,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Sheets API ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { values?: string[][] };
  return json.values ?? [];
}

export const syncLeadsFromSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(5000).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const rows = await fetchSheetRows();
    const total = rows.length;

    const parsed: LeadRow[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const r = rowToLead(row);
      if (!r) continue;
      if (seen.has(r.meta_lead_id)) continue;
      seen.add(r.meta_lead_id);
      parsed.push(r);
    }

    // Buscar todos os lead_ids já importados via Meta (paginando para evitar o limite de 1000).
    const existingIds = new Set<string>();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data: rows2, error } = await supabase
        .from("leads")
        .select("form_payload")
        .eq("source", "meta_ads")
        .range(from, from + PAGE - 1);
      if (error || !rows2 || rows2.length === 0) break;
      for (const r of rows2) {
        const lid = (r as { form_payload: { lead_id?: string } | null }).form_payload?.lead_id;
        if (lid) existingIds.add(lid);
      }
      if (rows2.length < PAGE) break;
    }

    const toInsert = parsed.filter((p) => !existingIds.has(p.meta_lead_id));
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
    const CHUNK = 100;
    for (let i = 0; i < batch.length; i += CHUNK) {
      const chunk = batch.slice(i, i + CHUNK).map((p) => {
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
          campaign: p.payload.campaign,
          ad_name: p.payload.ad_name,
          form_name: p.payload.form_name,
          source: "meta_ads",
          channel: "meta_ads",
          stage_id: novoId,
          enrichment_status: "pending" as const,
          form_payload: p.payload.form_payload as never,
          created_at: createdAt,
          last_action_at: createdAt,
          stage_entered_at: createdAt,
        };
      });
      const { error, count } = await supabase
        .from("leads")
        .insert(chunk as never, { count: "exact" });
      if (!error) inserted += count ?? chunk.length;
    }

    const skipped = parsed.length - inserted;
    const stateValue = {
      last_sync_at: new Date().toISOString(),
      total_rows: total,
      parsed: parsed.length,
      inserted_total_run: inserted,
      skipped_existing: existingIds.size,
    };
    await supabase.from("app_settings").upsert(
      { key: "sheets_sync_state", value: stateValue as never } as never,
      { onConflict: "key" },
    );
    await supabase.from("integration_logs").insert({
      provider: "google_sheets",
      action: "sync_leads",
      status: "ok",
      detail: { total, parsed: parsed.length, inserted, skipped } as never,
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