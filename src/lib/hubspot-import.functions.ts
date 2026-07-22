import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getHubspotImportState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: role } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!role) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: state }, { count: contactsCount }, { count: companiesCount }, { count: dealsCount }, { count: ownersCount }] = await Promise.all([
      supabaseAdmin.from("hs_import_state").select("*").order("object_type"),
      supabaseAdmin.from("hs_contacts").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("hs_companies").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("hs_deals").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("hs_owners").select("*", { count: "exact", head: true }),
    ]);
    const tokenConfigured = Boolean(process.env.HUBSPOT_PRIVATE_APP_TOKEN);
    return {
      tokenConfigured,
      state: state ?? [],
      counts: { contacts: contactsCount ?? 0, companies: companiesCount ?? 0, deals: dealsCount ?? 0, owners: ownersCount ?? 0 },
    };
  });

export const startHubspotImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: role } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!role) throw new Error("Forbidden");
    const { startImportAll } = await import("./hubspot-import.server");
    await startImportAll();
    return { ok: true };
  });

export const runHubspotImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { objectType: "owners" | "contacts" | "companies" | "deals"; maxPages?: number }) =>
    z.object({
      objectType: z.enum(["owners", "contacts", "companies", "deals"]),
      maxPages: z.number().int().min(1).max(20).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!role) throw new Error("Forbidden");
    const { runImportBatch } = await import("./hubspot-import.server");
    return runImportBatch(data.objectType, data.maxPages ?? 5);
  });

export const pauseHubspotImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { objectType: "owners" | "contacts" | "companies" | "deals" }) =>
    z.object({ objectType: z.enum(["owners", "contacts", "companies", "deals"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!role) throw new Error("Forbidden");
    const { pauseImport } = await import("./hubspot-import.server");
    await pauseImport(data.objectType);
    return { ok: true };
  });

export const resetHubspotImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { objectType: "owners" | "contacts" | "companies" | "deals" }) =>
    z.object({ objectType: z.enum(["owners", "contacts", "companies", "deals"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!role) throw new Error("Forbidden");
    const { resetImport } = await import("./hubspot-import.server");
    await resetImport(data.objectType);
    return { ok: true };
  });
