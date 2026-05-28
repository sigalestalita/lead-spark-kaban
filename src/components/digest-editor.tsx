import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { updateDigestDraft, approveAndSendDigest } from "@/lib/digests.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save, Send, X } from "lucide-react";

type Digest = {
  id: string;
  subject: string;
  content_html: string;
  content_summary: string | null;
  status: string;
};

export function DigestEditor({
  digest,
  open,
  onOpenChange,
}: {
  digest: Digest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateDigestDraft);
  const sendFn = useServerFn(approveAndSendDigest);

  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [summary, setSummary] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");

  useEffect(() => {
    if (digest) {
      setSubject(digest.subject);
      setHtml(digest.content_html);
      setSummary(digest.content_summary ?? "");
      setPreviewHtml(digest.content_html);
    }
  }, [digest]);

  // Debounce iframe re-render
  useEffect(() => {
    const t = setTimeout(() => setPreviewHtml(html), 350);
    return () => clearTimeout(t);
  }, [html]);

  const isSent = digest?.status === "sent";

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          digestId: digest!.id,
          subject,
          contentHtml: html,
          contentSummary: summary,
        },
      }),
    onSuccess: () => {
      toast.success("Alterações salvas");
      qc.invalidateQueries({ queryKey: ["weekly-digests"] });
    },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? "erro"}`),
  });

  const saveAndSend = useMutation({
    mutationFn: async () => {
      await updateFn({
        data: {
          digestId: digest!.id,
          subject,
          contentHtml: html,
          contentSummary: summary,
        },
      });
      return sendFn({ data: { digestId: digest!.id } });
    },
    onSuccess: () => {
      toast.success("Enviado para time@grougp.com.br");
      qc.invalidateQueries({ queryKey: ["weekly-digests"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? "erro"}`),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1200px] max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle>{isSent ? "Visualizar edição enviada" : "Editar prévia da newsletter"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 flex-1 min-h-0 overflow-hidden">
          {/* Editor */}
          <div className="flex flex-col gap-3 p-6 overflow-y-auto border-r border-border">
            <div>
              <Label htmlFor="subject">Assunto do email</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={isSent}
                maxLength={200}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="summary">Resumo (aparece no card de /novidades)</Label>
              <Textarea
                id="summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                disabled={isSent}
                rows={3}
                className="mt-1 text-sm"
              />
            </div>
            <div className="flex flex-col flex-1 min-h-0">
              <Label htmlFor="html">HTML do email</Label>
              <Textarea
                id="html"
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                disabled={isSent}
                className="mt-1 flex-1 min-h-[300px] font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Edite com cuidado. Mudanças aparecem na pré-visualização ao lado.
              </p>
            </div>
          </div>

          {/* Preview */}
          <div className="flex flex-col bg-muted/30 overflow-hidden">
            <div className="px-6 py-2 border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
              Pré-visualização
            </div>
            <iframe
              srcDoc={previewHtml}
              className="w-full flex-1 bg-white"
              sandbox=""
              title="Preview"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-border bg-background">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="gap-2">
            <X className="h-4 w-4" />
            Fechar
          </Button>
          {!isSent && (
            <>
              <Button
                variant="outline"
                onClick={() => save.mutate()}
                disabled={save.isPending || saveAndSend.isPending}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {save.isPending ? "Salvando…" : "Salvar alterações"}
              </Button>
              <Button
                onClick={() => saveAndSend.mutate()}
                disabled={save.isPending || saveAndSend.isPending}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                {saveAndSend.isPending ? "Enviando…" : "Salvar e enviar"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}