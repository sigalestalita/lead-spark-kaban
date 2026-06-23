import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getThread, sendMessage } from "@/lib/analytics-chat.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Wrench, ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/analytics-chat/$threadId")({
  component: ChatThread,
});

type Msg = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> | null;
  tool_results?: Array<{ id: string; name: string; result: unknown }> | null;
  created_at: string;
};

function ChatThread() {
  const { threadId } = useParams({ from: "/_app/analytics-chat/$threadId" });
  const get = useServerFn(getThread);
  const send = useServerFn(sendMessage);
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const threadQ = useQuery({
    queryKey: ["act-thread", threadId],
    queryFn: () => get({ data: { id: threadId } }),
  });

  const mut = useMutation({
    mutationFn: (content: string) => send({ data: { threadId, content } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["act-thread", threadId] });
      qc.invalidateQueries({ queryKey: ["act-threads"] });
      setTimeout(() => inputRef.current?.focus(), 50);
    },
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadQ.data?.messages.length, mut.isPending]);

  function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || mut.isPending) return;
    setInput("");
    mut.mutate(text);
  }

  const messages = (threadQ.data?.messages ?? []) as Msg[];
  const visible = messages.filter((m) => m.role === "user" || m.role === "assistant");

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 py-3 border-b border-white/5">
        <p className="text-sm font-medium truncate">{threadQ.data?.thread.title ?? "Conversa"}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="max-w-3xl mx-auto space-y-5">
          {visible.length === 0 && !mut.isPending && (
            <EmptySuggestions onPick={(s) => setInput(s)} />
          )}
          {visible.map((m) => (
            <MessageBubble key={m.id} m={m} />
          ))}
          {mut.isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando dados…
            </div>
          )}
          {mut.error && (
            <div className="text-xs text-destructive">
              {(mut.error as Error).message}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className="border-t border-white/5 p-3 bg-card/30"
      >
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Pergunte sobre leads, campanhas, conversão, perfil… (Enter envia, Shift+Enter quebra linha)"
            className="min-h-[52px] max-h-40 resize-none text-sm"
            disabled={mut.isPending}
          />
          <Button type="submit" disabled={mut.isPending || !input.trim()} size="icon" className="h-[52px] w-12 shrink-0">
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ m }: { m: Msg }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap">
          {m.content}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {m.tool_calls && m.tool_calls.length > 0 && (
        <ToolActivity calls={m.tool_calls} results={m.tool_results ?? []} />
      )}
      <div className="prose prose-sm prose-invert max-w-none text-sm">
        <ReactMarkdown>{m.content}</ReactMarkdown>
      </div>
    </div>
  );
}

function ToolActivity({
  calls,
  results,
}: {
  calls: Array<{ id: string; function: { name: string; arguments: string } }>;
  results: Array<{ id: string; name: string; result: unknown }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/5 rounded-md bg-white/[0.03] text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-muted-foreground hover:bg-white/5"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Wrench className="h-3 w-3" />
        <span>
          Consultou {calls.length} {calls.length === 1 ? "ferramenta" : "ferramentas"}:{" "}
          {calls.map((c) => c.function.name).join(", ")}
        </span>
      </button>
      {open && (
        <div className="px-3 py-2 space-y-2 border-t border-white/5">
          {calls.map((c) => {
            const r = results.find((x) => x.id === c.id);
            return (
              <details key={c.id} className="text-[11px]">
                <summary className="cursor-pointer text-muted-foreground">{c.function.name}</summary>
                <div className="mt-1 space-y-1">
                  <pre className="overflow-x-auto bg-black/30 rounded p-2 text-[10px]">
                    {tryFormat(c.function.arguments)}
                  </pre>
                  {r && (
                    <pre className="overflow-x-auto bg-black/30 rounded p-2 text-[10px] max-h-64">
                      {JSON.stringify(r.result, null, 2).slice(0, 4000)}
                    </pre>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

function tryFormat(s: string) {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function EmptySuggestions({ onPick }: { onPick: (s: string) => void }) {
  const suggestions = [
    "Qual o perfil dos leads dos últimos 30 dias? Segmento, porte e tipo dominantes.",
    "Quais campanhas trouxeram mais leads quentes nas últimas 4 semanas?",
    "Compare a taxa de reunião por anúncio nos últimos 30 dias.",
    "Quais leads de Tecnologia ainda não foram contatados?",
    "Como está a evolução do funil? Onde estamos perdendo mais leads?",
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Algumas perguntas para começar:</p>
      <div className="grid gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="text-left text-xs border border-white/5 rounded-md px-3 py-2 hover:bg-white/5 transition"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}