import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const listInput = z.object({
  objectType: z.enum(["contacts", "companies", "deals", "owners"]),
  search: z.string().trim().max(200).optional().default(""),
  page: z.number().int().min(0).max(10000).default(0),
  pageSize: z.number().int().min(10).max(100).default(50),
});

export const listHubspotRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.input<typeof listInput>) => listInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!role) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const table =
      data.objectType === "contacts" ? "hs_contacts" :
      data.objectType === "companies" ? "hs_companies" :
      data.objectType === "deals" ? "hs_deals" : "hs_owners";

    const from = data.page * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = supabaseAdmin.from(table).select("*", { count: "exact" });

    const s = data.search.trim();
    if (s) {
      if (data.objectType === "contacts") {
        q = q.or(`email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%,company_name.ilike.%${s}%,phone.ilike.%${s}%`);
      } else if (data.objectType === "companies") {
        q = q.or(`name.ilike.%${s}%,domain.ilike.%${s}%,cnpj.ilike.%${s}%`);
      } else if (data.objectType === "deals") {
        q = q.ilike("dealname", `%${s}%`);
      } else {
        q = q.or(`email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%`);
      }
    }

    const sortCol = data.objectType === "owners" ? "updated_at" : "hs_updated_at";
    q = q.order(sortCol as any, { ascending: false, nullsFirst: false }).range(from, to);

    const { data: rows, count, error } = await q;
    if (error) throw error;
    return { rows: rows ?? [], count: count ?? 0, page: data.page, pageSize: data.pageSize };
  });
