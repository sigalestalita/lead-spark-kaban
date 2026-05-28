import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listWeeklyDigests, triggerWeeklyDigestNow, approveAndSendDigest, triggerFirstLidiEdition } from "@/lib/digests.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Pencil, Send, FileText, Eye } from "lucide-react";
import { DigestEditor } from "@/components/digest-editor";

export const Route = createFileRoute("/_app/novidades")({
  head: () => ({ meta: [{ title: "Novidades — SDR GROU" }] }),
  component: NovidadesPage,
});

function NovidadesPage() {
  const fetchFn = useServerFn(listWeeklyDigests);
  const triggerFn = useServerFn(triggerWeeklyDigestNow);
  const sendFn = useServerFn(approveAndSendDigest);
  const firstEditionFn = useServerFn(triggerFirstLidiEdition);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["weekly-digests"],
    queryFn: () => fetchFn(),
  });
  const [editing, setEditing] = useState<any | null>(null);

  const trigger = useMutation({
    mutationFn: () => triggerFn({ data: { force: true } }),
    onSuccess: () => {
      toast.success("Prévia gerada. Revise antes de enviar.");
      qc.invalidateQueries({ queryKey: ["weekly-digests"] });
    },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? "erro desconhecido"}`),
  });

  const firstEdition = useMutation({
    mutationFn: () => firstEditionFn(),
    onSuccess: () => {
      toast.success("Edição de estreia da Lidi gerada. Revise antes de enviar.");
      qc.invalidateQueries({ queryKey: ["weekly-digests"] });
    },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? "erro desconhecido"}`),
  });

  const send = useMutation({
    mutationFn: (digestId: string) => sendFn({ data: { digestId } }),
    onSuccess: () => {
      toast.success("Enviado para time@grougp.com.br");
      qc.invalidateQueries({ queryKey: ["weekly-digests"] });
    },
    onError: (e: any) => toast.error(`Falha ao enviar: ${e?.message ?? "erro"}`),
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
            Toda quinta-feira às 9h uma prévia da newsletter é gerada automaticamente. Você revisa e aprova antes do envio para <span className="font-mono text-foreground">time@grougp.com.br</span>.
          </p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <Button
            onClick={() => firstEdition.mutate()}
            disabled={firstEdition.isPending}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            {firstEdition.isPending ? "Gerando estreia da Lidi…" : "Gerar edição de estreia da Lidi"}
          </Button>
          <Button
            variant="outline"
            onClick={() => trigger.mutate()}
            disabled={trigger.isPending}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            {trigger.isPending ? "Gerando prévia…" : "Gerar prévia padrão"}
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      )}

      {!isLoading && data?.digests?.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma edição ainda. Clique em "Gerar prévia agora" para criar a primeira.
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
              <div className="flex flex-col gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setEditing(d)}
                >
                  {d.status === "sent" ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                  {d.status === "sent" ? "Ver enviado" : "Editar prévia"}
                </Button>
                {d.status !== "sent" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-2"
                    onClick={() => send.mutate(d.id)}
                    disabled={send.isPending}
                  >
                    <Send className="h-4 w-4" />
                    {send.isPending ? "Enviando…" : "Enviar sem editar"}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <DigestEditor
        digest={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
      />
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