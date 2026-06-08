import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useRef } from "react";
import { listKanbanData, moveLeadStage, createManualLead, updateLead } from "@/lib/leads.functions";
import { syncRdLeads } from "@/lib/rd-station.functions";
import { autoEnrichPendingLeads, recalculatePendingScores } from "@/lib/ai.functions";
import { syncLeadsFromSheet } from "@/lib/sheets.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRIORITY_LABEL, PRIORITY_COLOR } from "@/lib/lead-types";
import { evaluateIcpFit } from "@/lib/icp-fit";
import { toast } from "sonner";
import { RefreshCw, Plus, Search, Calendar, Clock, Timer, Flame, Briefcase, Building2, Mail, ChevronLeft, ChevronRight, Pencil, Check, X, LinkedinIcon } from "lucide-react";
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
  const autoEnrichFn = useServerFn(autoEnrichPendingLeads);
  const recalcFn = useServerFn(recalculatePendingScores);
  const sheetSyncFn = useServerFn(syncLeadsFromSheet);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);
  const [lostFor, setLostFor] = useState<{ leadId: string; stageId: string } | null>(null);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [companySize, setCompanySize] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["kanban"],
    queryFn: () => fetchData(),
  });

  // Auto-enriquecimento + recálculo de score em background.
  // - Enriquece leads com enrichment_status='pending'.
  // - Recalcula score/priority de todos os leads `found` (idempotente — só grava
  //   quando muda). Garante que mudanças nas regras de ICP refletem nos cards.
  const enrichingRef = useRef(false);
  const recalcRunRef = useRef(false);
  const sheetSyncRef = useRef(0);
  useEffect(() => {
    const leads = data?.leads ?? [];
    const pendingEnrich = leads.filter((l) => l.enrichment_status === "pending").length;
    const enrichedCount = leads.filter((l) => l.enrichment_status === "found").length;
    const shouldRecalc = enrichedCount > 0 && !recalcRunRef.current;
    if (enrichingRef.current) return;
    let cancelled = false;
    const run = async () => {
      if (enrichingRef.current) return;
      enrichingRef.current = true;
      try {
        let changed = 0;
        // Sync da planilha do Meta a cada 60s
        const now = Date.now();
        if (now - sheetSyncRef.current > 60_000) {
          sheetSyncRef.current = now;
          try {
            const s = await sheetSyncFn({ data: {} });
            if (s?.inserted) changed += s.inserted;
          } catch { /* silencioso */ }
        }
        if (shouldRecalc) {
          recalcRunRef.current = true;
          const r = await recalcFn({ data: { limit: 200 } });
          changed += r?.updated ?? 0;
        }
        if (pendingEnrich > 0) {
          const r = await autoEnrichFn({ data: { limit: 5 } });
          changed += r?.ok ?? 0;
        }
        if (!cancelled && changed > 0) {
          qc.invalidateQueries({ queryKey: ["kanban"] });
        }
      } catch {
        /* silencioso */
      } finally {
        enrichingRef.current = false;
      }
    };
    run();
    const t = setInterval(run, 90_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [data?.leads, autoEnrichFn, recalcFn, sheetSyncFn, qc]);

  const move = useMutation({
    mutationFn: (vars: { leadId: string; stageId: string }) => moveFn({ data: vars }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["kanban"] });
      const prev = qc.getQueryData<Awaited<ReturnType<typeof fetchData>>>(["kanban"]);
      if (prev) {
        qc.setQueryData(["kanban"], {
          ...prev,
          leads: prev.leads.map((l) =>
            l.id === vars.leadId
              ? { ...l, stage_id: vars.stageId, stage_entered_at: new Date().toISOString(), last_action_at: new Date().toISOString() }
              : l
          ),
        });
      }
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["kanban"], ctx.prev);
      toast.error(e instanceof Error ? e.message : "Falha ao mover");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["kanban"] }),
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
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [focusedCol, setFocusedCol] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT" || tgt.isContentEditable)) return;
      const stages = data?.stages ?? [];
      if (stages.length === 0) return;
      e.preventDefault();
      setFocusedCol((i) => {
        const next = e.key === "ArrowLeft" ? Math.max(0, i - 1) : Math.min(stages.length - 1, i + 1);
        const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-col-index="${next}"]`);
        el?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
        return next;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data?.stages]);

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  if (!data) return null;

  const filtered = data.leads.filter((l) => {
    if (priority !== "all" && l.priority !== priority) return false;
    if (companySize !== "all" && (l.company_size ?? "") !== companySize) return false;
    const submittedRaw = (l.form_payload as { submitted_at?: string } | null)?.submitted_at ?? null;
    const convTs = submittedRaw
      ? new Date(submittedRaw).getTime()
      : l.converted_at
        ? new Date(l.converted_at).getTime()
        : new Date(l.created_at).getTime();
    if (dateFrom) {
      const fromTs = new Date(dateFrom + "T00:00:00").getTime();
      if (convTs < fromTs) return false;
    }
    if (dateTo) {
      const toTs = new Date(dateTo + "T23:59:59").getTime();
      if (convTs > toTs) return false;
    }
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
  const sizeOptions = Array.from(
    new Set(data.leads.map((l) => (l.company_size ?? "").trim()).filter(Boolean))
  ).sort();

  const handleMoveTo = (leadId: string, stageId: string) => {
    const targetStage = data.stages.find((s) => s.id === stageId);
    if (targetStage?.slug === "desqualificado") {
      setLostFor({ leadId, stageId });
    } else {
      move.mutate({ leadId, stageId });
    }
  };
  const handleUpdateLead = (id: string, patch: Record<string, unknown>) => {
    updateFn({ data: { id, patch } })
      .then(() => qc.invalidateQueries({ queryKey: ["kanban"] }))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erro"));
  };

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
          <select
            value={companySize}
            onChange={(e) => setCompanySize(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm max-w-[180px]"
            title="Porte da empresa"
          >
            <option value="all">Todos os portes</option>
            {sizeOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <select
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                const fmt = (d: Date) => {
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, "0");
                  const day = String(d.getDate()).padStart(2, "0");
                  return `${y}-${m}-${day}`;
                };
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                let from = new Date(today);
                let to = new Date(today);
                if (v === "hoje") { /* same */ }
                else if (v === "ontem") { from.setDate(from.getDate() - 1); to.setDate(to.getDate() - 1); }
                else if (v === "7d") { from.setDate(from.getDate() - 6); }
                else if (v === "15d") { from.setDate(from.getDate() - 14); }
                else if (v === "mes") { from = new Date(today.getFullYear(), today.getMonth(), 1); }
                else if (v === "mes_ant") {
                  from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                  to = new Date(today.getFullYear(), today.getMonth(), 0);
                }
                setDateFrom(fmt(from));
                setDateTo(fmt(to));
              }}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              title="Período rápido"
            >
              <option value="">Período…</option>
              <option value="hoje">Hoje</option>
              <option value="ontem">Ontem</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="15d">Últimos 15 dias</option>
              <option value="mes">Este mês</option>
              <option value="mes_ant">Mês anterior</option>
            </select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 w-[140px]"
              title="Conversão a partir de"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 w-[140px]"
              title="Conversão até"
            />
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>
                Limpar
              </Button>
            )}
          </div>
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
        <div ref={scrollerRef} className="flex gap-3 overflow-x-auto pb-4">
          {data.stages.map((s, idx) => {
            let stageLeads = filtered.filter((l) => l.stage_id === s.id);
            if (s.slug === "novo") {
              stageLeads = [...stageLeads].sort((a, b) => {
                const fa = evaluateIcpFit(a).score;
                const fb = evaluateIcpFit(b).score;
                if (fb !== fa) return fb - fa;
                const ra = (a.form_payload as { submitted_at?: string } | null)?.submitted_at;
                const rb = (b.form_payload as { submitted_at?: string } | null)?.submitted_at;
                const ta = ra ? new Date(ra).getTime() : new Date(a.created_at).getTime();
                const tb = rb ? new Date(rb).getTime() : new Date(b.created_at).getTime();
                return tb - ta;
              });
            }
            return (
              <Column
                key={s.id}
                stageId={s.id}
                name={s.slug === "novo" ? "Novo lead · Priorização" : s.name}
                color={s.color}
                count={stageLeads.length}
                index={idx}
                focused={idx === focusedCol}
              >
                {stageLeads.map((l) => (
                  <LeadCard
                    key={l.id}
                    lead={l}
                    stageSlug={s.slug}
                    stages={data.stages}
                    profiles={data.profiles}
                    onMoveTo={handleMoveTo}
                    onUpdate={handleUpdateLead}
                  />
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
              stages={data.stages}
              profiles={data.profiles}
              onMoveTo={handleMoveTo}
              onUpdate={handleUpdateLead}
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

function Column({ stageId, name, color, count, index, focused, children }: { stageId: string; name: string; color: string; count: number; index: number; focused: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  return (
    <div
      ref={setNodeRef}
      data-col-index={index}
      className={`w-72 shrink-0 rounded-lg bg-muted/40 border ${isOver ? "ring-2 ring-primary" : ""} ${focused ? "ring-2 ring-primary/50" : ""}`}
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
  stages,
  profiles,
  onMoveTo,
  onUpdate,
  overlay,
}: {
  lead: import("@/lib/lead-types").Lead;
  stageSlug: string;
  stages: { id: string; slug: string; name: string; position: number }[];
  profiles: { id: string; full_name: string | null; email: string | null }[];
  onMoveTo: (leadId: string, stageId: string) => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { stage_id: lead.stage_id },
  });

  const sortedStages = [...stages].sort((a, b) => a.position - b.position);
  const currentIdx = sortedStages.findIndex((s) => s.id === lead.stage_id);
  const prevStage = currentIdx > 0 ? sortedStages[currentIdx - 1] : null;
  const nextStage = currentIdx >= 0 && currentIdx < sortedStages.length - 1 ? sortedStages[currentIdx + 1] : null;

  const [editingReason, setEditingReason] = useState(false);
  const [reasonDraft, setReasonDraft] = useState(lead.lost_reason ?? "");
  const reasonOptions = ["Sem perfil", "Sem fit com soluções", "Sem contato"];

  const stopDrag = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const convertedAt = lead.converted_at ? new Date(lead.converted_at) : null;
  const stageEnteredAt = lead.stage_entered_at ? new Date(lead.stage_entered_at) : null;
  const meetingAt = lead.meeting_at ? new Date(lead.meeting_at) : null;
  const submittedRaw = (lead.form_payload as { submitted_at?: string } | null)?.submitted_at ?? null;
  const submittedAt = submittedRaw ? new Date(submittedRaw) : new Date(lead.created_at);

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

  const icpFit = evaluateIcpFit(lead);
  const isHotIcp = stageSlug === "novo" && icpFit.score >= 2;
  const assignedProfile = lead.assigned_to ? profiles.find((p) => p.id === lead.assigned_to) : null;
  const assignedLabel = assignedProfile?.full_name ?? assignedProfile?.email ?? null;

  const content = (
    <Card
      className={`p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
        isDragging ? "opacity-30" : ""
      } ${overlay ? "shadow-lg" : ""} ${
        isHotIcp ? "ring-2 ring-amber-500/60 bg-amber-500/[0.04]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <Link
          to="/lead/$id"
          params={{ id: lead.id }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-sm font-semibold hover:underline truncate flex-1 flex items-center gap-1"
        >
          {isHotIcp && <Flame className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
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
      {lead.lead_type && (
        <div className="mb-1">
          <Badge
            variant="outline"
            className="text-[10px]"
            style={{
              borderColor: LEAD_TYPE_COLOR[lead.lead_type as LeadType],
              color: LEAD_TYPE_COLOR[lead.lead_type as LeadType],
            }}
          >
            {LEAD_TYPE_LABEL[lead.lead_type as LeadType]}
          </Badge>
        </div>
      )}
      {lead.company_name && <p className="text-xs text-muted-foreground truncate">{lead.company_name}</p>}
      {lead.position && (
        <p className="mt-1 text-[11px] text-foreground/80 truncate" title={lead.position}>
          <span className="text-muted-foreground">Cargo:</span> {lead.position}
        </p>
      )}
      {lead.company_size && (
        <p className="text-[11px] text-foreground/80 truncate" title={lead.company_size}>
          <span className="text-muted-foreground">Porte:</span> {lead.company_size}
        </p>
      )}
      <p className="text-[11px] text-foreground/80 truncate" title={assignedLabel ?? "Sem responsável"}>
        <span className="text-muted-foreground">Responsável:</span>{" "}
        {assignedLabel ?? <span className="text-muted-foreground italic">não atribuído</span>}
      </p>

      {stageSlug === "novo" && (
        <div className="mt-2 space-y-1">
          <div className="flex flex-wrap gap-1">
            {icpFit.seniorPosition && (
              <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 gap-1">
                <Briefcase className="h-3 w-3" /> Cargo decisor
              </Badge>
            )}
            {icpFit.bigCompany && (
              <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 gap-1">
                <Building2 className="h-3 w-3" /> 100+ funcionários
              </Badge>
            )}
            {icpFit.corporateEmail && (
              <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 gap-1">
                <Mail className="h-3 w-3" /> E-mail corporativo
              </Badge>
            )}
            {icpFit.score === 0 && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Sem sinais de ICP
              </Badge>
            )}
            {lead.enrichment_status === "found" && !lead.linkedin_url && (
              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 gap-1">
                <LinkedinIcon className="h-3 w-3" /> Sem LinkedIn
              </Badge>
            )}
          </div>
          {lead.campaign && (
            <p className="text-[10px] text-muted-foreground truncate">📣 {lead.campaign}</p>
          )}
          {lead.ad_name && (
            <p className="text-[10px] text-muted-foreground truncate">🪧 {lead.ad_name}</p>
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
          {editingReason ? (
            <div
              className="space-y-1"
              onPointerDown={stopDrag}
              onClick={stopDrag}
            >
              <select
                value={reasonOptions.includes(reasonDraft) ? reasonDraft : "__custom"}
                onChange={(e) => {
                  if (e.target.value !== "__custom") setReasonDraft(e.target.value);
                  else setReasonDraft("");
                }}
                className="w-full h-7 rounded border bg-background px-1 text-[10px]"
              >
                {reasonOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
                <option value="__custom">Outro…</option>
              </select>
              {!reasonOptions.includes(reasonDraft) && (
                <Input
                  value={reasonDraft}
                  onChange={(e) => setReasonDraft(e.target.value)}
                  placeholder="Motivo customizado"
                  className="h-7 text-[10px]"
                />
              )}
              <div className="flex gap-1 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2"
                  onClick={() => { setEditingReason(false); setReasonDraft(lead.lost_reason ?? ""); }}
                >
                  <X className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  className="h-6 px-2"
                  disabled={!reasonDraft.trim()}
                  onClick={() => {
                    onUpdate(lead.id, { lost_reason: reasonDraft.trim() });
                    setEditingReason(false);
                  }}
                >
                  <Check className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onPointerDown={stopDrag}
              onClick={(e) => { stopDrag(e); setReasonDraft(lead.lost_reason ?? ""); setEditingReason(true); }}
              className="inline-flex items-center gap-1 hover:opacity-80"
              title="Editar motivo"
            >
              <Badge variant="outline" className="text-[10px]">
                {lead.lost_reason ?? "Sem motivo"}
              </Badge>
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/40">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {format(submittedAt, "dd/MM/yy HH:mm", { locale: ptBR })}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-muted-foreground">{lead.score}pts</span>
          <div className="flex items-center" onPointerDown={stopDrag} onClick={stopDrag}>
            <button
              type="button"
              disabled={!prevStage}
              onClick={(e) => { stopDrag(e); if (prevStage) onMoveTo(lead.id, prevStage.id); }}
              title={prevStage ? `Mover para ${prevStage.name}` : "Sem etapa anterior"}
              className="h-5 w-5 grid place-items-center rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <button
              type="button"
              disabled={!nextStage}
              onClick={(e) => { stopDrag(e); if (nextStage) onMoveTo(lead.id, nextStage.id); }}
              title={nextStage ? `Mover para ${nextStage.name}` : "Sem próxima etapa"}
              className="h-5 w-5 grid place-items-center rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
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
  const reasons = ["Sem perfil", "Sem fit com soluções", "Sem contato", "Sem orçamento", "Timing inadequado", "Concorrência"];
  const [selected, setSelected] = useState<string>(reasons[0]);
  const [custom, setCustom] = useState("");
  const isOther = selected === "__other";
  const finalReason = isOther ? custom.trim() : selected;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <Card className="p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1">Motivo de desqualificação</h2>
        <p className="text-xs text-muted-foreground mb-4">Escolha o motivo para mover este lead.</p>
        <div className="space-y-3">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {reasons.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
            <option value="__other">Outros…</option>
          </select>
          {isOther && (
            <Input
              placeholder="Descreva o motivo"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              autoFocus
            />
          )}
        </div>
        <div className="mt-5 flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={!finalReason} onClick={() => onPick(finalReason)}>
            Salvar
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