import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/rd/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        if (!code) {
          return new Response("Missing code", { status: 400 });
        }
        const clientId = process.env.RD_CLIENT_ID;
        const clientSecret = process.env.RD_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return new Response("RD_CLIENT_ID/RD_CLIENT_SECRET not configured", { status: 500 });
        }
        const redirectBase = `${url.protocol}//${url.host}`;
        try {
          const res = await fetch("https://crm.rdstation.com/api/v1/auth/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: clientId,
              client_secret: clientSecret,
              code,
              redirect_url: `${redirectBase}/api/public/rd/callback`,
            }),
          });
          if (!res.ok) {
            const text = await res.text();
            return new Response(`RD token exchange failed: ${res.status} ${text.slice(0, 300)}`, { status: 502 });
          }
          const json = (await res.json()) as { token?: string; user?: { id?: string | number } };
          const token = json.token;
          if (!token) {
            return new Response("RD response missing token", { status: 502 });
          }
          // Permanent token; store with far-future expires_at for schema compat
          const farFuture = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
          const { error } = await supabaseAdmin
            .from("rd_oauth_tokens")
            .upsert({
              id: true,
              access_token: token,
              refresh_token: "",
              expires_at: farFuture,
              connected_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as never);
          if (error) {
            return new Response(`DB save failed: ${error.message}`, { status: 500 });
          }
          await supabaseAdmin.from("integration_logs").insert({
            provider: "rd_station",
            action: "oauth_connect",
            status: "ok",
            detail: { user_id: json.user?.id ?? null } as never,
          });
          return new Response(null, {
            status: 302,
            headers: { Location: "/configuracoes?rd=connected" },
          });
        } catch (e) {
          return new Response(`Callback error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
        }
      },
    },
  },
});