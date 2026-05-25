import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getSettings, updateSetting, updateIcp } from "@/lib/settings.functions";
import { testRdConnection, getRecentSyncLogs } from "@/lib/rd-station.functions";
import { getRdAuthUrl, getRdConnectionStatus, disconnectRd } from "@/lib/rd-oauth.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Inbound SDR" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const fetchFn = useServerFn(getSettings);
  const updFn = useServerFn(updateSetting);
  const updIcpFn = useServerFn(updateIcp);
  const testFn = useServerFn(testRdConnection);
  const logsFn = useServerFn(getRecentSyncLogs);
  const authUrlFn = useServerFn(getRdAuthUrl);
  const statusFn = useServerFn(getRdConnectionStatus);
  const disconnectFn = useServerFn(disconnectRd);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: () => fetchFn() });
  const { data: logs } = useQuery({ queryKey: ["sync-logs"], queryFn: () => logsFn(), refetchInterval: 30000 });
  const { data: rdStatus } = useQuery({ queryKey: ["rd-status"], queryFn: () => statusFn(), refetchInterval: 10000 });

  const connect = useMutation({
    mutationFn: async () => authUrlFn({ data: { origin: window.location.origin } }),
    onSuccess: (r) => { window.location.href = r.url; },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => { toast.success("Desconectado"); qc.invalidateQueries({ queryKey: ["rd-status"] }); },
  });

  const test = useMutation({
    mutationFn: () => testFn(),
    onSuccess: (r) => r.ok ? toast.success(`OK. Pipelines: ${r.pipelines?.join(", ")}`) : toast.error(r.message),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const save = useMutation({
    mutationFn: (v: { key: string; value: unknown }) => updFn({ data: v }),
    onSuccess: () => { toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["settings"] }); },
  });

  const saveIcp = useMutation({
    mutationFn: (v: { rules: Record<string, unknown>; thresholds: { high: number; medium: number; low: number } }) => updIcpFn({ data: v }),
    onSuccess: () => { toast.success("ICP salvo"); qc.invalidateQueries({ queryKey: ["settings"] }); },
  });

  if (isLoading || !data) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;

  const pipelineSetting = data.settings.find((s) => s.key === "rd_pipeline");
  const pipelineName = (pipelineSetting?.value as { name?: string } | null)?.name ?? "Leads - Empresas";
  const tplSetting = data.settings.find((s) => s.key === "whatsapp_template");
  const tplText = (tplSetting?.value as { text?: string } | null)?.text ?? "";
  const slaSetting = data.settings.find((s) => s.key === "sla");
  const sla = (slaSetting?.value as { first_approach_minutes?: number; stalled_days?: number } | null) ?? { first_approach_minutes: 60, stalled_days: 3 };
  const windowDays = (data.settings.find((s) => s.key === "rd_sync_window_days")?.value as { days?: number } | null)?.days ?? 90;
  const incMinutes = (data.settings.find((s) => s.key === "rd_sync_incremental_minutes")?.value as { minutes?: number } | null)?.minutes ?? 15;
  const importAct = (data.settings.find((s) => s.key === "rd_import_activities")?.value as { enabled?: boolean } | null)?.enabled !== false;
  const lastSync = (data.settings.find((s) => s.key === "rd_last_sync_at")?.value as { value?: string } | null)?.value ?? null;

  const rules = (data.icp?.rules ?? {}) as Record<string, unknown>;
  const thresholds = (data.icp?.thresholds ?? { high: 70, medium: 40, low: 15 }) as { high: number; medium: number; low: number };

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <Card className="p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">RD Station CRM</h2>
          <Badge variant={rdStatus?.connected ? "default" : "destructive"}>
            {rdStatus?.connected ? "Conectado" : "Não conectado"}
          </Badge>
        </div>
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
          <p className="font-medium mb-1">Sync OAuth experimental</p>
          <p>
            A sincronização direta via OAuth está instável. O método recomendado hoje é
            importar os deals usando o Claude (que já tem acesso ao RD CRM) e inserir direto
            no banco. Veja o passo a passo em <code>docs/RD_TO_SUPABASE.md</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rdStatus?.connected ? (
            <>
              <p className="text-xs text-muted-foreground flex-1">
                Conectado em {rdStatus.connectedAt ? new Date(rdStatus.connectedAt).toLocaleString("pt-BR") : "—"}
              </p>
              <Button variant="outline" size="sm" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                Desconectar
              </Button>
            </>
          ) : (
            <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
              Conectar ao RD Station
            </Button>
          )}
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Nome do funil</label>
          <div className="flex gap-2 mt-1">
            <Input
              defaultValue={pipelineName}
              onBlur={(e) => {
                if (e.target.value !== pipelineName) save.mutate({ key: "rd_pipeline", value: { name: e.target.value } });
              }}
            />
            <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
              Testar conexão
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Janela inicial (dias) — sync manual</label>
            <Input type="number" defaultValue={windowDays} onBlur={(e) => { const v = Number(e.target.value); if (v !== windowDays) save.mutate({ key: "rd_sync_window_days", value: { days: v } }); }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Janela incremental (minutos) — cron a cada 15min</label>
            <Input type="number" defaultValue={incMinutes} onBlur={(e) => { const v = Number(e.target.value); if (v !== incMinutes) save.mutate({ key: "rd_sync_incremental_minutes", value: { minutes: v } }); }} />
          </div>
        </div>
        <div className="flex items-center justify-between pt-2 border-t">
          <div>
            <p className="text-sm font-medium">Importar atividades e notas do RD</p>
            <p className="text-xs text-muted-foreground">Traz histórico de interações para a timeline do lead</p>
          </div>
          <Switch checked={importAct} onCheckedChange={(v) => save.mutate({ key: "rd_import_activities", value: { enabled: v } })} />
        </div>
        <div className="text-xs text-muted-foreground pt-2 border-t">
          Última sincronização: {lastSync ? new Date(lastSync).toLocaleString("pt-BR") : "nunca"} · Cron automático rodando a cada 15 min
        </div>
      </Card>

      <Card className="p-5 space-y-2">
        <h2 className="font-semibold">Logs de sincronização</h2>
        <div className="text-xs space-y-1 max-h-64 overflow-auto">
          {(logs?.logs ?? []).map((l) => {
            const d = (l.detail ?? {}) as { fetched?: number; created?: number; updated?: number; interactions?: number; error?: string };
            return (
              <div key={l.id} className="flex items-center justify-between border-b pb-1">
                <div className="flex items-center gap-2">
                  <Badge variant={l.status === "ok" ? "default" : "destructive"} className="text-[10px]">{l.status}</Badge>
                  <span className="font-mono text-[11px]">{l.action}</span>
                  {l.status === "ok" ? (
                    <span className="text-muted-foreground">{d.fetched ?? 0} deals · +{d.created ?? 0} novos · ~{d.updated ?? 0} atualizados · {d.interactions ?? 0} interações</span>
                  ) : (
                    <span className="text-destructive truncate max-w-md">{d.error}</span>
                  )}
                </div>
                <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR")}</span>
              </div>
            );
          })}
          {(logs?.logs ?? []).length === 0 && <p className="text-muted-foreground">Nenhuma sincronização ainda.</p>}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Template de mensagem WhatsApp</h2>
        <p className="text-xs text-muted-foreground">Use {"{nome} {empresa} {tema} {dor}"} — IA usa como referência de estrutura.</p>
        <Textarea
          defaultValue={tplText}
          rows={4}
          onBlur={(e) => { if (e.target.value !== tplText) save.mutate({ key: "whatsapp_template", value: { text: e.target.value } }); }}
        />
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">SLA</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Minutos p/ primeira abordagem</label>
            <Input
              type="number"
              defaultValue={sla.first_approach_minutes}
              onBlur={(e) => save.mutate({ key: "sla", value: { ...sla, first_approach_minutes: Number(e.target.value) } })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Dias antes de considerar parado</label>
            <Input
              type="number"
              defaultValue={sla.stalled_days}
              onBlur={(e) => save.mutate({ key: "sla", value: { ...sla, stalled_days: Number(e.target.value) } })}
            />
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">ICP — Pesos e thresholds</h2>
        <IcpEditor rules={rules} thresholds={thresholds} onSave={(r, t) => saveIcp.mutate({ rules: r, thresholds: t })} />
      </Card>

      <Card className="p-5 space-y-2">
        <h2 className="font-semibold">Etapas do Kanban</h2>
        <p className="text-xs text-muted-foreground">{data.stages.length} etapas configuradas (edição completa em breve)</p>
        <ul className="text-sm space-y-1">
          {data.stages.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span className="font-mono text-xs text-muted-foreground">{s.position}</span>
              <span>{s.name}</span>
              {s.is_terminal && <Badge variant="outline" className="text-[10px]">terminal</Badge>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function IcpEditor({ rules, thresholds, onSave }: { rules: Record<string, unknown>; thresholds: { high: number; medium: number; low: number }; onSave: (r: Record<string, unknown>, t: { high: number; medium: number; low: number }) => void }) {
  const [r, setR] = useState(JSON.stringify(rules, null, 2));
  const [t, setT] = useState(thresholds);
  return (
    <div className="space-y-3">
      <Textarea value={r} onChange={(e) => setR(e.target.value)} rows={10} className="font-mono text-xs" />
      <div className="grid grid-cols-3 gap-3">
        <div><label className="text-xs">Alta ≥</label><Input type="number" value={t.high} onChange={(e) => setT({ ...t, high: Number(e.target.value) })} /></div>
        <div><label className="text-xs">Média ≥</label><Input type="number" value={t.medium} onChange={(e) => setT({ ...t, medium: Number(e.target.value) })} /></div>
        <div><label className="text-xs">Baixa ≥</label><Input type="number" value={t.low} onChange={(e) => setT({ ...t, low: Number(e.target.value) })} /></div>
      </div>
      <Button onClick={() => { try { onSave(JSON.parse(r), t); } catch { toast.error("JSON inválido"); } }}>Salvar ICP</Button>
    </div>
  );
}