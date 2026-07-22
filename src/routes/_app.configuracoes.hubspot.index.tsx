import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  getHubspotImportState,
  startHubspotImport,
  runHubspotImportBatch,
  pauseHubspotImport,
  resetHubspotImport,
} from "@/lib/hubspot-import.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/configuracoes/hubspot/")({
  head: () => ({ meta: [{ title: "Importar do HubSpot — COMPASS" }] }),
  component: HubSpotImportPage,
});

type ObjType = "owners" | "contacts" | "companies" | "deals";

function HubSpotImportPage() {
  const getFn = useServerFn(getHubspotImportState);
  const startFn = useServerFn(startHubspotImport);
  const runFn = useServerFn(runHubspotImportBatch);
  const pauseFn = useServerFn(pauseHubspotImport);
  const resetFn = useServerFn(resetHubspotImport);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["hs-import-state"],
    queryFn: () => getFn(),
    refetchInterval: 3000,
  });

  const [autorun, setAutorun] = useState(false);

  const start = useMutation({
    mutationFn: () => startFn(),
    onSuccess: () => { toast.success("Importação iniciada"); setAutorun(true); qc.invalidateQueries({ queryKey: ["hs-import-state"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const run = useMutation({
    mutationFn: (v: { objectType: ObjType; maxPages?: number }) => runFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hs-import-state"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const pause = useMutation({
    mutationFn: (v: { objectType: ObjType }) => pauseFn({ data: v }),
    onSuccess: () => { setAutorun(false); qc.invalidateQueries({ queryKey: ["hs-import-state"] }); },
  });

  const reset = useMutation({
    mutationFn: (v: { objectType: ObjType }) => resetFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hs-import-state"] }),
  });

  // Auto-run loop: while autorun on, keep triggering batches for whichever object is 'running'
  useEffect(() => {
    if (!autorun || !data) return;
    const running = data.state.find((s: any) => s.status === "running");
    if (!running) { setAutorun(false); return; }
    if (run.isPending) return;
    const t = setTimeout(() => {
      run.mutate({ objectType: running.object_type as ObjType, maxPages: 5 });
    }, 500);
    return () => clearTimeout(t);
  }, [autorun, data, run]);

  if (isLoading || !data) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Importação do HubSpot</h1>
        <p className="text-sm text-muted-foreground">
          Backfill retomável — traz owners, contatos, empresas e negócios criados até 30/dez/2025.
          Os dados ficam nas tabelas <code>hs_*</code>, separados do COMPASS (sem sobrescrever nada).
        </p>
      </div>

      <Card className="p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Token de acesso</p>
          <p className="text-xs text-muted-foreground">
            {data.tokenConfigured ? "HUBSPOT_PRIVATE_APP_TOKEN configurado ✓" : "Token não configurado — configure o segredo primeiro"}
          </p>
        </div>
        <Badge variant={data.tokenConfigured ? "default" : "destructive"}>
          {data.tokenConfigured ? "Pronto" : "Faltando"}
        </Badge>
      </Card>

      <Card className="p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Controle geral</p>
          <p className="text-xs text-muted-foreground">
            "Iniciar" marca todos os objetos como <em>running</em>. O loop automático faz as chamadas em sequência sem você precisar clicar.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => start.mutate()} disabled={!data.tokenConfigured || start.isPending}>
            Iniciar tudo
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAutorun((v) => !v)}>
            {autorun ? "Pausar loop" : "Ativar loop auto"}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.state.map((s: any) => {
          const count = data.counts[s.object_type as keyof typeof data.counts] ?? 0;
          return (
            <Card key={s.object_type} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold capitalize">{s.object_type}</p>
                  <p className="text-xs text-muted-foreground">
                    {count.toLocaleString("pt-BR")} no banco · {s.upserted_count?.toLocaleString("pt-BR") ?? 0} importados nessa rodada
                  </p>
                </div>
                <Badge variant={
                  s.status === "done" ? "default" :
                  s.status === "running" ? "secondary" :
                  s.status === "error" ? "destructive" : "outline"
                }>{s.status}</Badge>
              </div>
              {s.last_error && (
                <p className="text-xs text-destructive truncate" title={s.last_error}>{s.last_error}</p>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline"
                  disabled={s.status === "done" || run.isPending || !data.tokenConfigured}
                  onClick={() => run.mutate({ objectType: s.object_type as ObjType, maxPages: 5 })}>
                  Rodar 5 páginas
                </Button>
                {s.status === "running" && (
                  <Button size="sm" variant="outline" onClick={() => pause.mutate({ objectType: s.object_type as ObjType })}>
                    Pausar
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => {
                  if (confirm(`Resetar cursor de ${s.object_type}? A importação começa do zero.`)) {
                    reset.mutate({ objectType: s.object_type as ObjType });
                  }
                }}>Resetar</Button>
              </div>
            </Card>
          );
        }).filter((_c: any, i: number) => i < 4)}
      </div>

      <Card className="p-4 space-y-1 text-xs text-muted-foreground">
        <p><strong>Como funciona:</strong> cada "rodada" busca 5 páginas × 100 registros = 500 por clique. O loop automático dispara continuamente enquanto essa aba estiver aberta.</p>
        <p>Um cron externo também dispara a cada 5min via <code>/api/public/hooks/hubspot-import-tick</code> para continuar mesmo com a aba fechada.</p>
        <p>Registros criados <strong>depois de 30/dez/2025</strong> são baixados mas descartados (não vão para o banco).</p>
      </Card>
    </div>
  );
}
