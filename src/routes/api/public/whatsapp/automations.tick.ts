import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/whatsapp/automations/tick")({
  server: {
    handlers: {
      POST: async () => {
        const { runAutomationsTick } = await import("@/lib/whatsapp/automations-engine.server");
        try {
          const result = await runAutomationsTick();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Falha";
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});