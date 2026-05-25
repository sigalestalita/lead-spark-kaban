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
import { toast } from "sonner";
import { PRIORITY_LABEL, PRIORITY_COLOR } from "@/lib/lead-types";
import { ArrowLeft, MessageSquare, Linkedin, Globe, Sparkles, Wand2, Copy, Building2 } from "lucide-react";

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

  const whatsappUrl = lead.phone
    ? `https://wa.me/${lead.phone.replace(/\D/g, "")}${
        suggestion ? `?text=${encodeURIComponent(suggestion)}` : ""
      }`
    : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <Link to="/kanban" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Voltar para o Kanban
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{lead.name}</h1>
          <p className="text-sm text-muted-foreground">{lead.position} {lead.company_name && `@ ${lead.company_name}`}</p>
          <div className="flex gap-2 mt-2 items-center">
            <Badge style={{ borderColor: PRIORITY_COLOR[lead.priority], color: PRIORITY_COLOR[lead.priority] }} variant="outline">
              {PRIORITY_LABEL[lead.priority]} · {lead.score} pts
            </Badge>
            <Button size="sm" variant="ghost" onClick={() => recalc.mutate()}>Recalcular</Button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer"><Button size="sm"><MessageSquare className="h-4 w-4 mr-1" />WhatsApp</Button></a>}
          {lead.linkedin_url && <a href={lead.linkedin_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><Linkedin className="h-4 w-4 mr-1" />Lead</Button></a>}
          {lead.company_linkedin && <a href={lead.company_linkedin} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><Building2 className="h-4 w-4 mr-1" />Empresa</Button></a>}
          {lead.company_website && <a href={lead.company_website} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><Globe className="h-4 w-4 mr-1" />Site</Button></a>}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Dados do lead</h2>
          <Field label="Email" value={lead.email} onSave={(v) => update.mutate({ email: v })} />
          <Field label="Telefone" value={lead.phone} onSave={(v) => update.mutate({ phone: v })} />
          <Field label="Cargo" value={lead.position} onSave={(v) => update.mutate({ position: v })} />
          <Field label="LinkedIn pessoal" value={lead.linkedin_url} onSave={(v) => update.mutate({ linkedin_url: v })} />
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />Empresa</h2>
          <Field label="Empresa" value={lead.company_name} onSave={(v) => update.mutate({ company_name: v })} />
          <Field label="Site" value={lead.company_website} onSave={(v) => update.mutate({ company_website: v })} />
          <Field label="LinkedIn empresa" value={lead.company_linkedin} onSave={(v) => update.mutate({ company_linkedin: v })} />
          <Field label="Segmento" value={lead.company_segment} onSave={(v) => update.mutate({ company_segment: v })} />
          <Field label="Tamanho" value={lead.company_size} onSave={(v) => update.mutate({ company_size: v })} />
          <Field label="Localização" value={lead.company_location} onSave={(v) => update.mutate({ company_location: v })} />
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
          <h2 className="font-semibold">Enriquecimento & abordagem</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => enrich.mutate()} disabled={enrich.isPending}>
              <Wand2 className="h-4 w-4 mr-1" />{enrich.isPending ? "Enriquecendo…" : "Enriquecer com IA"}
            </Button>
            <Button size="sm" onClick={() => suggest.mutate()} disabled={suggest.isPending}>
              <Sparkles className="h-4 w-4 mr-1" />{suggest.isPending ? "Gerando…" : "Sugerir mensagem"}
            </Button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Resumo da empresa</p>
            <Textarea value={lead.company_summary ?? ""} onChange={(e) => update.mutate({ company_summary: e.target.value })} rows={3} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Dor provável</p>
            <Textarea value={lead.probable_pain ?? ""} onChange={(e) => update.mutate({ probable_pain: e.target.value })} rows={3} />
          </div>
        </div>
        {suggestion && (
          <div className="bg-muted rounded-md p-3 border">
            <div className="flex justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground">Sugestão IA</p>
              <button onClick={() => { navigator.clipboard.writeText(suggestion); toast.success("Copiado"); }} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                <Copy className="h-3 w-3" /> Copiar
              </button>
            </div>
            <p className="text-sm whitespace-pre-wrap">{suggestion}</p>
          </div>
        )}
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
                  <span className="text-xs font-semibold text-primary">{i.type}</span>
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

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p>{value ?? "—"}</p>
    </div>
  );
}