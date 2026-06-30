import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCampaign, launchCampaign } from "@/lib/whatsapp-campaigns.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send } from "lucide-react";

export const Route = createFileRoute("/_app/whatsapp/campanhas/$id")({
  component: CampaignDetail,
});

function CampaignDetail() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getCampaign);
  const launchFn = useServerFn(launchCampaign);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["wa-campaign", id],
    queryFn: () => getFn({ data: { id } }),
    refetchInterval: 5000,
  });

  const launch = useMutation({
    mutationFn: () => launchFn({ data: { id, limit: 200 } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-campaign", id] }),
  });

  if (isLoading) return <div className="p-6 text-xs text-muted-foreground">Carregando…</div>;
  if (error || !data) {
    return (
      <div className="p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : "Erro ao carregar campanha"}
      </div>
    );
  }

  const c = data.campaign as {
    id: string;
    name: string;
    status: string;
    audience_filters: unknown;
    scheduled_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    whatsapp_templates: { name: string; body: string } | null;
  };
  const s = data.stats;
  const canLaunch = c.status === "draft" || c.status === "scheduled";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/whatsapp/campanhas" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Campanhas
        </Link>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{c.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[10px] capitalize">{c.status}</Badge>
            {c.whatsapp_templates && (
              <span className="text-xs text-muted-foreground">Template: {c.whatsapp_templates.name}</span>
            )}
          </div>
        </div>
        <Button onClick={() => launch.mutate()} disabled={!canLaunch || launch.isPending}>
          <Send className="h-4 w-4 mr-1.5" />
          {launch.isPending ? "Enviando…" : canLaunch ? "Disparar agora" : "Já disparada"}
        </Button>
      </div>

      {launch.error instanceof Error && (
        <p className="text-xs text-destructive">{launch.error.message}</p>
      )}
      {launch.data && (
        <p className="text-xs text-muted-foreground">
          Lote disparado: {launch.data.queued} · enviadas {launch.data.sent} · falhas {launch.data.failed}
        </p>
      )}

      <div className="grid grid-cols-5 gap-3">
        {[
          { l: "Total", v: s.total },
          { l: "Enviadas", v: s.sent },
          { l: "Entregues", v: s.delivered },
          { l: "Lidas", v: s.read },
          { l: "Falhas", v: s.failed },
        ].map((k) => (
          <div key={k.l} className="border border-white/5 rounded-lg p-3 bg-card/50">
            <p className="text-[10px] text-muted-foreground uppercase">{k.l}</p>
            <p className="text-xl font-semibold">{k.v}</p>
          </div>
        ))}
      </div>

      {c.whatsapp_templates && (
        <div className="border border-white/5 rounded-lg p-4 bg-card/50">
          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Corpo do template</p>
          <p className="text-sm whitespace-pre-wrap">{c.whatsapp_templates.body}</p>
        </div>
      )}

      <div>
        <p className="text-sm font-medium mb-2">Envios</p>
        <div className="border border-white/5 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-white/5 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Lead</th>
                <th className="text-left px-3 py-2">Telefone</th>
                <th className="text-left px-3 py-2">Empresa</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Enviado em</th>
              </tr>
            </thead>
            <tbody>
              {data.messages.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nenhum envio ainda.</td></tr>
              )}
              {data.messages.map((m) => {
                const lead = (m as { leads: { id: string; name: string | null; company_name: string | null; phone: string | null } | null }).leads;
                return (
                  <tr key={m.id} className="border-t border-white/5">
                    <td className="px-3 py-2">
                      {lead ? (
                        <Link to="/lead/$id" params={{ id: lead.id }} className="hover:text-primary">
                          {lead.name ?? (lead.phone ? `+${lead.phone}` : "—")}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground font-mono text-[11px]">
                      {lead?.phone ? `+${lead.phone}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{lead?.company_name ?? "—"}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{m.status}</Badge></td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {m.sent_at ? new Date(m.sent_at).toLocaleString("pt-BR") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}