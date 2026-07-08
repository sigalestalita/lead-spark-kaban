import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { assignConversation, listConversations, setConversationStatus } from "@/lib/whatsapp.functions";
import { supabase } from "@/integrations/supabase/client";
import { ConversationView } from "@/components/whatsapp/conversation-view";
import { LeadSidePanel } from "@/components/whatsapp/lead-side-panel";
import { useAuth } from "@/lib/use-auth";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BellRing, ExternalLink } from "lucide-react";
import { LEAD_TYPE_LABEL, LEAD_TYPE_COLOR, type LeadType } from "@/lib/lead-type";
import { toast } from "sonner";

const LISIANE_USER_ID = "96c713e5-af8f-48fd-b536-59c2e1879f73";

export const Route = createFileRoute("/_app/whatsapp/")({
  validateSearch: z.object({ c: z.string().uuid().optional() }),
  component: WhatsappInbox,
});

function WhatsappInbox() {
  const { user } = useAuth();
  const fn = useServerFn(listConversations);
  const setStatusFn = useServerFn(setConversationStatus);
  const assignFn = useServerFn(assignConversation);
  const qc = useQueryClient();
  const routeSearch = Route.useSearch();
  const navigate = useNavigate({ from: "/whatsapp/" });
  const [status, setStatus] = useState<"all" | "open" | "pending" | "closed">("all");
  const [assigned, setAssigned] = useState<"all" | "me" | "unassigned">("all");
  const [unread, setUnread] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(routeSearch.c ?? null);

  useEffect(() => {
    if (routeSearch.c && routeSearch.c !== selected) setSelected(routeSearch.c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSearch.c]);

  const { data, isLoading } = useQuery({
    queryKey: ["wa-conversations", status, assigned, unread, search],
    queryFn: () => fn({ data: { status, assigned, unread, search: search || undefined } }),
    refetchInterval: 15000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("wa-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["wa-conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const conversations = data?.conversations ?? [];
  const profiles = data?.profiles ?? [];
  const selectedConv = conversations.find((c) => c.id === selected) ?? null;
  const waitingForLisiane = conversations.filter((c) => c.status === "pending" && c.assigned_user_id === LISIANE_USER_ID);
  const isLisiane = user?.id === LISIANE_USER_ID;

  const transfer = useMutation({
    mutationFn: async (nextUserId: string | null) => {
      if (!selectedConv) return;
      await assignFn({ data: { conversationId: selectedConv.id, userId: nextUserId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
      toast.success("Atendimento atualizado.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao transferir conversa"),
  });

  const changeConversationStatus = async (nextStatus: "open" | "closed") => {
    if (!selectedConv) return;
    try {
      await setStatusFn({ data: { conversationId: selectedConv.id, status: nextStatus } });
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
      qc.invalidateQueries({ queryKey: ["wa-messages", selectedConv.id] });
      toast.success(nextStatus === "closed" ? "Conversa encerrada." : "Conversa reaberta.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar status da conversa");
    }
  };

  return (
    <div className="h-full flex">
      <aside className="w-[360px] shrink-0 border-r border-white/5 flex flex-col">
        <div className="p-3 space-y-2 border-b border-white/5">
          {isLisiane && waitingForLisiane.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium text-amber-100">Você tem {waitingForLisiane.length} contato(s) aguardando resposta.</p>
                <p className="text-amber-200/80">Conversas transferidas pela IA para você aparecem como pendentes.</p>
              </div>
            </div>
          )}
          <Input
            placeholder="Buscar lead, empresa, mensagem…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-2">
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="open">Abertas</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="closed">Fechadas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={assigned} onValueChange={(v) => setAssigned(v as typeof assigned)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos SDRs</SelectItem>
                <SelectItem value="me">Minhas</SelectItem>
                <SelectItem value="unassigned">Sem atribuição</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={unread} onChange={(e) => setUnread(e.target.checked)} />
            Somente não lidas
          </label>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="p-4 text-xs text-muted-foreground">Carregando…</p>}
          {!isLoading && conversations.length === 0 && (
            <p className="p-6 text-xs text-muted-foreground text-center">
              Nenhuma conversa. Inicie uma a partir do card de um lead.
            </p>
          )}
          {conversations.map((c) => {
            const lead = c.leads as {
              id: string;
              name: string | null;
              company_name: string | null;
              lead_type: string | null;
              company_size: string | null;
              assigned_to: string | null;
            } | null;
            const ownerId = c.assigned_user_id ?? lead?.assigned_to ?? null;
            const owner = ownerId ? profiles.find((p) => p.id === ownerId) : null;
            const ownerLabel = owner?.full_name ?? owner?.email ?? null;
            const isSel = c.id === selected;
            const isWaitingForLisiane = c.status === "pending" && ownerId === LISIANE_USER_ID;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setSelected(c.id);
                  navigate({ search: { c: c.id }, replace: true });
                }}
                className={`w-full text-left px-3 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${
                  isWaitingForLisiane ? "bg-amber-500/5" : ""
                } ${
                  isSel ? "bg-white/5" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{lead?.name ?? "Sem nome"}</p>
                  <div className="flex items-center gap-1">
                    {isWaitingForLisiane && (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-amber-500/40 text-amber-300">
                        Aguardando Lisiane
                      </Badge>
                    )}
                    {c.unread_count > 0 && (
                      <Badge variant="default" className="h-5 px-1.5 text-[10px]">{c.unread_count}</Badge>
                    )}
                  </div>
                </div>
                {lead?.company_name && (
                  <p className="text-xs text-muted-foreground truncate">{lead.company_name}</p>
                )}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {lead?.lead_type && (
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 px-1.5"
                      style={{
                        borderColor: LEAD_TYPE_COLOR[lead.lead_type as LeadType],
                        color: LEAD_TYPE_COLOR[lead.lead_type as LeadType],
                      }}
                    >
                      {LEAD_TYPE_LABEL[lead.lead_type as LeadType] ?? lead.lead_type}
                    </Badge>
                  )}
                  {lead?.company_size && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
                      {lead.company_size}
                    </Badge>
                  )}
                  {ownerLabel && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                      {ownerLabel}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-1">{c.last_preview ?? "—"}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">
                    {c.last_message_at
                      ? new Date(c.last_message_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                      : "—"}
                  </span>
                  <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex">
        {!selectedConv && (
          <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
            Selecione uma conversa
          </div>
        )}
        {selectedConv && (
          <>
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {(selectedConv.leads as { name?: string | null } | null)?.name ?? "Sem nome"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedConv.leads as { company_name?: string | null } | null)?.company_name ?? ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={String(selectedConv.assigned_user_id ?? (selectedConv.leads as { assigned_to?: string | null } | null)?.assigned_to ?? "__none")}
                    onValueChange={(v) => transfer.mutate(v === "__none" ? null : v)}
                    disabled={transfer.isPending}
                  >
                    <SelectTrigger className="h-8 w-[210px] text-xs">
                      <SelectValue placeholder="Fila geral" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Fila geral</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email ?? p.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant={selectedConv.status === "closed" ? "default" : "outline"}
                    onClick={() => changeConversationStatus(selectedConv.status === "closed" ? "open" : "closed")}
                  >
                    {selectedConv.status === "closed" ? "Reabrir conversa" : "Encerrar conversa"}
                  </Button>
                  {(selectedConv.leads as unknown as { id?: string } | null)?.id && (
                    <Link
                      to="/lead/$id"
                      params={{ id: (selectedConv.leads as unknown as { id: string }).id }}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      Abrir lead <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <ConversationView conversationId={selectedConv.id} />
              </div>
            </div>
            {(selectedConv.leads as unknown as { id?: string } | null)?.id && (
              <aside className="hidden lg:flex w-[320px] shrink-0 border-l border-white/5 flex-col">
                <LeadSidePanel leadId={(selectedConv.leads as unknown as { id: string }).id} />
              </aside>
            )}
          </>
        )}
      </main>
    </div>
  );
}