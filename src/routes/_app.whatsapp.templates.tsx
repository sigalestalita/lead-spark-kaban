import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  submitTemplateToMeta,
  syncTemplatesFromMeta,
} from "@/lib/whatsapp-templates.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Send, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/whatsapp/templates")({
  component: TemplatesPage,
});

type TemplateRow = {
  id: string;
  name: string;
  category: string | null;
  language: string | null;
  body: string;
  variables: unknown;
  status: string | null;
  provider_template_name: string | null;
  header_text: string | null;
  footer_text: string | null;
  buttons: unknown;
  rejection_reason: string | null;
};

type BtnType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
type Btn =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string }
  | { type: "PHONE_NUMBER"; text: string; phone_number: string };

function extractVars(body: string): string[] {
  const m = body.match(/\{\{\s*([\w.]+)\s*\}\}/g) ?? [];
  return Array.from(new Set(m.map((s) => s.replace(/[{}\s]/g, ""))));
}

function TemplatesPage() {
  const listFn = useServerFn(listTemplates);
  const createFn = useServerFn(createTemplate);
  const updateFn = useServerFn(updateTemplate);
  const deleteFn = useServerFn(deleteTemplate);
  const submitFn = useServerFn(submitTemplateToMeta);
  const syncFn = useServerFn(syncTemplatesFromMeta);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["wa-templates"],
    queryFn: () => listFn(),
  });

  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"marketing" | "utility" | "authentication">("utility");
  const [language, setLanguage] = useState("pt_BR");
  const [body, setBody] = useState("");
  const [providerTemplateName, setProviderTemplateName] = useState("");
  const [headerText, setHeaderText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<Btn[]>([]);

  function openCreate() {
    setEditing(null);
    setName("");
    setCategory("utility");
    setLanguage("pt_BR");
    setBody("");
    setProviderTemplateName("");
    setHeaderText("");
    setFooterText("");
    setButtons([]);
    setOpen(true);
  }

  function openEdit(t: TemplateRow) {
    setEditing(t);
    setName(t.name);
    setCategory((t.category as "marketing" | "utility" | "authentication") ?? "utility");
    setLanguage(t.language ?? "pt_BR");
    setBody(t.body);
    setProviderTemplateName(t.provider_template_name ?? "");
    setHeaderText(t.header_text ?? "");
    setFooterText(t.footer_text ?? "");
    setButtons(Array.isArray(t.buttons) ? (t.buttons as Btn[]) : []);
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const variables = extractVars(body);
      const ptn = providerTemplateName.trim() || null;
      const cleanButtons = buttons.filter((b) => b.text?.trim());
      if (editing) {
        return updateFn({
          data: {
            id: editing.id,
            name,
            category,
            language,
            body,
            variables,
            provider_template_name: ptn,
            header_text: headerText.trim() || null,
            footer_text: footerText.trim() || null,
            buttons: cleanButtons,
          },
        });
      }
      return createFn({
        data: {
          name,
          category,
          language,
          body,
          variables,
          provider_template_name: ptn ?? undefined,
          header_text: headerText.trim() || null,
          footer_text: footerText.trim() || null,
          buttons: cleanButtons,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-templates"] });
      setOpen(false);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-templates"] }),
  });

  const submit = useMutation({
    mutationFn: (id: string) => submitFn({ data: { id } }),
    onSuccess: (r) => {
      toast.success(`Enviado à Meta como "${r.providerName}" — status: ${r.status}`);
      qc.invalidateQueries({ queryKey: ["wa-templates"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao enviar para a Meta"),
  });

  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      toast.success(`Sincronizado: ${r.updated} de ${r.remoteCount} templates na Meta`);
      qc.invalidateQueries({ queryKey: ["wa-templates"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao sincronizar com a Meta"),
  });

  const templates = (data?.templates ?? []) as TemplateRow[];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Templates de mensagem</h2>
          <p className="text-xs text-muted-foreground">
            Use variáveis como <code className="text-primary">{"{{nome}}"}</code>,{" "}
            <code className="text-primary">{"{{primeiro_nome}}"}</code> e{" "}
            <code className="text-primary">{"{{empresa}}"}</code>.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Novo template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar template" : "Novo template"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Nome interno</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: boas-vindas SDR" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Categoria</label>
                  <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="utility">Utility</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="authentication">Autenticação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Idioma</label>
                  <Input value={language} onChange={(e) => setLanguage(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Corpo</label>
                <Textarea
                  rows={6}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Olá {{primeiro_nome}}, tudo bem? Vi que vocês da {{empresa}}…"
                />
                {extractVars(body).length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Variáveis detectadas: {extractVars(body).map((v) => `{{${v}}}`).join(", ")}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Nome do template aprovado na Meta (HSM)
                </label>
                <Input
                  value={providerTemplateName}
                  onChange={(e) => setProviderTemplateName(e.target.value)}
                  placeholder="ex: boas_vindas_sdr"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Obrigatório para disparar fora da janela de 24h. Use o mesmo nome aprovado no Gerenciador do
                  WhatsApp Business. As variáveis acima são enviadas em ordem como {"{{1}}, {{2}}, …"}.
                </p>
              </div>
              {save.error instanceof Error && (
                <p className="text-xs text-destructive">{save.error.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending || !name || !body}>
                {save.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {!isLoading && templates.length === 0 && (
        <p className="text-xs text-muted-foreground border border-dashed border-white/10 rounded-lg p-6 text-center">
          Nenhum template criado ainda.
        </p>
      )}
      <div className="grid gap-3">
        {templates.map((t) => (
          <div key={t.id} className="border border-white/5 rounded-lg p-4 bg-card/50">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  <Badge variant="outline" className="text-[10px]">{t.category ?? "utility"}</Badge>
                  <Badge variant="outline" className="text-[10px]">{t.language ?? "pt_BR"}</Badge>
                  {(() => {
                    const s = (t.status ?? "draft").toLowerCase();
                    const styles: Record<string, string> = {
                      approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
                      pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
                      rejected: "bg-red-500/15 text-red-300 border-red-500/30",
                      draft: "bg-muted text-muted-foreground border-white/10",
                      paused: "bg-amber-500/15 text-amber-300 border-amber-500/30",
                      disabled: "bg-red-500/15 text-red-300 border-red-500/30",
                    };
                    return <Badge className={`text-[10px] ${styles[s] ?? styles.draft}`}>{s}</Badge>;
                  })()}
                  {t.provider_template_name ? (
                    <Badge className="text-[10px] bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                      HSM: {t.provider_template_name}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">
                      texto livre (24h)
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap line-clamp-3">{t.body}</p>
                {t.rejection_reason && (
                  <p className="text-[11px] text-red-400 mt-1">Motivo Meta: {t.rejection_reason}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={submit.isPending}
                  onClick={() => {
                    if (confirm(`Enviar "${t.name}" para aprovação da Meta?`)) submit.mutate(t.id);
                  }}
                >
                  <Send className="h-3.5 w-3.5 mr-1" /> Enviar p/ Meta
                </Button>
                <Button size="icon" variant="ghost" onClick={() => openEdit(t)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Excluir template "${t.name}"?`)) del.mutate(t.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}