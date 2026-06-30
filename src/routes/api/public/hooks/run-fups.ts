import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/run-fups")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { runFupsTick } = await import("@/lib/whatsapp/fups-engine.server");
          const { runAutomationsTick } = await import("@/lib/whatsapp/automations-engine.server");
          const [fups, autos] = await Promise.all([runFupsTick(), runAutomationsTick()]);
          return Response.json({ ok: true, fups, automations: autos });
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