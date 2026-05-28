import { createFileRoute } from "@tanstack/react-router";
import { generateWeeklyDigest, sendDigestEmail } from "@/lib/digest.functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export const Route = createFileRoute("/api/public/hooks/send-weekly-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let force = false;
        try {
          const body = (await request.json().catch(() => ({}))) as {
            force?: boolean;
          };
          force = !!body?.force;
        } catch {
          /* empty body ok */
        }

        try {
          const weekStart = mondayOf(new Date());

          // Idempotência: se já enviado nesta semana e não foi forçado, sai.
          const { data: existing } = await supabaseAdmin
            .from("weekly_digests")
            .select("id, status")
            .eq("week_start", weekStart)
            .maybeSingle();

          if (existing?.status === "sent" && !force) {
            return Response.json({
              ok: true,
              alreadySent: true,
              digestId: existing.id,
            });
          }

          const gen = await generateWeeklyDigest({
            data: { weekStart, force },
          });

          if (!("digestId" in gen) || !gen.digestId) {
            return Response.json(
              { ok: false, error: "Falha ao gerar digest" },
              { status: 500 },
            );
          }

          const send = await sendDigestEmail(gen.digestId);
          return Response.json({ ok: true, digestId: gen.digestId, send });
        } catch (e) {
          console.error("send-weekly-digest error:", e);
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});