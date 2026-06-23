import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getLeadDetail, updateLead, addLeadNote, recalcLeadScore } from "@/lib/leads.functions";
import { enrichLead, suggestApproach } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { PRIORITY_LABEL, PRIORITY_COLOR } from "@/lib/lead-types";
import { LEAD_TYPE_LABEL, LEAD_TYPE_COLOR, type LeadType } from "@/lib/lead-type";
import { ArrowLeft, MessageSquare, Linkedin, Globe, Sparkles, Wand2, Copy, Building2, ExternalLink, ArrowRight } from "lucide-react";
import { LeadWhatsappTab } from "@/components/whatsapp/lead-whatsapp-tab";

export const Route = createFileRoute("/_app/lead/$id")({
  component: LeadDetailPage,
});

function LeadDetailPage() {
  const { id } = useParams({ from: "/_app/lead/$id" });
  const fetchFn = useServerFn(getLeadDetail);
  const updateFn = useServerFn(updateLead);
  const addNoteFn = useServerFn(addLeadNote);
  const recalcFn = useServerFn(recalcLeadScore);
  const enrichFn = useServerFn(enrichLead);
  const suggestFn = useServerFn(suggestApproach);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: () => fetchFn({ data: { id } }),
  });

  const [note, setNote] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [lostFor, setLostFor] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => updateFn({ data: { id, patch } }),
    onSuccess: () => { toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["lead", id] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const addNoteMut = useMutation({
    mutationFn: (content: string) => addNoteFn({ data: { leadId: id, content } }),
    onSuccess: () => { setNote(""); toast.success("Observação adicionada"); qc.invalidateQueries({ queryKey: ["lead", id] }); },
  });

  const enrich = useMutation({
    mutationFn: () => enrichFn({ data: { id } }),
    onSuccess: () => { toast.success("Lead enriquecido pela IA"); qc.invalidateQueries({ queryKey: ["lead", id] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const suggest = useMutation({
    mutationFn: () => suggestFn({ data: { id } }),
    onSuccess: (r) => setSuggestion(r.message),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const recalc = useMutation({
    mutationFn: () => recalcFn({ data: { id } }),
    onSuccess: () => { toast.success("Score recalculado"); qc.invalidateQueries({ queryKey: ["lead", id] }); },
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  if (!data) return null;
  const lead = data.lead;
  const currentStage = data.stages.find((s) => s.id === lead.stage_id) ?? null;

  const moveToStage = (stageId: string, slug: string) => {
    if (stageId === lead.stage_id) return;
    if (slug === "desqualificado") {
      setLostFor(stageId);
      return;
    }
    update.mutate({
      stage_id: stageId,
      stage_entered_at: new Date().toISOString(),
      last_action_at: new Date().toISOString(),
    });
  };

  const whatsappUrl = lead.phone
    ? `https://wa.me/${lead.phone.replace(/\D/g, "")}${
        suggestion ? `?text=${encodeURIComponent(suggestion)}` : ""
      }`
    : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4 xl:pr-56">
      <aside className="hidden xl:flex flex-col gap-1 fixed right-4 top-24 w-48 z-10">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-2 mb-1">Mover para etapa</p>
        {data.stages.map((s) => {
          const active = s.id === lead.stage_id;
          return (
            <button
              key={s.id}
              type="button"
              disabled={active || update.isPending}
              onClick={() => moveToStage(s.id, s.slug)}
              className={`group flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs text-left transition-colors ${
                active
                  ? "bg-primary/10 border-primary/40 text-foreground cursor-default"
                  : "bg-background hover:bg-accent hover:border-primary/40"
              }`}
              title={active ? "Etapa atual" : `Mover para ${s.name}`}
            >
              <span className="flex items-center gap-2 truncate">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="truncate">{s.name}</span>
              </span>
              {active ? (
                <span className="text-[9px] uppercase text-primary">atual</span>
              ) : (
                <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 text-primary" />
              )}
            </button>
          );
        })}
      </aside>

      <div className="xl:hidden">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Mover para etapa</p>
        <select
          value={lead.stage_id ?? ""}
          onChange={(e) => {
            const s = data.stages.find((x) => x.id === e.target.value);
            if (s) moveToStage(s.id, s.slug);
          }}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        >
          {data.stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}{s.id === lead.stage_id ? " (atual)" : ""}
            </option>
          ))}
        </select>
      </div>

      {currentStage && (
        <p className="text-xs text-muted-foreground">
          Etapa atual: <span className="font-medium text-foreground">{currentStage.name}</span>
        </p>
      )}

      {lostFor && (
        <LostReasonDialog
          initial={lead.lost_reason ?? ""}
          onClose={() => setLostFor(null)}
          onConfirm={(reason) => {
            update.mutate({
              stage_id: lostFor,
              stage_entered_at: new Date().toISOString(),
              last_action_at: new Date().toISOString(),
              lost_reason: reason,
            });
            setLostFor(null);
          }}
        />
      )}
      <Link to="/kanban" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Voltar para o Kanban
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{lead.name}</h1>
          <p className="text-sm text-muted-foreground">{lead.position} {lead.company_name && `@ ${lead.company_name}`}</p>
          {lead.original_company_name && lead.original_company_name !== lead.company_name && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              ⚠️ Convertido no formulário como <span className="font-medium">{lead.original_company_name}</span> — atualizado pelo LinkedIn
            </p>
          )}
          <div className="flex gap-2 mt-2 items-center">
            <Badge style={{ borderColor: PRIORITY_COLOR[lead.priority], color: PRIORITY_COLOR[lead.priority] }} variant="outline">
              {PRIORITY_LABEL[lead.priority]} · {lead.score} pts
            </Badge>
            <Button size="sm" variant="ghost" onClick={() => recalc.mutate()}>Recalcular</Button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer"><Button size="sm"><MessageSquare className="h-4 w-4 mr-1" />WhatsApp</Button></a>}
        </div>
      </div>

      <Card className="p-4 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Pesquisa rápida para abordagem
          </h2>
          <Button size="sm" variant="outline" onClick={() => enrich.mutate()} disabled={enrich.isPending}>
            <Wand2 className="h-4 w-4 mr-1" />{enrich.isPending ? "Enriquecendo…" : "Enriquecer com IA"}
          </Button>
        </div>
        <div className="grid sm:grid-cols-3 gap-2">
          <QuickLink
            icon={<Linkedin className="h-5 w-5" />}
            label="LinkedIn do lead"
            sublabel={lead.name}
            url={lead.linkedin_url}
          />
          <QuickLink
            icon={<Building2 className="h-5 w-5" />}
            label="LinkedIn da empresa"
            sublabel={lead.company_name}
            url={lead.company_linkedin}
          />
          <QuickLink
            icon={<Globe className="h-5 w-5" />}
            label="Site da empresa"
            sublabel={lead.company_name}
            url={lead.company_website}
          />
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Dados do lead</h2>
          <Field label="Email" value={lead.email} onSave={(v) => update.mutate({ email: v })} />
          <Field label="Telefone" value={lead.phone} onSave={(v) => update.mutate({ phone: v })} />
          <Field label="Cargo" value={lead.position} onSave={(v) => update.mutate({ position: v })} />
          <Field label="LinkedIn pessoal" value={lead.linkedin_url} onSave={(v) => update.mutate({ linkedin_url: v })} />
          <div>
            <p className="text-xs text-muted-foreground mb-1">Responsável pelo lead</p>
            <Select
              value={lead.assigned_to ?? "__none"}
              onValueChange={(v) => update.mutate({ assigned_to: v === "__none" ? null : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Sem responsável —</SelectItem>
                {data.profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name ?? p.email ?? p.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Tipo do lead</p>
              {lead.lead_type && (
                <Badge
                  variant="outline"
                  className="text-[10px]"
                  style={{
                    borderColor: LEAD_TYPE_COLOR[lead.lead_type as LeadType],
                    color: LEAD_TYPE_COLOR[lead.lead_type as LeadType],
                  }}
                >
                  {LEAD_TYPE_LABEL[lead.lead_type as LeadType]}
                </Badge>
              )}
            </div>
            <Select
              value={lead.lead_type ?? "__none"}
              onValueChange={(v) => update.mutate({ lead_type: v === "__none" ? null : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Não definido —</SelectItem>
                <SelectItem value="consultoria">Consultoria</SelectItem>
                <SelectItem value="empresa">Empresa</SelectItem>
                <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Demo Free</p>
            <Select
              value={lead.demo_free === null || lead.demo_free === undefined ? "__none" : lead.demo_free ? "yes" : "no"}
              onValueChange={(v) =>
                update.mutate({ demo_free: v === "__none" ? null : v === "yes" })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Não informado —</SelectItem>
                <SelectItem value="yes">Sim</SelectItem>
                <SelectItem value="no">Não</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />Empresa</h2>
          <Field label="Empresa" value={lead.company_name} onSave={(v) => update.mutate({ company_name: v })} />
          {lead.original_company_name && lead.original_company_name !== lead.company_name && (
            <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded-md px-2 py-1.5 text-amber-700 dark:text-amber-400">
              <span className="font-medium">Empresa no formulário:</span> {lead.original_company_name}
              <p className="text-[10px] opacity-80 mt-0.5">Lead converteu com essa empresa, mas o LinkedIn mostra empresa atual diferente.</p>
            </div>
          )}
          <Field label="Site" value={lead.company_website} onSave={(v) => update.mutate({ company_website: v })} />
          <Field label="LinkedIn empresa" value={lead.company_linkedin} onSave={(v) => update.mutate({ company_linkedin: v })} />
          <Field label="Área" value={lead.company_segment} onSave={(v) => update.mutate({ company_segment: v })} />
          <Field label="Tamanho" value={lead.company_size} onSave={(v) => update.mutate({ company_size: v })} />
          {lead.linkedin_company_size && lead.linkedin_company_size !== lead.company_size && (
            <div className="text-xs bg-blue-500/10 border border-blue-500/30 rounded-md px-2 py-1.5 text-blue-700 dark:text-blue-400">
              <span className="font-medium">Tamanho no LinkedIn:</span> {lead.linkedin_company_size}
              <p className="text-[10px] opacity-80 mt-0.5">Porte informado no formulário difere do tamanho atual da empresa no LinkedIn.</p>
            </div>
          )}
          <Field label="Localização" value={lead.company_location} onSave={(v) => update.mutate({ company_location: v })} />
          <div>
            <p className="text-xs text-muted-foreground mb-1">Análise da empresa (IA)</p>
            <Textarea
              value={lead.company_summary ?? ""}
              onChange={(e) => update.mutate({ company_summary: e.target.value })}
              rows={4}
              placeholder="Clique em Enriquecer com IA para gerar a análise."
            />
          </div>
        </Card>
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Contexto de conversão</h2>
          <span className="text-xs text-muted-foreground">{lead.enrichment_status}</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <Info label="Origem" value={lead.source} />
          <Info label="Canal" value={lead.channel} />
          <Info label="Campanha" value={lead.campaign} />
          <Info label="Anúncio" value={lead.ad_name} />
          <Info label="Formulário" value={lead.form_name} />
          <Info label="Conversão" value={lead.converted_at} />
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Abordagem</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => enrich.mutate()} disabled={enrich.isPending}>
              <Wand2 className="h-4 w-4 mr-1" />{enrich.isPending ? "Enriquecendo…" : "Enriquecer com IA"}
            </Button>
            <Button size="sm" onClick={() => suggest.mutate()} disabled={suggest.isPending}>
              <Sparkles className="h-4 w-4 mr-1" />{suggest.isPending ? "Gerando…" : "Sugerir mensagem"}
            </Button>
          </div>
        </div>
        {suggestion && (
          <div className="bg-muted rounded-md p-3 border">
            <div className="flex justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground">Sugestão IA</p>
              <div className="flex items-center gap-3">
                <button onClick={() => { navigator.clipboard.writeText(suggestion); toast.success("Copiado"); }} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                  <Copy className="h-3 w-3" /> Copiar
                </button>
                {whatsappUrl && (
                  <a href={whatsappUrl} target="_blank" rel="noreferrer">
                    <Button size="sm" className="bg-[#25D366] hover:bg-[#25D366]/90 text-white h-7 px-2.5">
                      <MessageSquare className="h-3.5 w-3.5 mr-1" /> Enviar no WhatsApp
                    </Button>
                  </a>
                )}
              </div>
            </div>
            <p className="text-sm whitespace-pre-wrap">{suggestion}</p>
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> WhatsApp
          </h2>
          {lead.phone && (
            <span className="text-xs text-muted-foreground">{lead.phone}</span>
          )}
        </div>
        <LeadWhatsappTab leadId={lead.id} leadHasPhone={!!lead.phone} />
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">Observações internas</h2>
          <div className="space-y-2">
            <Textarea placeholder="Adicione uma observação…" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            <Button size="sm" disabled={!note.trim()} onClick={() => addNoteMut.mutate(note)}>Adicionar</Button>
          </div>
          <div className="space-y-2 max-h-64 overflow-auto">
            {data.notes.map((n) => (
              <div key={n.id} className="border-l-2 border-primary/40 pl-3 py-1">
                <p className="text-sm">{n.content}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString("pt-BR")}</p>
              </div>
            ))}
            {data.notes.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma observação.</p>}
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">Histórico de interações</h2>
          <div className="space-y-2 max-h-72 overflow-auto">
            {data.interactions.map((i) => (
              <div key={i.id} className="text-sm border-b pb-2 last:border-0">
                <div className="flex justify-between">
                  <span className="text-xs font-semibold text-primary">{labelForInteraction(i.type)}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(i.created_at).toLocaleString("pt-BR")}</span>
                </div>
                {i.content && <p className="text-xs mt-1 whitespace-pre-wrap">{i.content}</p>}
              </div>
            ))}
            {data.interactions.length === 0 && <p className="text-xs text-muted-foreground">Sem interações.</p>}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-semibold mb-2">Resultado da abordagem</h2>
        <Textarea
          defaultValue={lead.approach_result ?? ""}
          onBlur={(e) => { if (e.target.value !== (lead.approach_result ?? "")) update.mutate({ approach_result: e.target.value }); }}
          rows={3}
        />
      </Card>
    </div>
  );
}

function Field({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string) => void }) {
  const [v, setV] = useState(value ?? "");
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <Input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== (value ?? "")) onSave(v); }} />
    </div>
  );
}

function QuickLink({ icon, label, sublabel, url }: { icon: React.ReactNode; label: string; sublabel: string | null; url: string | null }) {
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-lg border bg-background p-3 hover:border-primary hover:bg-primary/5 transition-colors group"
      >
        <div className="text-primary">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{sublabel ?? url}</p>
        </div>
        <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
      </a>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/30 p-3">
      <div className="text-muted-foreground/60">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground/70">Não encontrado — clique em Enriquecer</p>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p>{value ?? "—"}</p>
    </div>
  );
}

function labelForInteraction(type: string) {
  switch (type) {
    case "rd_activity": return "Atividade RD";
    case "rd_note": return "Nota RD";
    case "whatsapp": return "WhatsApp";
    case "email": return "Email";
    case "call": return "Ligação";
    default: return type;
  }
}

function LostReasonDialog({
  initial,
  onClose,
  onConfirm,
}: {
  initial: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const reasons = ["Sem perfil", "Sem fit com soluções", "Sem contato", "Sem orçamento", "Timing inadequado", "Concorrência"];
  const initialMatch = reasons.includes(initial) ? initial : initial ? "__other" : reasons[0];
  const [selected, setSelected] = useState<string>(initialMatch);
  const [custom, setCustom] = useState(reasons.includes(initial) ? "" : initial);
  const isOther = selected === "__other";
  const finalReason = isOther ? custom.trim() : selected;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <Card className="p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1">Motivo de desqualificação</h2>
        <p className="text-xs text-muted-foreground mb-4">Escolha o motivo para mover este lead.</p>
        <div className="space-y-3">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {reasons.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
            <option value="__other">Outros…</option>
          </select>
          {isOther && (
            <Input
              placeholder="Descreva o motivo"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              autoFocus
            />
          )}
        </div>
        <div className="mt-5 flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={!finalReason} onClick={() => onConfirm(finalReason)}>Salvar</Button>
        </div>
      </Card>
    </div>
  );
}