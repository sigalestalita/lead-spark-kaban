import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listCampaigns,
  createCampaign,
  previewAudience,
  getCampaignFilterMeta,
} from "@/lib/whatsapp-campaigns.functions";
import { listTemplates } from "@/lib/whatsapp-templates.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Megaphone, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/whatsapp/campanhas")({
  component: CampaignsPage,
});

type Priority = "alta" | "media" | "baixa";
type DemoFreeF = "any" | "yes" | "no";

function CampaignsPage() {
  const listFn = useServerFn(listCampaigns);
  const createFn = useServerFn(createCampaign);
  const tmplFn = useServerFn(listTemplates);
  const metaFn = useServerFn(getCampaignFilterMeta);
  const previewFn = useServerFn(previewAudience);
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
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [demoFree, setDemoFree] = useState<DemoFreeF>("any");
  const [leadTypes, setLeadTypes] = useState<string[]>([]);

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

  const filters = useMemo(
    () => ({
      stageIds: stageIds.length ? stageIds : undefined,
      priorities: priorities.length ? priorities : undefined,
      demoFree: demoFree === "any" ? undefined : demoFree,
      leadType: leadTypes.length ? leadTypes : undefined,
    }),
    [stageIds, priorities, demoFree, leadTypes],
  );

  const { data: preview } = useQuery({
    queryKey: ["wa-camp-preview", filters],
    queryFn: () => previewFn({ data: { filters } }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async () => {
      const r = await createFn({
        data: { name, templateId, filters: filters },
      });
      return r;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["wa-campaigns"] });
      setOpen(false);
      navigate({ to: "/whatsapp/campanhas/$id", params: { id: r.campaign.id } });
    },
  });

  function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
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
                <p className="text-xs font-medium text-muted-foreground uppercase">Audiência</p>

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
          return (
            <Link
              key={c.id}
              to="/whatsapp/campanhas/$id"
              params={{ id: c.id }}
              className="flex items-center justify-between gap-3 p-3 border border-white/5 rounded-lg bg-card/50 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Megaphone className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {tmpl?.name ?? "—"} · criada em {new Date(c.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-[10px] capitalize">{c.status}</Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}