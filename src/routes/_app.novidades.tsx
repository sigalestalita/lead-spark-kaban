import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listWeeklyDigests, triggerWeeklyDigestNow } from "@/lib/digests.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Sparkles, Mail, Send } from "lucide-react";

export const Route = createFileRoute("/_app/novidades")({
  head: () => ({ meta: [{ title: "Novidades — SDR GROU" }] }),
  component: NovidadesPage,
});

function NovidadesPage() {
  const fetchFn = useServerFn(listWeeklyDigests);
  const triggerFn = useServerFn(triggerWeeklyDigestNow);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["weekly-digests"],
    queryFn: () => fetchFn(),
  });
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const trigger = useMutation({
    mutationFn: () => triggerFn({ data: { force: true } }),
    onSuccess: () => {
      toast.success("Newsletter gerada e enviada para time@grougp.com.br");
      qc.invalidateQueries({ queryKey: ["weekly-digests"] });
    },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? "erro desconhecido"}`),
  });

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Novidades
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Histórico das edições semanais da newsletter enviadas ao time. Disparo automático toda quinta-feira às 9h para <span className="font-mono text-foreground">time@grougp.com.br</span>.
          </p>
        </div>
        <Button
          onClick={() => trigger.mutate()}
          disabled={trigger.isPending}
          className="gap-2"
        >
          <Send className="h-4 w-4" />
          {trigger.isPending ? "Gerando…" : "Gerar e enviar agora"}
        </Button>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      )}

      {!isLoading && data?.digests?.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma edição enviada ainda. Clique em "Gerar e enviar agora" para
          produzir a primeira edição.
        </Card>
      )}

      <div className="space-y-3">
        {data?.digests?.map((d: any) => (
          <Card key={d.id} className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-base">{d.subject}</h3>
                  <StatusBadge status={d.status} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Semana de {formatDate(d.week_start)}
                  {d.sent_at && ` · Enviado em ${formatDateTime(d.sent_at)}`}
                </p>
                {d.content_summary && (
                  <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap line-clamp-4">
                    {d.content_summary}
                  </p>
                )}
                {d.error_message && (
                  <p className="text-xs text-destructive mt-2">
                    Erro: {d.error_message}
                  </p>
                )}
                {d.stats && (
                  <div className="flex gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                    <span>📥 {d.stats.new_leads_count ?? 0} leads novos</span>
                    <span>✨ {d.stats.enriched_count ?? 0} enriquecidos</span>
                    <span>🎯 {d.stats.converted_count ?? 0} convertidos</span>
                    <span>💬 {d.stats.interactions_count ?? 0} interações</span>
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 shrink-0"
                onClick={() => setPreviewHtml(d.content_html)}
              >
                <Mail className="h-4 w-4" />
                Ver email
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!previewHtml} onOpenChange={(o) => !o && setPreviewHtml(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Pré-visualização do email</DialogTitle>
          </DialogHeader>
          {previewHtml && (
            <iframe
              srcDoc={previewHtml}
              className="w-full flex-1 min-h-[60vh] rounded-md border border-border bg-white"
              sandbox=""
              title="Preview"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "sent") return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Enviado</Badge>;
  if (status === "failed") return <Badge variant="destructive">Falhou</Badge>;
  return <Badge variant="secondary">Rascunho</Badge>;
}

function formatDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateTime(s: string) {
  return new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}