import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAiAgentSettings, triggerManualAiTest, updateAiAgentSettings } from "@/lib/whatsapp-ai.functions";
import { listTemplates } from "@/lib/whatsapp-templates.functions";
import { getCampaignFilterMeta } from "@/lib/whatsapp-campaigns.functions";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/whatsapp/ia")({
  component: WhatsAppAiPage,
});

function WhatsAppAiPage() {
  const navigate = useNavigate();
  const getFn = useServerFn(getAiAgentSettings);
  const saveFn = useServerFn(updateAiAgentSettings);
  const testFn = useServerFn(triggerManualAiTest);
  const templatesFn = useServerFn(listTemplates);
  const metaFn = useServerFn(getCampaignFilterMeta);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["wa-ai-settings"], queryFn: () => getFn() });
  const { data: tmpls } = useQuery({ queryKey: ["wa-templates-mini"], queryFn: () => templatesFn() });
  const { data: meta } = useQuery({ queryKey: ["wa-camp-meta"], queryFn: () => metaFn() });

  const settings = data?.settings;
  const [dirty, setDirty] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [testPhone, setTestPhone] = useState("51999969371");
  const [testName, setTestName] = useState("Teste IA WhatsApp");

  useEffect(() => {
    if (settings && !dirty) setForm(settings);
  }, [settings, dirty]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: form }),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["wa-ai-settings"] });
    },
  });

  const triggerTest = useMutation({
    mutationFn: () => testFn({ data: { phone: testPhone, name: testName } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Teste da IA disparado para o número informado.");
      if (result.conversationId) {
        navigate({ to: "/whatsapp", search: { c: result.conversationId } as never });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao disparar teste da IA"),
  });

  if (isLoading || !form) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  const stages = meta?.stages ?? [];
  const templates = (tmpls?.templates ?? []).filter((t) => !!t.provider_template_name);
  const missingPrerequisites = [
    !form.enabled ? "Ative a IA de atendimento" : null,
    !form.initialOutreachEnabled ? "Ative o disparo inicial proativo" : null,
    !form.initialTemplateId ? "Selecione um template HSM inicial" : null,
  ].filter(Boolean) as string[];
  const canTriggerTest = !dirty && !triggerTest.isPending && !!testPhone.trim() && missingPrerequisites.length === 0;

  const patch = (next: Record<string, unknown>) => {
    setForm((prev: any) => ({ ...prev, ...next }));
    setDirty(true);
  };

  const handleTriggerTest = async () => {
    if (dirty) {
      toast.error("Salve as alterações da IA antes de disparar o teste manual.");
      return;
    }
    if (missingPrerequisites.length > 0) {
      toast.error(`Antes do teste: ${missingPrerequisites.join(" · ")}.`);
      return;
    }
    triggerTest.mutate();
  };

  const toggleStage = (id: string) => {
    const current = new Set(form.handoffStageIds ?? []);
    if (current.has(id)) current.delete(id); else current.add(id);
    patch({ handoffStageIds: Array.from(current) });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Bot className="h-5 w-5" /> IA de atendimento</h2>
          <p className="text-xs text-muted-foreground">
            Controla a IA proativa que faz o primeiro atendimento, inicia com HSM e qualifica até o ponto de handoff comercial.
          </p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending || !dirty}>
          <Save className="h-4 w-4 mr-1.5" /> {save.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ativação</CardTitle>
          <CardDescription>Defina quando a IA fica autorizada a iniciar e manter conversas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <label className="flex items-center justify-between rounded-lg border border-white/10 p-4 gap-4">
              <div>
                <p className="text-sm font-medium">IA habilitada</p>
                <p className="text-xs text-muted-foreground">Liga o motor de atendimento inteligente.</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-white/10 p-4 gap-4">
              <div>
                <p className="text-sm font-medium">Responder automaticamente</p>
                <p className="text-xs text-muted-foreground">Quando o lead responde no WhatsApp, a IA continua a qualificação e respeita pedido de atendimento humano.</p>
              </div>
              <Switch checked={form.autoReplyEnabled} onCheckedChange={(v) => patch({ autoReplyEnabled: v })} />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-white/10 p-4 gap-4">
              <div>
                <p className="text-sm font-medium">Disparo inicial proativo</p>
                <p className="text-xs text-muted-foreground">Todo lead novo recebe primeiro contato por template HSM no número conectado.</p>
              </div>
              <Switch checked={form.initialOutreachEnabled} onCheckedChange={(v) => patch({ initialOutreachEnabled: v })} />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-white/10 p-4 gap-4">
              <div>
                <p className="text-sm font-medium">Parar após resposta do lead</p>
                <p className="text-xs text-muted-foreground">Evita looping se o time quiser assumir manualmente logo após a primeira resposta do lead.</p>
              </div>
              <Switch checked={form.stopOnLeadReply} onCheckedChange={(v) => patch({ stopOnLeadReply: v })} />
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Template HSM inicial</label>
              <Select value={form.initialTemplateId ?? "none"} onValueChange={(v) => patch({ initialTemplateId: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">Use um template aprovado na Meta para iniciar a conversa fora da janela de 24h.</p>
              <p className="text-[11px] text-muted-foreground mt-1">Sugestão: o texto do template já pode abrir espaço para o lead pedir atendimento humano desde o início.</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Máximo de respostas automáticas por conversa</label>
              <Input type="number" min={1} max={50} value={form.responseMaxPerConversation} onChange={(e) => patch({ responseMaxPerConversation: Number(e.target.value) })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teste manual</CardTitle>
          <CardDescription>Dispara o template inicial da IA para validar o fluxo ponta a ponta no seu número.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {dirty ? (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Existem alterações não salvas. Salve antes de disparar o teste manual.
            </div>
          ) : null}
          {missingPrerequisites.length > 0 ? (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Pré-requisitos pendentes: {missingPrerequisites.join(" · ")}.
            </div>
          ) : null}
          <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground">Telefone</label>
              <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="51999969371" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Nome do lead de teste</label>
              <Input value={testName} onChange={(e) => setTestName(e.target.value)} placeholder="Teste IA WhatsApp" />
            </div>
            <Button onClick={handleTriggerTest} disabled={!canTriggerTest}>
              {triggerTest.isPending ? "Disparando…" : "Disparar teste"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prompt operacional</CardTitle>
          <CardDescription>O que a IA deve saber, como deve agir e quando precisa passar para humano.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Objetivo de qualificação</label>
            <Textarea value={form.qualificationObjective} onChange={(e) => patch({ qualificationObjective: e.target.value })} rows={3} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Guia de tom</label>
            <Textarea value={form.toneGuide} onChange={(e) => patch({ toneGuide: e.target.value })} rows={3} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Regras / claims proibidos</label>
            <Textarea value={form.prohibitedClaims} onChange={(e) => patch({ prohibitedClaims: e.target.value })} rows={3} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Prompt da primeira mensagem</label>
              <Textarea value={form.firstMessagePrompt} onChange={(e) => patch({ firstMessagePrompt: e.target.value })} rows={5} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Prompt de resposta contínua</label>
              <Textarea value={form.replyPrompt} onChange={(e) => patch({ replyPrompt: e.target.value })} rows={5} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Regras de handoff humano</label>
            <Textarea value={form.handoffPrompt} onChange={(e) => patch({ handoffPrompt: e.target.value })} rows={4} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Base de conhecimento adicional</label>
            <Textarea value={form.knowledgeBase} onChange={(e) => patch({ knowledgeBase: e.target.value })} rows={10} placeholder="Diferenciais, objeções, segmentos, FAQ, criativos, contexto das campanhas..." />
            <p className="text-[11px] text-muted-foreground mt-1">Inclua aqui contexto de campanhas Meta Ads, criativos, formulários e objeções por segmento para a IA usar no primeiro atendimento.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Etapas de handoff</CardTitle>
          <CardDescription>Quando o lead chegar em uma dessas etapas, a IA para de responder.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {stages.map((stage) => (
              <Badge
                key={stage.id}
                variant={(form.handoffStageIds ?? []).includes(stage.id) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleStage(stage.id)}
              >
                {stage.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}