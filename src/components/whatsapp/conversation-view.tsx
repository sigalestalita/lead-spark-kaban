import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getConversationWindowState, listMessages, sendMessage, sendMediaFromStorage } from "@/lib/whatsapp.functions";
import {
  summarizeConversation,
  suggestReply,
  classifyTemperature,
  getConversationAi,
  suggestApproachPlan,
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
import { HsmTemplatePicker } from "./hsm-template-picker";
import { toast } from "sonner";
import {
  Send, Check, CheckCheck, AlertCircle, Clock,
  Sparkles, FileText, Thermometer, Loader2, Paperclip, Target,
} from "lucide-react";

type Msg = {
  id: string;
  body: string | null;
  sender_type: string;
  message_type: string;
  media_mime?: string | null;
  status: string;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  media_url: string | null;
  metadata?: {
    source?: string | null;
    template_name?: string | null;
    rendered_body?: string | null;
  } | null;
};

export function ConversationView({ conversationId }: { conversationId: string }) {
  const listFn = useServerFn(listMessages);
  const sendFn = useServerFn(sendMessage);
  const sendMediaFn = useServerFn(sendMediaFromStorage);
  const windowFn = useServerFn(getConversationWindowState);
  const aiGet = useServerFn(getConversationAi);
  const aiSummarize = useServerFn(summarizeConversation);
  const aiSuggest = useServerFn(suggestReply);
  const aiClassify = useServerFn(classifyTemperature);
  const aiPlan = useServerFn(suggestApproachPlan);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["wa-messages", conversationId],
    queryFn: () => listFn({ data: { conversationId } }),
  });

  const { data: ai } = useQuery({
    queryKey: ["wa-ai", conversationId],
    queryFn: () => aiGet({ data: { conversationId } }),
  });

  const { data: windowState } = useQuery({
    queryKey: ["wa-window", conversationId],
    queryFn: () => windowFn({ data: { conversationId } }),
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
          qc.invalidateQueries({ queryKey: ["wa-window", conversationId] });
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

  const plan = useMutation({
    mutationFn: () => aiPlan({ data: { conversationId } }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar plano"),
  });

  const sendTemplate = useMutation({
    mutationFn: (templateId: string) => sendFn({ data: { conversationId, messageType: "template", templateId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
      qc.invalidateQueries({ queryKey: ["wa-window", conversationId] });
      toast.success("HSM disparada.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao disparar HSM"),
  });

  const outside24hWindow = windowState ? !windowState.isOpen : false;

  async function handleFile(file: File) {
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo maior que 16MB.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
      const path = `conversations/${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext ? "." + ext : ""}`;
      const { error: upErr } = await supabase.storage
        .from("whatsapp-media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      await sendMediaFn({
        data: {
          conversationId,
          storagePath: path,
          mime: file.type || "application/octet-stream",
          caption: text.trim() || undefined,
        },
      });
      setText("");
      qc.invalidateQueries({ queryKey: ["wa-messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
      toast.success("Anexo enviado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar anexo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

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
        planning={plan.isPending}
        plan={plan.data ?? null}
        onSummarize={() => summarize.mutate()}
        onClassify={() => classify.mutate()}
        onPlan={() => plan.mutate()}
        onUsePlanMessage={(m) => setText(m)}
      />
      {outside24hWindow && (
        <div className="border-b border-white/5 p-3">
          <HsmTemplatePicker
            onSend={(templateId) => sendTemplate.mutate(templateId)}
            sending={sendTemplate.isPending}
            description={
              windowState?.lastInboundAt
                ? `A última resposta do lead foi em ${new Date(windowState.lastInboundAt).toLocaleString("pt-BR")}. Use um template aprovado para retomar o contato.`
                : "Ainda não há resposta do lead dentro da janela de 24h. Use um template aprovado para iniciar o contato."
            }
          />
        </div>
      )}
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
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          title="Anexar arquivo (imagem, vídeo, áudio, documento)"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || send.isPending}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
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
          placeholder="Digite uma mensagem ou anexe um arquivo (Enter envia, Shift+Enter quebra linha)"
          className="min-h-[44px] max-h-[160px] resize-none"
          disabled={send.isPending || uploading || outside24hWindow}
        />
        <Button type="submit" disabled={send.isPending || uploading || outside24hWindow || !text.trim()} size="sm">
          <Send className="h-4 w-4" />
        </Button>
      </form>
      {outside24hWindow && (
        <div className="px-3 pb-3 text-[11px] text-muted-foreground">
          Mensagens livres ficam bloqueadas fora da janela de 24h. Dispare uma HSM e aguarde a resposta do lead para reabrir o chat.
        </div>
      )}
    </div>
  );
}

function MessageBubble({ m }: { m: Msg }) {
  const mine = m.sender_type === "sdr" || m.sender_type === "bot" || m.sender_type === "automation" || m.sender_type === "agent";
  const templateFallback =
    m.message_type === "template"
      ? m.body ?? m.metadata?.rendered_body ?? (m.metadata?.template_name ? `[HSM] ${m.metadata.template_name}` : null)
      : null;
  const displayBody = templateFallback ?? m.body;
  const isAudio = m.message_type === "audio" || m.media_mime?.startsWith("audio/");
  const senderLabel =
    m.sender_type === "bot"
      ? "IA"
      : m.sender_type === "automation"
        ? "Automação"
        : m.sender_type === "sdr" || m.sender_type === "agent"
          ? "Time"
          : "Lead";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          mine
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-card border border-white/5 rounded-bl-sm"
        }`}
      >
        <div className={`mb-1 text-[10px] uppercase tracking-wide ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          {senderLabel}
        </div>
        {m.media_url ? (
          isAudio ? (
            <audio
              controls
              preload="metadata"
              className="mb-2 h-10 w-full max-w-[280px]"
            >
              <source src={m.media_url} type={m.media_mime ?? undefined} />
              Seu navegador não suporta reprodução de áudio.
            </audio>
          ) : (
            <a href={m.media_url} target="_blank" rel="noreferrer" className="block mb-1 underline text-xs opacity-80">
              Anexo
            </a>
          )
        ) : isAudio ? (
          <div className={`mb-2 flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${mine ? "border-primary-foreground/20 text-primary-foreground/80" : "border-white/10 text-muted-foreground"}`}>
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Áudio recebido sem arquivo disponível</span>
          </div>
        ) : null}
        {displayBody && <p className="whitespace-pre-wrap break-words">{displayBody}</p>}
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
  planning,
  plan,
  onSummarize,
  onClassify,
  onPlan,
  onUsePlanMessage,
}: {
  ai: AiState;
  summarizing: boolean;
  classifying: boolean;
  planning: boolean;
  plan:
    | {
        diagnosis: string;
        options: Array<{
          strategy: string;
          rationale: string;
          message: string;
          expected_conversion: "alta" | "média" | "baixa";
        }>;
      }
    | null;
  onSummarize: () => void;
  onClassify: () => void;
  onPlan: () => void;
  onUsePlanMessage: (m: string) => void;
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

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
            <Target className="h-3.5 w-3.5" /> Plano
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px]" align="start">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Plano de abordagem (SDR sênior)</p>
              <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={onPlan} disabled={planning}>
                {planning ? <Loader2 className="h-3 w-3 animate-spin" /> : plan ? "Atualizar" : "Gerar"}
              </Button>
            </div>
            {!plan && (
              <p className="text-[11px] text-muted-foreground">
                Gera 3 próximos passos com táticas distintas, ordenados por probabilidade de conversão.
              </p>
            )}
            {plan && (
              <>
                <p className="text-[11px] text-muted-foreground italic">{plan.diagnosis}</p>
                <div className="space-y-2">
                  {plan.options.map((opt, i) => (
                    <div key={i} className="rounded-md border border-white/10 p-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium">{i + 1}. {opt.strategy}</p>
                        <Badge variant="outline" className="text-[10px]">{opt.expected_conversion}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{opt.rationale}</p>
                      <p className="text-xs whitespace-pre-wrap bg-muted/30 rounded p-1.5">{opt.message}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px] w-full"
                        onClick={() => onUsePlanMessage(opt.message)}
                      >
                        Usar esta mensagem
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}