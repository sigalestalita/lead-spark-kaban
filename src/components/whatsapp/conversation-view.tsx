import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMessages, sendMessage } from "@/lib/whatsapp.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Send, Check, CheckCheck, AlertCircle, Clock } from "lucide-react";

type Msg = {
  id: string;
  body: string | null;
  sender_type: string;
  message_type: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  media_url: string | null;
};

export function ConversationView({ conversationId }: { conversationId: string }) {
  const listFn = useServerFn(listMessages);
  const sendFn = useServerFn(sendMessage);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["wa-messages", conversationId],
    queryFn: () => listFn({ data: { conversationId } }),
  });

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`wa-conv-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages", filter: `conversation_id=eq.${conversationId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
          qc.invalidateQueries({ queryKey: ["wa-conversations"] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, qc]);

  // auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.messages.length]);

  const send = useMutation({
    mutationFn: (body: string) => sendFn({ data: { conversationId, body, messageType: "text" } }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar"),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    send.mutate(v);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2 bg-muted/20"
      >
        {isLoading && (
          <p className="text-xs text-muted-foreground text-center">Carregando…</p>
        )}
        {data?.messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            Nenhuma mensagem ainda. Envie a primeira para iniciar a conversa.
          </p>
        )}
        {data?.messages.map((m) => (
          <MessageBubble key={m.id} m={m as Msg} />
        ))}
      </div>
      <form onSubmit={onSubmit} className="border-t border-white/5 p-3 flex gap-2 items-end">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit(e);
            }
          }}
          placeholder="Digite uma mensagem… (Enter envia, Shift+Enter quebra linha)"
          className="min-h-[44px] max-h-[160px] resize-none"
          disabled={send.isPending}
        />
        <Button type="submit" disabled={send.isPending || !text.trim()} size="sm">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function MessageBubble({ m }: { m: Msg }) {
  const mine = m.sender_type === "sdr" || m.sender_type === "bot";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          mine
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-card border border-white/5 rounded-bl-sm"
        }`}
      >
        {m.media_url && (
          <a href={m.media_url} target="_blank" rel="noreferrer" className="block mb-1 underline text-xs opacity-80">
            Anexo
          </a>
        )}
        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
        <div className={`flex items-center gap-1 mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          <span>
            {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {mine && <StatusIcon status={m.status} />}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "sending") return <Clock className="h-3 w-3" />;
  if (status === "sent") return <Check className="h-3 w-3" />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3" />;
  if (status === "read") return <CheckCheck className="h-3 w-3 text-blue-300" />;
  if (status === "failed") return <AlertCircle className="h-3 w-3 text-red-300" />;
  return null;
}