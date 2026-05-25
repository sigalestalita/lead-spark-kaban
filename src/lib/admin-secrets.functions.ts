import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const revealServiceRoleKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.SUPABASE_URL;
    if (!key || !url) throw new Error("SUPABASE_SERVICE_ROLE_KEY/SUPABASE_URL ausentes no servidor");
    return { url, serviceRoleKey: key };
  });