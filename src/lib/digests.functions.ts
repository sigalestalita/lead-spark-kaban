import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const listWeeklyDigests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("weekly_digests")
      .select("id, week_start, subject, content_summary, content_html, stats, status, sent_at, error_message, created_at")
      .order("week_start", { ascending: false })
      .limit(52);
    if (error) throw error;
    return { digests: data ?? [] };
  });

export const triggerWeeklyDigestNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { force?: boolean }) => input ?? {})
  .handler(async ({ data }) => {
    const { generateWeeklyDigestInternal } = await import("./digest.functions");
    const gen = await generateWeeklyDigestInternal({ force: !!data.force });
    if (!("digestId" in gen) || !gen.digestId) {
      throw new Error("Falha ao gerar prévia");
    }
    return { ok: true, digestId: gen.digestId };
  });

export const approveAndSendDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { digestId: string }) => input)
  .handler(async ({ data }) => {
    const { sendDigestEmail } = await import("./digest.functions");
    const send = await sendDigestEmail(data.digestId);
    return { ok: true, send };
  });