import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrCreateConversationForLead, findConversationForLead, sendMessage } from "@/lib/whatsapp.functions";
import { ConversationView } from "./conversation-view";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { HsmTemplatePicker } from "./hsm-template-picker";
import { toast } from "sonner";

export function LeadWhatsappTab({ leadId, leadHasPhone }: { leadId: string; leadHasPhone: boolean }) {
  const findFn = useServerFn(findConversationForLead);
  const createFn = useServerFn(getOrCreateConversationForLead);
  const sendFn = useServerFn(sendMessage);
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

  const sendTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const conversation = data?.conversation ?? (await createFn({ data: { leadId } })).conversation;
      await sendFn({ data: { conversationId: conversation.id, messageType: "template", templateId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-conv-for-lead", leadId] });
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
      toast.success("HSM disparada.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao disparar HSM"),
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
          {error instanceof Error
            ? error.message
            : create.error instanceof Error
              ? create.error.message
              : "Nenhuma conversa com janela aberta para esse lead."}
        </p>
        <HsmTemplatePicker
          onSend={(templateId) => sendTemplate.mutate(templateId)}
          sending={sendTemplate.isPending || create.isPending}
          title="Iniciar abordagem com HSM"
          description="Como não há conversa com janela aberta, escolha um template aprovado para disparar a primeira abordagem ao lead."
        />
        <Button size="sm" variant="outline" onClick={() => create.mutate()} disabled={create.isPending || sendTemplate.isPending}>
          {create.isPending ? "Preparando…" : "Criar conversa sem disparo"}
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