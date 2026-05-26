import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listKanbanData, moveLeadStage, createManualLead, updateLead } from "@/lib/leads.functions";
import { syncRdLeads } from "@/lib/rd-station.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRIORITY_LABEL, PRIORITY_COLOR } from "@/lib/lead-types";
import { toast } from "sonner";
import { RefreshCw, Plus, Search, Calendar, Clock, Timer } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { formatDistanceToNow, format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/kanban")({
  head: () => ({ meta: [{ title: "Kanban — SDR GROU" }] }),
  component: KanbanPage,
});

function KanbanPage() {
  const fetchData = useServerFn(listKanbanData);
  const moveFn = useServerFn(moveLeadStage);
  const syncFn = useServerFn(syncRdLeads);
  const createFn = useServerFn(createManualLead);
  const updateFn = useServerFn(updateLead);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);
  const [lostFor, setLostFor] = useState<{ leadId: string; stageId: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["kanban"],
    queryFn: () => fetchData(),
  });

  const move = useMutation({
    mutationFn: (vars: { leadId: string; stageId: string }) => moveFn({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kanban"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao mover"),
  });

  const sync = useMutation({
    mutationFn: async () => {
      const result = await syncFn();
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: (r) => {
      toast.success(`Sincronizado: ${r.created} novos, ${r.updated} atualizados`);
      qc.invalidateQueries({ queryKey: ["kanban"] });
    },
    onError: (e) => {
      const message = e instanceof Error ? e.message : "Falha ao sincronizar";
      toast.error(message, {
        description: message.includes("RD Station recusou")
          ? "Vá em Configurações > RD Station CRM e conecte novamente antes de sincronizar."
          : undefined,
      });
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeId, setActiveId] = useState<string | null>(null);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  if (!data) return null;

  const filtered = data.leads.filter((l) => {
    if (priority !== "all" && l.priority !== priority) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.name?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.company_name?.toLowerCase().includes(q) ||
        l.phone?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (e.over && e.active.data.current && e.over.id !== e.active.data.current.stage_id) {
      const targetStage = data.stages.find((s) => s.id === e.over!.id);
      const payload = { leadId: e.active.id as string, stageId: e.over.id as string };
      if (targetStage?.slug === "desqualificado") {
        setLostFor(payload);
      } else {
        move.mutate(payload);
      }
    }
  };

  const activeLead = activeId ? filtered.find((l) => l.id === activeId) : null;
  const stageById = new Map(data.stages.map((s) => [s.id, s] as const));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline Inbound</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} leads • arraste cards entre etapas</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar nome, email, empresa…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-64"
            />
          </div>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="all">Todas prioridades</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
            <option value="fora_icp">Fora de ICP</option>
            <option value="pendente">Pendente</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${sync.isPending ? "animate-spin" : ""}`} />
            Sincronizar RD
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Novo lead
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(e) => setActiveId(e.active.id as string)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {data.stages.map((s) => {
            const stageLeads = filtered.filter((l) => l.stage_id === s.id);
            return (
              <Column key={s.id} stageId={s.id} name={s.name} color={s.color} count={stageLeads.length}>
                {stageLeads.map((l) => (
                  <LeadCard key={l.id} lead={l} stageSlug={s.slug} />
                ))}
              </Column>
            );
          })}
        </div>
        <DragOverlay>
          {activeLead ? (
            <LeadCard
              lead={activeLead}
              stageSlug={stageById.get(activeLead.stage_id ?? "")?.slug ?? ""}
              overlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {showNew && <NewLeadDialog onClose={() => setShowNew(false)} onSubmit={async (d) => {
        try {
          await createFn({ data: d });
          toast.success("Lead criado");
          qc.invalidateQueries({ queryKey: ["kanban"] });
          setShowNew(false);
        } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
      }} />}

      {lostFor && (
        <LostReasonDialog
          onClose={() => setLostFor(null)}
          onPick={async (reason) => {
            try {
              await updateFn({ data: { id: lostFor.leadId, patch: { lost_reason: reason } } });
              await move.mutateAsync(lostFor);
              setLostFor(null);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Erro");
            }
          }}
        />
      )}
    </div>
  );
}

function Column({ stageId, name, color, count, children }: { stageId: string; name: string; color: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  return (
    <div
      ref={setNodeRef}
      className={`w-72 shrink-0 rounded-lg bg-muted/40 border ${isOver ? "ring-2 ring-primary" : ""}`}
    >
      <div className="px-3 py-2 border-b flex items-center justify-between sticky top-0 bg-muted/60 backdrop-blur rounded-t-lg">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          <span className="text-sm font-semibold">{name}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      </div>
      <div className="p-2 space-y-2 min-h-[100px]">{children}</div>
    </div>
  );
}

function LeadCard({
  lead,
  stageSlug,
  overlay,
}: {
  lead: import("@/lib/lead-types").Lead;
  stageSlug: string;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { stage_id: lead.stage_id },
  });

  const convertedAt = lead.converted_at ? new Date(lead.converted_at) : null;
  const stageEnteredAt = lead.stage_entered_at ? new Date(lead.stage_entered_at) : null;
  const meetingAt = lead.meeting_at ? new Date(lead.meeting_at) : null;

  const sinceConversion =
    convertedAt && stageEnteredAt
      ? formatDistanceToNow(convertedAt, { locale: ptBR }) // total tempo desde conversão
      : null;
  const daysInStage =
    stageEnteredAt ? Math.max(0, differenceInDays(new Date(), stageEnteredAt)) : null;

  const formPayload = (lead.form_payload ?? null) as Record<string, unknown> | null;
  const formEntries =
    formPayload && typeof formPayload === "object"
      ? Object.entries(formPayload)
          .filter(([, v]) => v != null && v !== "" && typeof v !== "object")
          .slice(0, 6)
      : [];

  const content = (
    <Card
      className={`p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
        isDragging ? "opacity-30" : ""
      } ${overlay ? "shadow-lg" : ""}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <Link
          to="/lead/$id"
          params={{ id: lead.id }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-sm font-semibold hover:underline truncate flex-1"
        >
          {lead.name}
        </Link>
        <Badge
          variant="outline"
          className="text-[10px] shrink-0"
          style={{ borderColor: PRIORITY_COLOR[lead.priority], color: PRIORITY_COLOR[lead.priority] }}
        >
          {PRIORITY_LABEL[lead.priority]}
        </Badge>
      </div>
      {lead.company_name && <p className="text-xs text-muted-foreground truncate">{lead.company_name}</p>}

      {stageSlug === "novo" && (
        <div className="mt-2 space-y-1">
          {lead.campaign && (
            <p className="text-[10px] text-muted-foreground truncate">📣 {lead.campaign}</p>
          )}
          {lead.form_name && (
            <p className="text-[10px] text-muted-foreground truncate">📝 {lead.form_name}</p>
          )}
          {formEntries.length > 0 && (
            <div className="rounded bg-muted/40 p-1.5 space-y-0.5">
              {formEntries.map(([k, v]) => (
                <div key={k} className="text-[10px] truncate">
                  <span className="text-muted-foreground">{k}:</span>{" "}
                  <span className="font-medium">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
          {convertedAt && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Convertido {format(convertedAt, "dd/MM HH:mm", { locale: ptBR })}
            </p>
          )}
        </div>
      )}

      {(stageSlug === "qualificacao" || stageSlug === "em_contato") && (
        <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
          <Timer className="h-3 w-3" />
          {convertedAt && stageEnteredAt
            ? `${formatDistanceToNow(convertedAt, { locale: ptBR, addSuffix: false })} após conversão`
            : "—"}
        </div>
      )}

      {stageSlug === "aguardando" && (
        <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
          <Timer className="h-3 w-3" />
          {daysInStage != null
            ? `${daysInStage} ${daysInStage === 1 ? "dia" : "dias"} aguardando`
            : "—"}
        </div>
      )}

      {stageSlug === "agendado" && (
        <div className="mt-2 space-y-1">
          <p className="text-[10px] font-medium flex items-center gap-1 text-emerald-600">
            <Calendar className="h-3 w-3" />
            {meetingAt
              ? `Agenda: ${format(meetingAt, "dd/MM HH:mm", { locale: ptBR })}`
              : "Sem data de agenda"}
          </p>
          {convertedAt && stageEnteredAt && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Timer className="h-3 w-3" />
              {formatDistanceToNow(convertedAt, { locale: ptBR })} após conversão
            </p>
          )}
        </div>
      )}

      {stageSlug === "desqualificado" && (
        <div className="mt-2 text-[10px]">
          <Badge variant="outline" className="text-[10px]">
            {lead.lost_reason ?? "Sem motivo"}
          </Badge>
        </div>
      )}

      <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/40">
        <span className="text-[10px] text-muted-foreground">
          {lead.last_action_at
            ? formatDistanceToNow(new Date(lead.last_action_at), { addSuffix: true, locale: ptBR })
            : "—"}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">{lead.score}pts</span>
      </div>
      {/* unused but keep referenced to avoid lint */}
      <span className="hidden">{sinceConversion}</span>
    </Card>
  );
  if (overlay) return content;
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      {content}
    </div>
  );
}

function LostReasonDialog({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (reason: string) => void;
}) {
  const reasons = ["Sem perfil", "Sem fit com soluções", "Sem contato"];
  const [custom, setCustom] = useState("");
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <Card className="p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1">Motivo de desqualificação</h2>
        <p className="text-xs text-muted-foreground mb-4">Escolha o motivo para mover este lead.</p>
        <div className="space-y-2">
          {reasons.map((r) => (
            <Button key={r} variant="outline" className="w-full justify-start" onClick={() => onPick(r)}>
              {r}
            </Button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Input
            placeholder="Outro motivo…"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
          <Button disabled={!custom.trim()} onClick={() => onPick(custom.trim())}>
            Salvar
          </Button>
        </div>
        <div className="mt-4 text-right">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </Card>
    </div>
  );
}

function NewLeadDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (d: { name: string; email: string; phone: string; company_name: string; position: string; source: string }) => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company_name: "", position: "", source: "manual" });
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <Card className="p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">Novo lead manual</h2>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-3">
          <Input placeholder="Nome *" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input placeholder="WhatsApp" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input placeholder="Empresa" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
          <Input placeholder="Cargo" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          <Input placeholder="Origem" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Criar</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}