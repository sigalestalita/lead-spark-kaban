import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listFupSequences,
  upsertFupSequence,
  deleteFupSequence,
  toggleFupSequence,
  runFupsNow,
  FUP_TRIGGERS,
  type FupTrigger,
} from "@/lib/whatsapp-fups.functions";
import { listTemplates } from "@/lib/whatsapp-templates.functions";
import { getCampaignFilterMeta } from "@/lib/whatsapp-campaigns.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Play, Repeat, X, ArrowUp, ArrowDown } from "lucide-react";

export const Route = createFileRoute("/_app/whatsapp/fups")({
  component: FupsPage,
});

const TRIGGER_LABELS: Record<FupTrigger, string> = {
  new_lead: "Lead novo (entrada na base)",
  stage_change: "Lead entrou em uma etapa",
  no_reply: "Lead sem resposta no WhatsApp há X horas",
  ai_handoff: "Aguardando handoff (sem responsável)",
};

type StepDraft = { templateId: string; delayHours: number };

type Seq = {
  id: string;
  name: string;
  description: string | null;
  trigger_type: FupTrigger;
  trigger_config: { stageId?: string; hoursWithoutReply?: number; lookbackHours?: number } | null;
  audience_filters: {
    priorities?: string[];
    leadType?: string[];
    companySizes?: string[];
    emailDomains?: string[];
    demoFree?: "any" | "yes" | "no";
  } | null;
  stop_on_reply: boolean;
  stop_on_stage_ids: string[] | null;
  active: boolean;
  whatsapp_fup_steps?: Array<{
    id: string;
    step_order: number;
    delay_hours: number;
    template_id: string;
    whatsapp_templates?: { name: string } | null;
  }>;
};

function FupsPage() {
  const listFn = useServerFn(listFupSequences);
  const saveFn = useServerFn(upsertFupSequence);
  const delFn = useServerFn(deleteFupSequence);
  const toggleFn = useServerFn(toggleFupSequence);
  const tickFn = useServerFn(runFupsNow);
  const tmplFn = useServerFn(listTemplates);
  const metaFn = useServerFn(getCampaignFilterMeta);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["wa-fups"], queryFn: () => listFn(), refetchInterval: 12000 });
  const { data: tmpls } = useQuery({ queryKey: ["wa-templates-mini"], queryFn: () => tmplFn() });
  const { data: meta } = useQuery({ queryKey: ["wa-camp-meta"], queryFn: () => metaFn() });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Seq | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState<FupTrigger>("stage_change");
  const [stageId, setStageId] = useState("");
  const [hoursWithoutReply, setHoursWithoutReply] = useState<number>(48);
  const [lookbackHours, setLookbackHours] = useState<number>(72);
  const [audPriorities, setAudPriorities] = useState<string[]>([]);
  const [audLeadType, setAudLeadType] = useState<string[]>([]);
  const [audCompanySizes, setAudCompanySizes] = useState<string[]>([]);
  const [audDomains, setAudDomains] = useState("");
  const [audDemoFree, setAudDemoFree] = useState<"any" | "yes" | "no">("any");
  const [stopOnReply, setStopOnReply] = useState(true);
  const [stopOnStageIds, setStopOnStageIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [steps, setSteps] = useState<StepDraft[]>([{ templateId: "", delayHours: 0 }]);

  function reset() {
    setEditing(null);
    setName("");
    setDescription("");
    setTrigger("stage_change");
    setStageId("");
    setHoursWithoutReply(48);
    setLookbackHours(72);
    setAudPriorities([]);
    setAudLeadType([]);
    setAudCompanySizes([]);
    setAudDomains("");
    setAudDemoFree("any");
    setStopOnReply(true);
    setStopOnStageIds([]);
    setActive(true);
    setSteps([{ templateId: "", delayHours: 0 }]);
  }

  function openEdit(s: Seq) {
    setEditing(s);
    setName(s.name);
    setDescription(s.description ?? "");
    setTrigger(s.trigger_type);
    setStageId(s.trigger_config?.stageId ?? "");
    setHoursWithoutReply(s.trigger_config?.hoursWithoutReply ?? 48);
    setLookbackHours(s.trigger_config?.lookbackHours ?? 72);
    setAudPriorities(s.audience_filters?.priorities ?? []);
    setAudLeadType(s.audience_filters?.leadType ?? []);
    setAudCompanySizes(s.audience_filters?.companySizes ?? []);
    setAudDomains((s.audience_filters?.emailDomains ?? []).join(", "));
    setAudDemoFree(s.audience_filters?.demoFree ?? "any");
    setStopOnReply(s.stop_on_reply);
    setStopOnStageIds(s.stop_on_stage_ids ?? []);
    setActive(s.active);
    const ordered = (s.whatsapp_fup_steps ?? []).slice().sort((a, b) => a.step_order - b.step_order);
    setSteps(
      ordered.length
        ? ordered.map((st) => ({ templateId: st.template_id, delayHours: Number(st.delay_hours) }))
        : [{ templateId: "", delayHours: 0 }],
    );
    setOpen(true);
  }

  function toggleArr(arr: string[], v: string, setter: (a: string[]) => void) {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  const save = useMutation({
    mutationFn: async () => {
      const audience: Record<string, unknown> = {};
      if (audPriorities.length) audience.priorities = audPriorities;
      if (audLeadType.length) audience.leadType = audLeadType;
      if (audCompanySizes.length) audience.companySizes = audCompanySizes;
      const domains = audDomains
        .split(/[\s,;]+/)
        .map((d) => d.trim().replace(/^@+/, "").toLowerCase())
        .filter(Boolean);
      if (domains.length) audience.emailDomains = domains;
      if (audDemoFree !== "any") audience.demoFree = audDemoFree;
      const triggerConfig: Record<string, unknown> = {};
      if (trigger === "stage_change") triggerConfig.stageId = stageId;
      if (trigger === "no_reply") triggerConfig.hoursWithoutReply = hoursWithoutReply;
      if (trigger === "new_lead" || trigger === "ai_handoff") triggerConfig.lookbackHours = lookbackHours;
      const cleanSteps = steps.filter((s) => s.templateId);
      if (!cleanSteps.length) throw new Error("Adicione pelo menos um passo");
      return saveFn({
        data: {
          id: editing?.id,
          name,
          description: description || null,
          triggerType: trigger,
          triggerConfig,
          audienceFilters: audience,
          stopOnReply,
          stopOnStageIds,
          active,
          steps: cleanSteps,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-fups"] });
      setOpen(false);
      reset();
    },
  });

  const toggle = useMutation({
    mutationFn: (s: Seq) => toggleFn({ data: { id: s.id, active: !s.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-fups"] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-fups"] }),
  });
  const tick = useMutation({
    mutationFn: () => tickFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-fups"] }),
  });

  const list = (data?.sequences ?? []) as Seq[];
  const stages = meta?.stages ?? [];
  const leadTypes = meta?.leadTypes ?? [];
  const companySizes = meta?.companySizes ?? [];
  const templates = tmpls?.templates ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Repeat className="h-5 w-5" /> Follow-ups (FUPs)</h2>
          <p className="text-xs text-muted-foreground">
            Cadências automáticas. Defina o gatilho de entrada, filtros de audiência e os passos com atraso entre mensagens. Roda no mesmo cron das automações.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => tick.mutate()} disabled={tick.isPending}>
            <Play className="h-4 w-4 mr-1.5" /> {tick.isPending ? "Rodando…" : "Rodar agora"}
          </Button>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={reset}><Plus className="h-4 w-4 mr-1" /> Novo FUP</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar FUP" : "Novo FUP"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground">Nome</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: FUP pós-discovery" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Descrição (opcional)</label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
                </div>

                <div className="border border-white/5 rounded-lg p-3 space-y-3">
                  <p className="text-xs font-medium">Gatilho de entrada</p>
                  <Select value={trigger} onValueChange={(v) => setTrigger(v as FupTrigger)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FUP_TRIGGERS.map((t) => (
                        <SelectItem key={t} value={t}>{TRIGGER_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {trigger === "stage_change" && (
                    <div>
                      <label className="text-xs text-muted-foreground">Etapa de entrada</label>
                      <Select value={stageId} onValueChange={setStageId}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {trigger === "no_reply" && (
                    <div>
                      <label className="text-xs text-muted-foreground">Horas sem resposta</label>
                      <Input type="number" min={1} value={hoursWithoutReply} onChange={(e) => setHoursWithoutReply(Number(e.target.value))} />
                    </div>
                  )}
                  {(trigger === "new_lead" || trigger === "ai_handoff") && (
                    <div>
                      <label className="text-xs text-muted-foreground">Janela retroativa (horas)</label>
                      <Input type="number" min={1} value={lookbackHours} onChange={(e) => setLookbackHours(Number(e.target.value))} />
                    </div>
                  )}
                </div>

                <div className="border border-white/5 rounded-lg p-3 space-y-3">
                  <p className="text-xs font-medium">Filtros de audiência</p>
                  <div>
                    <label className="text-xs text-muted-foreground">Prioridade</label>
                    <div className="flex gap-1.5 flex-wrap mt-1">
                      {["alta", "media", "baixa"].map((p) => (
                        <Badge
                          key={p}
                          variant={audPriorities.includes(p) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleArr(audPriorities, p, setAudPriorities)}
                        >{p}</Badge>
                      ))}
                    </div>
                  </div>
                  {leadTypes.length > 0 && (
                    <div>
                      <label className="text-xs text-muted-foreground">Tipo de lead</label>
                      <div className="flex gap-1.5 flex-wrap mt-1">
                        {leadTypes.map((t) => (
                          <Badge
                            key={t}
                            variant={audLeadType.includes(t) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => toggleArr(audLeadType, t, setAudLeadType)}
                          >{t}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {companySizes.length > 0 && (
                    <div>
                      <label className="text-xs text-muted-foreground">Porte da empresa</label>
                      <div className="flex gap-1.5 flex-wrap mt-1">
                        {companySizes.map((c) => (
                          <Badge
                            key={c}
                            variant={audCompanySizes.includes(c) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => toggleArr(audCompanySizes, c, setAudCompanySizes)}
                          >{c}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Demo Free</label>
                      <Select value={audDemoFree} onValueChange={(v) => setAudDemoFree(v as "any" | "yes" | "no")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Qualquer</SelectItem>
                          <SelectItem value="yes">Sim</SelectItem>
                          <SelectItem value="no">Não</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Domínios de email (vírgulas)</label>
                      <Input value={audDomains} onChange={(e) => setAudDomains(e.target.value)} placeholder="grougp.com.br, empresa.com" />
                    </div>
                  </div>
                </div>

                <div className="border border-white/5 rounded-lg p-3 space-y-3">
                  <p className="text-xs font-medium">Critérios de parada</p>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Switch checked={stopOnReply} onCheckedChange={setStopOnReply} />
                    Parar quando o lead responder no WhatsApp
                  </label>
                  <div>
                    <label className="text-xs text-muted-foreground">Parar se o lead entrar em qualquer destas etapas</label>
                    <div className="flex gap-1.5 flex-wrap mt-1">
                      {stages.map((s) => (
                        <Badge
                          key={s.id}
                          variant={stopOnStageIds.includes(s.id) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => toggleArr(stopOnStageIds, s.id, setStopOnStageIds)}
                        >{s.name}</Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border border-white/5 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">Passos da cadência</p>
                    <Button size="sm" variant="outline" onClick={() => setSteps([...steps, { templateId: "", delayHours: 24 }])}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Passo
                    </Button>
                  </div>
                  {steps.map((st, idx) => (
                    <div key={idx} className="flex items-end gap-2 border border-white/5 rounded-md p-2">
                      <div className="text-xs text-muted-foreground w-8 pb-2">{idx + 1}.</div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">Template</label>
                        <Select value={st.templateId} onValueChange={(v) => {
                          const c = [...steps]; c[idx] = { ...c[idx], templateId: v }; setSteps(c);
                        }}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {templates.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-32">
                        <label className="text-xs text-muted-foreground">
                          {idx === 0 ? "Atraso após gatilho (h)" : "Atraso após passo anterior (h)"}
                        </label>
                        <Input
                          type="number"
                          min={0}
                          value={st.delayHours}
                          onChange={(e) => {
                            const c = [...steps]; c[idx] = { ...c[idx], delayHours: Number(e.target.value) }; setSteps(c);
                          }}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button size="icon" variant="ghost" disabled={idx === 0} onClick={() => {
                          const c = [...steps];[c[idx - 1], c[idx]] = [c[idx], c[idx - 1]]; setSteps(c);
                        }}><ArrowUp className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" disabled={idx === steps.length - 1} onClick={() => {
                          const c = [...steps];[c[idx + 1], c[idx]] = [c[idx], c[idx + 1]]; setSteps(c);
                        }}><ArrowDown className="h-3.5 w-3.5" /></Button>
                      </div>
                      <Button size="icon" variant="ghost" disabled={steps.length === 1} onClick={() => {
                        setSteps(steps.filter((_, i) => i !== idx));
                      }}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Switch checked={active} onCheckedChange={setActive} />
                  Cadência ativa
                </label>

                {save.error instanceof Error && (
                  <p className="text-xs text-destructive">{save.error.message}</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending || !name}>
                  {save.isPending ? "Salvando…" : "Salvar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {tick.data && (
        <p className="text-xs text-muted-foreground">
          Última execução: {tick.data.sequences} cadências · {tick.data.enrolled} novos inscritos · {tick.data.sent} enviadas · {tick.data.completed} concluídas · {tick.data.stopped} paradas · {tick.data.failed} falhas
        </p>
      )}

      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {!isLoading && list.length === 0 && (
        <p className="text-xs text-muted-foreground border border-dashed border-white/10 rounded-lg p-6 text-center">
          Nenhum FUP criado ainda. Comece criando uma cadência de boas-vindas, qualificação ou reativação.
        </p>
      )}

      <div className="grid gap-2">
        {list.map((s) => {
          const sortedSteps = (s.whatsapp_fup_steps ?? []).slice().sort((a, b) => a.step_order - b.step_order);
          return (
            <div key={s.id} className="border border-white/5 rounded-lg p-4 bg-card/50 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <Repeat className={`h-4 w-4 shrink-0 ${s.active ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {TRIGGER_LABELS[s.trigger_type]} · {sortedSteps.length} passo(s)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-[10px]">{s.active ? "ativo" : "pausado"}</Badge>
                  <Switch checked={s.active} onCheckedChange={() => toggle.mutate(s)} />
                  <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Excluir FUP "${s.name}"?`)) del.mutate(s.id); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              {sortedSteps.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-7">
                  {sortedSteps.map((st) => (
                    <Badge key={st.id} variant="outline" className="text-[10px]">
                      {st.step_order}. {st.whatsapp_templates?.name ?? "—"} · {Number(st.delay_hours)}h
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}