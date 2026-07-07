import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAutomationRules,
  createAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  listAutomationLogs,
  runAutomationsNow,
  AUTOMATION_TRIGGERS,
  type AutomationTrigger,
} from "@/lib/whatsapp-automations.functions";
import { listTemplates } from "@/lib/whatsapp-templates.functions";
import { getCampaignFilterMeta } from "@/lib/whatsapp-campaigns.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Play, Zap } from "lucide-react";

export const Route = createFileRoute("/_app/whatsapp/automacoes")({
  component: AutomationsPage,
});

const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  new_lead: "Lead novo (IA + HSM inicial)",
  no_reply: "Sem resposta há X horas",
  stage_change: "Mudou para estágio",
  meeting_reminder: "Lembrete antes da reunião",
};

type RuleRow = {
  id: string;
  name: string;
  trigger_type: AutomationTrigger;
  trigger_config: {
    hoursWithoutReply?: number;
    stageId?: string;
    minutesBefore?: number;
  } | null;
  template_id: string | null;
  delay_minutes: number | null;
  active: boolean;
  whatsapp_templates?: { name: string } | null;
};

function AutomationsPage() {
  const listFn = useServerFn(listAutomationRules);
  const createFn = useServerFn(createAutomationRule);
  const updateFn = useServerFn(updateAutomationRule);
  const deleteFn = useServerFn(deleteAutomationRule);
  const logsFn = useServerFn(listAutomationLogs);
  const tickFn = useServerFn(runAutomationsNow);
  const tmplFn = useServerFn(listTemplates);
  const metaFn = useServerFn(getCampaignFilterMeta);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["wa-automations"],
    queryFn: () => listFn(),
    refetchInterval: 10000,
  });
  const { data: logs } = useQuery({
    queryKey: ["wa-automation-logs"],
    queryFn: () => logsFn(),
    refetchInterval: 8000,
  });
  const { data: tmpls } = useQuery({
    queryKey: ["wa-templates-mini"],
    queryFn: () => tmplFn(),
  });
  const { data: meta } = useQuery({
    queryKey: ["wa-camp-meta"],
    queryFn: () => metaFn(),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RuleRow | null>(null);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<AutomationTrigger>("new_lead");
  const [templateId, setTemplateId] = useState("");
  const [delayMin, setDelayMin] = useState<number>(0);
  const [hoursWithoutReply, setHoursWithoutReply] = useState<number>(24);
  const [stageId, setStageId] = useState<string>("");
  const [minutesBefore, setMinutesBefore] = useState<number>(60);
  const [active, setActive] = useState(true);

  function reset() {
    setEditing(null);
    setName("");
    setTrigger("new_lead");
    setTemplateId("");
    setDelayMin(0);
    setHoursWithoutReply(24);
    setStageId("");
    setMinutesBefore(60);
    setActive(true);
  }

  function openEdit(r: RuleRow) {
    setEditing(r);
    setName(r.name);
    setTrigger(r.trigger_type);
    setTemplateId(r.template_id ?? "");
    setDelayMin(r.delay_minutes ?? 0);
    setActive(r.active);
    const cfg = r.trigger_config ?? {};
    setHoursWithoutReply(cfg.hoursWithoutReply ?? 24);
    setStageId(cfg.stageId ?? "");
    setMinutesBefore(cfg.minutesBefore ?? 60);
    setOpen(true);
  }

  function buildConfig() {
    if (trigger === "no_reply") return { hoursWithoutReply };
    if (trigger === "stage_change") return { stageId };
    if (trigger === "meeting_reminder") return { minutesBefore };
    return {};
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        triggerType: trigger,
        triggerConfig: buildConfig(),
        templateId,
        delayMinutes: delayMin,
        active,
      };
      if (editing) return updateFn({ data: { id: editing.id, ...payload } });
      return createFn({ data: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-automations"] });
      setOpen(false);
      reset();
    },
  });

  const toggle = useMutation({
    mutationFn: (r: RuleRow) => updateFn({ data: { id: r.id, active: !r.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-automations"] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-automations"] }),
  });

  const tick = useMutation({
    mutationFn: () => tickFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-automation-logs"] });
      qc.invalidateQueries({ queryKey: ["wa-automations"] });
    },
  });

  const rules = (data?.rules ?? []) as RuleRow[];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Automações</h2>
          <p className="text-xs text-muted-foreground">
            Regras que disparam mensagens automaticamente. Roda em ciclos (a cada minuto via cron).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => tick.mutate()} disabled={tick.isPending}>
            <Play className="h-4 w-4 mr-1.5" />
            {tick.isPending ? "Rodando…" : "Rodar agora"}
          </Button>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={reset}><Plus className="h-4 w-4 mr-1" /> Nova regra</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar regra" : "Nova regra"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">Nome</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: boas-vindas SDR" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Gatilho</label>
                    <Select value={trigger} onValueChange={(v) => setTrigger(v as AutomationTrigger)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AUTOMATION_TRIGGERS.map((t) => (
                          <SelectItem key={t} value={t}>{TRIGGER_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Template</label>
                    <Select value={templateId} onValueChange={setTemplateId}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {(tmpls?.templates ?? []).map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {trigger === "new_lead" && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Para lead novo, o disparo real usa a configuração da aba <strong>IA</strong> e o template HSM inicial definido lá.
                      </p>
                    )}
                  </div>
                </div>

                {trigger === "new_lead" && (
                  <div>
                    <label className="text-xs text-muted-foreground">Atraso após criação (minutos)</label>
                    <Input
                      type="number"
                      value={delayMin}
                      onChange={(e) => setDelayMin(Number(e.target.value))}
                    />
                  </div>
                )}

                {trigger === "no_reply" && (
                  <div>
                    <label className="text-xs text-muted-foreground">Horas sem resposta do lead</label>
                    <Input
                      type="number"
                      min={1}
                      value={hoursWithoutReply}
                      onChange={(e) => setHoursWithoutReply(Number(e.target.value))}
                    />
                  </div>
                )}

                {trigger === "stage_change" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Estágio</label>
                      <Select value={stageId} onValueChange={setStageId}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {(meta?.stages ?? []).map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Atraso após entrar (min)</label>
                      <Input
                        type="number"
                        value={delayMin}
                        onChange={(e) => setDelayMin(Number(e.target.value))}
                      />
                    </div>
                  </div>
                )}

                {trigger === "meeting_reminder" && (
                  <div>
                    <label className="text-xs text-muted-foreground">Minutos antes da reunião</label>
                    <Input
                      type="number"
                      min={5}
                      value={minutesBefore}
                      onChange={(e) => setMinutesBefore(Number(e.target.value))}
                    />
                  </div>
                )}

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Switch checked={active} onCheckedChange={setActive} />
                  Ativa
                </label>

                {save.error instanceof Error && (
                  <p className="text-xs text-destructive">{save.error.message}</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending || !name || !templateId}>
                  {save.isPending ? "Salvando…" : "Salvar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {tick.data && (
        <p className="text-xs text-muted-foreground">
          Última execução: {tick.data.rulesProcessed} regras · {tick.data.sent} enviadas · {tick.data.failed} falhas · {tick.data.skipped} já executadas
        </p>
      )}

      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {!isLoading && rules.length === 0 && (
        <p className="text-xs text-muted-foreground border border-dashed border-white/10 rounded-lg p-6 text-center">
          Nenhuma regra criada ainda.
        </p>
      )}

      <div className="grid gap-2">
        {rules.map((r) => (
          <div key={r.id} className="border border-white/5 rounded-lg p-4 bg-card/50 flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-3">
              <Zap className={`h-4 w-4 shrink-0 ${r.active ? "text-primary" : "text-muted-foreground"}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {TRIGGER_LABELS[r.trigger_type]} · Template: {r.whatsapp_templates?.name ?? "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="text-[10px]">{r.active ? "ativa" : "pausada"}</Badge>
              <Switch checked={r.active} onCheckedChange={() => toggle.mutate(r)} />
              <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => { if (confirm(`Excluir regra "${r.name}"?`)) del.mutate(r.id); }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Histórico de execuções</h3>
        <div className="border border-white/5 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-white/5 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Quando</th>
                <th className="text-left px-3 py-2">Regra</th>
                <th className="text-left px-3 py-2">Lead</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(logs?.logs ?? []).length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Nenhuma execução ainda.</td></tr>
              )}
              {(logs?.logs ?? []).map((l) => {
                const lead = (l as { leads: { name: string | null; company_name: string | null } | null }).leads;
                const rule = (l as { whatsapp_automation_rules: { name: string } | null }).whatsapp_automation_rules;
                return (
                  <tr key={l.id} className="border-t border-white/5">
                    <td className="px-3 py-2 text-muted-foreground">
                      {l.executed_at ? new Date(l.executed_at).toLocaleString("pt-BR") : "—"}
                    </td>
                    <td className="px-3 py-2">{rule?.name ?? "—"}</td>
                    <td className="px-3 py-2 truncate">
                      {lead?.name ?? "—"} {lead?.company_name ? <span className="text-muted-foreground">· {lead.company_name}</span> : null}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px]">{l.status}</Badge>
                      {l.error && <span className="text-[10px] text-destructive ml-2">{l.error}</span>}
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