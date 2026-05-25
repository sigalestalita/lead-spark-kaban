import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getRdToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("rd_oauth_tokens")
    .select("access_token")
    .eq("id", true)
    .maybeSingle();
  if (data?.access_token) return data.access_token;
  return process.env.RD_STATION_TOKEN ?? null;
}