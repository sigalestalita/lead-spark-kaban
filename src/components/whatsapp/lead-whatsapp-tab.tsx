import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrCreateConversationForLead, findConversationForLead } from "@/lib/whatsapp.functions";
import { ConversationView } from "./conversation-view";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

export function LeadWhatsappTab({ leadId, leadHasPhone }: { leadId: string; leadHasPhone: boolean }) {
  const findFn = useServerFn(findConversationForLead);
  const createFn = useServerFn(getOrCreateConversationForLead);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["wa-conv-for-lead", leadId],
    queryFn: () => findFn({ data: { leadId } }),
    enabled: leadHasPhone,
    retry: false,
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: { leadId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-conv-for-lead", leadId] }),
  });

  if (!leadHasPhone) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Esse lead não tem telefone cadastrado. Adicione um número para iniciar uma conversa por WhatsApp.
      </div>
    );
  }

  if (isLoading) return <div className="p-6 text-xs text-muted-foreground">Carregando conversa…</div>;

  if (error || !data?.conversation) {
    return (
      <div className="p-6 text-center space-y-3">
        <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {create.error instanceof Error
            ? create.error.message
            : "Nenhuma conversa iniciada com esse lead."}
        </p>
        <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? "Iniciando…" : "Iniciar conversa"}
        </Button>
      </div>
    );
  }

  return (
    <div className="h-[520px] flex flex-col rounded-lg border border-white/5 overflow-hidden bg-card">
      <ConversationView conversationId={data.conversation.id} />
    </div>
  );
}