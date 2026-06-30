import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listCampaigns,
  createCampaign,
  previewAudience,
  getCampaignFilterMeta,
  launchCampaign,
} from "@/lib/whatsapp-campaigns.functions";
import { listTemplates } from "@/lib/whatsapp-templates.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Megaphone, ChevronRight, Upload, Send } from "lucide-react";

export const Route = createFileRoute("/_app/whatsapp/campanhas")({
  component: CampaignsPage,
});

type Priority = "alta" | "media" | "baixa";
type DemoFreeF = "any" | "yes" | "no";
type AudienceSource = "filters" | "phones";
type PhoneEntry = { phone: string; name?: string; company?: string };

function parseCsv(text: string): PhoneEntry[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  // detecta header
  const first = lines[0].toLowerCase();
  const hasHeader = /phone|telefone|numero|whatsapp/.test(first);
  const dataLines = hasHeader ? lines.slice(1) : lines;
  let phoneIdx = 0;
  let nameIdx = -1;
  let companyIdx = -1;
  if (hasHeader) {
    const cols = lines[0].split(/[,;\t]/).map((c) => c.trim().toLowerCase());
    phoneIdx = cols.findIndex((c) => /phone|telefone|numero|whatsapp/.test(c));
    nameIdx = cols.findIndex((c) => /name|nome/.test(c));
    companyIdx = cols.findIndex((c) => /company|empresa/.test(c));
    if (phoneIdx < 0) phoneIdx = 0;
  }
  const out: PhoneEntry[] = [];
  for (const line of dataLines) {
    const cols = line.split(/[,;\t]/).map((c) => c.trim());
    const phone = (cols[phoneIdx] ?? "").replace(/^["']|["']$/g, "");
    if (!phone) continue;
    out.push({
      phone,
      name: nameIdx >= 0 ? cols[nameIdx]?.replace(/^["']|["']$/g, "") : undefined,
      company: companyIdx >= 0 ? cols[companyIdx]?.replace(/^["']|["']$/g, "") : undefined,
    });
  }
  return out;
}

function parseManualPhones(text: string): PhoneEntry[] {
  return text
    .split(/[\s,;\n]+/)
    .map((p) => p.trim())
    .filter((p) => p.replace(/\D/g, "").length >= 8)
    .map((phone) => ({ phone }));
}

function CampaignsPage() {
  const listFn = useServerFn(listCampaigns);
  const createFn = useServerFn(createCampaign);
  const tmplFn = useServerFn(listTemplates);
  const metaFn = useServerFn(getCampaignFilterMeta);
  const previewFn = useServerFn(previewAudience);
  const launchFn = useServerFn(launchCampaign);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: list, isLoading } = useQuery({
    queryKey: ["wa-campaigns"],
    queryFn: () => listFn(),
    refetchInterval: 8000,
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [source, setSource] = useState<AudienceSource>("filters");
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [demoFree, setDemoFree] = useState<DemoFreeF>("any");
  const [leadTypes, setLeadTypes] = useState<string[]>([]);
  const [companySizes, setCompanySizes] = useState<string[]>([]);
  const [emailDomainsText, setEmailDomainsText] = useState("");
  const [csvText, setCsvText] = useState("");
  const [manualText, setManualText] = useState("");

  const { data: tmpls } = useQuery({
    queryKey: ["wa-templates-mini"],
    queryFn: () => tmplFn(),
    enabled: open,
  });
  const { data: meta } = useQuery({
    queryKey: ["wa-camp-meta"],
    queryFn: () => metaFn(),
    enabled: open,
  });

  const emailDomains = useMemo(
    () => emailDomainsText.split(/[\s,;]+/).map((d) => d.trim()).filter(Boolean),
    [emailDomainsText],
  );

  const phoneEntries = useMemo<PhoneEntry[]>(() => {
    if (source !== "phones") return [];
    const merged = [...parseCsv(csvText), ...parseManualPhones(manualText)];
    // dedupe por dígitos
    const seen = new Set<string>();
    return merged.filter((e) => {
      const k = e.phone.replace(/\D/g, "");
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [source, csvText, manualText]);

  const audience = useMemo(() => {
    if (source === "phones") {
      return { source: "phones" as const, phones: phoneEntries };
    }
    return {
      source: "filters" as const,
      filters: {
        stageIds: stageIds.length ? stageIds : undefined,
        priorities: priorities.length ? priorities : undefined,
        demoFree: demoFree === "any" ? undefined : demoFree,
        leadType: leadTypes.length ? leadTypes : undefined,
        companySizes: companySizes.length ? companySizes : undefined,
        emailDomains: emailDomains.length ? emailDomains : undefined,
      },
    };
  }, [source, phoneEntries, stageIds, priorities, demoFree, leadTypes, companySizes, emailDomains]);

  const { data: preview } = useQuery({
    queryKey: ["wa-camp-preview", audience],
    queryFn: () => previewFn({ data: { audience } }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async () => {
      const r = await createFn({
        data: { name, templateId, audience },
      });
      return r;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["wa-campaigns"] });
      setOpen(false);
      navigate({ to: "/whatsapp/campanhas/$id", params: { id: r.campaign.id } });
    },
  });

  const launch = useMutation({
    mutationFn: (id: string) => launchFn({ data: { id, limit: 200 } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-campaigns"] }),
  });

  function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  function onCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  const campaigns = list?.campaigns ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Campanhas em massa</h2>
          <p className="text-xs text-muted-foreground">Dispare templates para audiências segmentadas de leads.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova campanha</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nova campanha</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Nome</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Reativação fev/26" />
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
                </div>
              </div>

              <div className="border border-white/5 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Audiência</p>
                  <div className="flex gap-1">
                    {(["filters", "phones"] as AudienceSource[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSource(s)}
                        className={`text-[11px] px-2 py-1 rounded border ${
                          source === s
                            ? "bg-primary/15 border-primary/40 text-primary"
                            : "border-white/10 text-muted-foreground hover:bg-white/5"
                        }`}
                      >
                        {s === "filters" ? "Filtros" : "CSV / Números"}
                      </button>
                    ))}
                  </div>
                </div>

                {source === "filters" && (
                  <>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Estágios</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(meta?.stages ?? []).map((s) => {
                      const active = stageIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setStageIds(toggle(stageIds, s.id))}
                          className={`text-xs px-2 py-1 rounded border ${
                            active ? "bg-primary/15 border-primary/40 text-primary" : "border-white/10 text-muted-foreground hover:bg-white/5"
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Prioridade</p>
                  <div className="flex gap-1.5">
                    {(["alta", "media", "baixa"] as Priority[]).map((p) => {
                      const active = priorities.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriorities(toggle(priorities, p))}
                          className={`text-xs px-2 py-1 rounded border capitalize ${
                            active ? "bg-primary/15 border-primary/40 text-primary" : "border-white/10 text-muted-foreground hover:bg-white/5"
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Demo Free</p>
                    <Select value={demoFree} onValueChange={(v) => setDemoFree(v as DemoFreeF)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Qualquer</SelectItem>
                        <SelectItem value="yes">Sim</SelectItem>
                        <SelectItem value="no">Não</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(meta?.leadTypes ?? []).length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Tipo de lead</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(meta?.leadTypes ?? []).map((lt) => {
                          const active = leadTypes.includes(lt);
                          return (
                            <button
                              key={lt}
                              type="button"
                              onClick={() => setLeadTypes(toggle(leadTypes, lt))}
                              className={`text-xs px-2 py-1 rounded border ${
                                active ? "bg-primary/15 border-primary/40 text-primary" : "border-white/10 text-muted-foreground hover:bg-white/5"
                              }`}
                            >
                              {lt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {(meta?.companySizes ?? []).length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Porte (company size)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(meta?.companySizes ?? []).map((cs) => {
                        const active = companySizes.includes(cs);
                        return (
                          <button
                            key={cs}
                            type="button"
                            onClick={() => setCompanySizes(toggle(companySizes, cs))}
                            className={`text-xs px-2 py-1 rounded border ${
                              active ? "bg-primary/15 border-primary/40 text-primary" : "border-white/10 text-muted-foreground hover:bg-white/5"
                            }`}
                          >
                            {cs}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Domínios de email (separados por vírgula)</p>
                  <Input
                    value={emailDomainsText}
                    onChange={(e) => setEmailDomainsText(e.target.value)}
                    placeholder="ex: empresa.com, @consultoria.com.br"
                    className="h-8 text-xs"
                  />
                </div>
                  </>
                )}

                {source === "phones" && (
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-muted-foreground">Upload CSV</p>
                        <label className="text-[11px] text-primary hover:underline cursor-pointer flex items-center gap-1">
                          <Upload className="h-3 w-3" />
                          escolher arquivo
                          <input
                            type="file"
                            accept=".csv,text/csv,text/plain"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) onCsvFile(f);
                            }}
                          />
                        </label>
                      </div>
                      <Textarea
                        value={csvText}
                        onChange={(e) => setCsvText(e.target.value)}
                        placeholder={"phone,name,company\n11999998888,Maria,Acme\n5511988887777,João,Beta"}
                        className="text-xs font-mono min-h-[90px]"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Header opcional. Colunas suportadas: phone/telefone, name/nome, company/empresa. Separadores: vírgula, ponto-e-vírgula ou tab.
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Ou cole números manualmente</p>
                      <Textarea
                        value={manualText}
                        onChange={(e) => setManualText(e.target.value)}
                        placeholder={"11999998888\n5511988887777"}
                        className="text-xs font-mono min-h-[70px]"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Um número por linha (ou separado por vírgula/espaço). Números BR sem DDI 55 recebem o prefixo automaticamente.
                      </p>
                    </div>
                  </div>
                )}

                <div className="text-xs flex items-center justify-between border-t border-white/5 pt-3">
                  <span className="text-muted-foreground">Audiência estimada (com telefone)</span>
                  <span className="font-semibold text-base">{preview?.count ?? 0}</span>
                </div>
              </div>

              {create.error instanceof Error && (
                <p className="text-xs text-destructive">{create.error.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => create.mutate()}
                disabled={create.isPending || !name || !templateId}
              >
                {create.isPending ? "Criando…" : "Criar como rascunho"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {!isLoading && campaigns.length === 0 && (
        <p className="text-xs text-muted-foreground border border-dashed border-white/10 rounded-lg p-6 text-center">
          Nenhuma campanha criada ainda.
        </p>
      )}
      <div className="grid gap-2">
        {campaigns.map((c) => {
          const tmpl = (c as { whatsapp_templates: { name: string } | null }).whatsapp_templates;
          const canLaunch = c.status === "draft" || c.status === "scheduled";
          const isLaunching = launch.isPending && launch.variables === c.id;
          return (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 p-3 border border-white/5 rounded-lg bg-card/50 hover:bg-white/5 transition-colors"
            >
              <Link
                to="/whatsapp/campanhas/$id"
                params={{ id: c.id }}
                className="flex items-center gap-3 min-w-0 flex-1"
              >
                <Megaphone className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate hover:text-primary">{c.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {tmpl?.name ?? "—"} · criada em {new Date(c.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-[10px] capitalize">{c.status}</Badge>
                {canLaunch && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => launch.mutate(c.id)}
                    disabled={isLaunching}
                  >
                    <Send className="h-3.5 w-3.5 mr-1" />
                    {isLaunching ? "Enviando…" : "Disparar"}
                  </Button>
                )}
                <Link to="/whatsapp/campanhas/$id" params={{ id: c.id }}>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </div>
            </div>
          );
        })}
        {launch.error instanceof Error && (
          <p className="text-xs text-destructive">{launch.error.message}</p>
        )}
      </div>
    </div>
  );
}