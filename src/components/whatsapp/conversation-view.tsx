import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMessages, sendMessage } from "@/lib/whatsapp.functions";
import {
  summarizeConversation,
  suggestReply,
  classifyTemperature,
  getConversationAi,
} from "@/lib/whatsapp-ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import {
  Send, Check, CheckCheck, AlertCircle, Clock,
  Sparkles, FileText, Thermometer, Loader2,
} from "lucide-react";

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
  const aiGet = useServerFn(getConversationAi);
  const aiSummarize = useServerFn(summarizeConversation);
  const aiSuggest = useServerFn(suggestReply);
  const aiClassify = useServerFn(classifyTemperature);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["wa-messages", conversationId],
    queryFn: () => listFn({ data: { conversationId } }),
  });

  const { data: ai } = useQuery({
    queryKey: ["wa-ai", conversationId],
    queryFn: () => aiGet({ data: { conversationId } }),
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

  const summarize = useMutation({
    mutationFn: () => aiSummarize({ data: { conversationId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-ai", conversationId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao resumir"),
  });

  const classify = useMutation({
    mutationFn: () => aiClassify({ data: { conversationId } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["wa-ai", conversationId] });
      toast.success(`Temperatura: ${r.temperature}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao classificar"),
  });

  const suggest = useMutation({
    mutationFn: () => aiSuggest({ data: { conversationId } }),
    onSuccess: (r) => {
      setText(r.reply);
      toast.success("Sugestão pronta no campo de mensagem.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao sugerir"),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    send.mutate(v);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <AiToolbar
        ai={ai ?? null}
        summarizing={summarize.isPending}
        classifying={classify.isPending}
        onSummarize={() => summarize.mutate()}
        onClassify={() => classify.mutate()}
      />
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          title="Sugerir resposta com IA"
          onClick={() => suggest.mutate()}
          disabled={suggest.isPending || send.isPending}
        >
          {suggest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        </Button>
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

type AiState = {
  ai_summary: string | null;
  ai_summary_at: string | null;
  temperature: string | null;
  temperature_reason: string | null;
  temperature_at: string | null;
} | null;

function AiToolbar({
  ai,
  summarizing,
  classifying,
  onSummarize,
  onClassify,
}: {
  ai: AiState;
  summarizing: boolean;
  classifying: boolean;
  onSummarize: () => void;
  onClassify: () => void;
}) {
  const tempColor =
    ai?.temperature === "quente"
      ? "border-red-500/40 text-red-300 bg-red-500/10"
      : ai?.temperature === "morno"
        ? "border-amber-500/40 text-amber-300 bg-amber-500/10"
        : ai?.temperature === "frio"
          ? "border-sky-500/40 text-sky-300 bg-sky-500/10"
          : "border-white/10 text-muted-foreground";
  return (
    <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2 bg-background/40">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1 shrink-0">
        <Sparkles className="h-3 w-3" /> IA
      </span>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            <FileText className="h-3.5 w-3.5" /> Resumo
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96" align="start">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Resumo da conversa</p>
              <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={onSummarize} disabled={summarizing}>
                {summarizing ? <Loader2 className="h-3 w-3 animate-spin" /> : ai?.ai_summary ? "Atualizar" : "Gerar"}
              </Button>
            </div>
            {ai?.ai_summary ? (
              <>
                <p className="text-xs whitespace-pre-wrap text-foreground">{ai.ai_summary}</p>
                {ai.ai_summary_at && (
                  <p className="text-[10px] text-muted-foreground">
                    Gerado em {new Date(ai.ai_summary_at).toLocaleString("pt-BR")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Sem resumo ainda. Clique em <strong>Gerar</strong>.
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={`h-7 text-xs gap-1 ${tempColor}`}>
            <Thermometer className="h-3.5 w-3.5" />
            {ai?.temperature ?? "Classificar"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Temperatura do lead</p>
              <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={onClassify} disabled={classifying}>
                {classifying ? <Loader2 className="h-3 w-3 animate-spin" /> : ai?.temperature ? "Reclassificar" : "Classificar"}
              </Button>
            </div>
            {ai?.temperature ? (
              <>
                <Badge variant="outline" className={`text-[10px] ${tempColor}`}>{ai.temperature}</Badge>
                {ai.temperature_reason && (
                  <p className="text-xs text-muted-foreground">{ai.temperature_reason}</p>
                )}
                {ai.temperature_at && (
                  <p className="text-[10px] text-muted-foreground">
                    Avaliado em {new Date(ai.temperature_at).toLocaleString("pt-BR")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                A IA vai analisar a conversa e indicar se o lead está quente, morno ou frio.
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}