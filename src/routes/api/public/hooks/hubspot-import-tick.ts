import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/hubspot-import-tick")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { tickImportAll } = await import("@/lib/hubspot-import.server");
          const results = await tickImportAll(3);
          return new Response(JSON.stringify({ ok: true, results }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
