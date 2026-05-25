import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function buildRedirectUri(origin: string) {
  return `${origin}/api/public/rd/callback`;
}

export const getRdAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { origin: string }) => d)
  .handler(async ({ data }) => {
    const clientId = process.env.RD_CLIENT_ID;
    if (!clientId) throw new Error("RD_CLIENT_ID não configurado");
    const redirect = buildRedirectUri(data.origin);
    const url = `https://crm.rdstation.com/auth/dialog?token=${encodeURIComponent(
      clientId,
    )}&redirect_url=${encodeURIComponent(redirect)}`;
    return { url };
  });

export const getRdConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("rd_oauth_tokens")
      .select("connected_at, connected_by, updated_at")
      .eq("id", true)
      .maybeSingle();
    return {
      connected: !!data,
      connectedAt: data?.connected_at ?? null,
      connectedBy: data?.connected_by ?? null,
    };
  });

export const disconnectRd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    await supabaseAdmin.from("rd_oauth_tokens").delete().eq("id", true);
    return { ok: true };
  });