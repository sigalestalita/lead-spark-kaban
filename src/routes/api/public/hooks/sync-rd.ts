import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runRdSync, type SyncMode } from "@/lib/rd-station.functions";

export const Route = createFileRoute("/api/public/hooks/sync-rd")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let mode: SyncMode = "incremental";
        try {
          const body = (await request.json()) as { mode?: SyncMode };
          if (body?.mode === "full") mode = "full";
        } catch {
          /* empty body ok */
        }
        try {
          const result = await runRdSync(supabaseAdmin, mode);
          return Response.json({ ok: true, ...result });
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});