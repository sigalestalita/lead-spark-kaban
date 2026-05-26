import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type RdTokenSource = "oauth" | "env" | null;

export async function getRdTokenInfo(): Promise<{ token: string | null; source: RdTokenSource }> {
  const { data } = await supabaseAdmin
    .from("rd_oauth_tokens")
    .select("access_token")
    .eq("id", true)
    .maybeSingle();

  if (data?.access_token) return { token: data.access_token, source: "oauth" };
  if (process.env.RD_STATION_TOKEN) return { token: process.env.RD_STATION_TOKEN, source: "env" };
  return { token: null, source: null };
}

export async function getRdToken(): Promise<string | null> {
  return (await getRdTokenInfo()).token;
}