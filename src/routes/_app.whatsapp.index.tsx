import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listConversations } from "@/lib/whatsapp.functions";
import { supabase } from "@/integrations/supabase/client";
import { ConversationView } from "@/components/whatsapp/conversation-view";
import { LeadSidePanel } from "@/components/whatsapp/lead-side-panel";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink } from "lucide-react";
import { LEAD_TYPE_LABEL, LEAD_TYPE_COLOR, type LeadType } from "@/lib/lead-type";

export const Route = createFileRoute("/_app/whatsapp/")({
  component: WhatsappInbox,
});

function WhatsappInbox() {
  const fn = useServerFn(listConversations);
  const qc = useQueryClient();
  const [status, setStatus] = useState<"all" | "open" | "pending" | "closed">("all");
  const [assigned, setAssigned] = useState<"all" | "me" | "unassigned">("all");
  const [unread, setUnread] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

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

  return (
    <div className="h-full flex">
      <aside className="w-[360px] shrink-0 border-r border-white/5 flex flex-col">
        <div className="p-3 space-y-2 border-b border-white/5">
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
            const owner = lead?.assigned_to ? profiles.find((p) => p.id === lead.assigned_to) : null;
            const ownerLabel = owner?.full_name ?? owner?.email ?? null;
            const isSel = c.id === selected;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`w-full text-left px-3 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${
                  isSel ? "bg-white/5" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{lead?.name ?? "Sem nome"}</p>
                  {c.unread_count > 0 && (
                    <Badge variant="default" className="h-5 px-1.5 text-[10px]">{c.unread_count}</Badge>
                  )}
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