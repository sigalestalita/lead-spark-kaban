import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardStats } from "@/lib/settings.functions";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SDR GROU" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchFn = useServerFn(getDashboardStats);
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "180d">("30d");
  const [assignedTo, setAssignedTo] = useState<string>("all");

  const { from, to } = useMemo(() => {
    const now = new Date();
    const days = range === "7d" ? 7 : range === "90d" ? 90 : range === "180d" ? 180 : 30;
    return {
      from: new Date(now.getTime() - days * 86400000).toISOString(),
      to: now.toISOString(),
    };
  }, [range]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", range, assignedTo],
    queryFn: () => fetchFn({ data: { from, to, assignedTo: assignedTo === "all" ? undefined : assignedTo } }),
  });
  if (isLoading || !data) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;

  const sourceData = Object.entries(data.bySource).map(([name, count]) => ({ name, count }));
  const management = data.managementAnalytics;

  const funnelOrder = ["novo", "qualificacao", "em_contato", "aguardando", "agendado"];
  const funnelLabels: Record<string, string> = {
    novo: "Novo lead",
    qualificacao: "Em qualificação",
    em_contato: "Em contato",
    aguardando: "Aguardando retorno",
    agendado: "Agenda marcada",
  };
  const stagesByLabel: Record<string, number> = {
    "Novo lead": data.novos,
    "Em qualificação": data.qualificacao,
    "Em contato": data.em_contato,
    "Aguardando retorno": data.aguardando,
    "Agenda marcada": data.agendados,
  };
  // Cumulative funnel: each step = leads currently in this stage OR later (more downstream).
  // Approx: count this stage + all later stages.
  const funnelCounts = funnelOrder.map((slug, i) => {
    const label = funnelLabels[slug];
    const downstream = funnelOrder.slice(i).reduce((acc, s) => acc + (stagesByLabel[funnelLabels[s]] ?? 0), 0);
    return { slug, label, count: downstream };
  });
  const topCount = funnelCounts[0]?.count || 1;

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={assignedTo} onValueChange={setAssignedTo}>
            <SelectTrigger className="w-44 h-9 text-xs">
              <SelectValue placeholder="Filtrar por SDR" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os SDRs</SelectItem>
              {data.sdrOptions.map((sdr) => (
                <SelectItem key={sdr.id} value={sdr.id}>
                  {sdr.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
            <SelectTrigger className="w-32 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7d</SelectItem>
              <SelectItem value="30d">Últimos 30d</SelectItem>
              <SelectItem value="90d">Últimos 90d</SelectItem>
              <SelectItem value="180d">Últimos 180d</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total de leads" value={data.total} />
        <Kpi label="Novos" value={data.novos} />
        <Kpi label="Em qualificação" value={data.qualificacao} />
        <Kpi label="Em contato" value={data.em_contato} />
        <Kpi label="Aguardando" value={data.aguardando} />
        <Kpi label="Agendados" value={data.agendados} highlight />
        <Kpi label="Desqualificados" value={data.desqualificados} />
        <Kpi label="Conversão lead→agenda" value={`${data.conversionRate}%`} />
        <Kpi label="Tempo médio 1ª abordagem" value={data.avgFirstApproachMin ? `${data.avgFirstApproachMin} min` : "—"} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5 md:col-span-2">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-semibold">Funil de evolução dos leads</h2>
            <span className="text-xs text-muted-foreground">
              Cada etapa inclui leads que avançaram além dela
            </span>
          </div>
          <div className="space-y-2">
            {funnelCounts.map((step, i) => {
              const pctTotal = topCount ? Math.round((step.count / topCount) * 100) : 0;
              const prev = i > 0 ? funnelCounts[i - 1].count : null;
              const pctPrev = prev != null && prev > 0 ? Math.round((step.count / prev) * 100) : null;
              const widthPct = Math.max(8, pctTotal);
              return (
                <div key={step.slug} className="flex items-center gap-3">
                  <div className="w-40 shrink-0 text-sm">{step.label}</div>
                  <div className="flex-1 relative h-9 rounded-md bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-md bg-gradient-to-r from-primary to-primary/70 transition-all"
                      style={{ width: `${widthPct}%` }}
                    />
                    <div className="absolute inset-0 flex items-center px-3 text-xs font-medium">
                      <span className="tabular-nums">{step.count} leads</span>
                      <span className="ml-2 text-muted-foreground">({pctTotal}% do topo)</span>
                    </div>
                  </div>
                  <div className="w-24 text-right text-xs text-muted-foreground tabular-nums">
                    {pctPrev != null ? `${pctPrev}% da etapa anterior` : "—"}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Desqualificados (saídos do funil)</span>
            <span className="font-semibold">{data.desqualificados}</span>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-3">Por etapa</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.byStage}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" fontSize={10} angle={-25} textAnchor="end" height={70} />
              <YAxis fontSize={10} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold mb-3">Por origem</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={sourceData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" fontSize={10} />
              <YAxis dataKey="name" type="category" fontSize={10} width={100} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Análise de gestão do atendimento</h2>
            <p className="text-sm text-muted-foreground">
              Tempos entre entrada do lead, abertura do card e avanço de etapa por SDR.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Leads tocados" value={management.summary.touchedLeads} />
          <Kpi label="Cards abertos" value={management.summary.cardsOpened} />
          <Kpi label="Mudanças de etapa" value={management.summary.stageMoves} />
          <Kpi label="Lead → abertura" value={formatDurationMinutes(management.summary.avgLeadToOpenMin)} />
          <Kpi label="Abertura → etapa" value={formatDurationMinutes(management.summary.avgOpenToStageMin)} />
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-semibold">Performance individual por SDR</h3>
            <span className="text-xs text-muted-foreground">
              Lead → abertura → mudança de etapa
            </span>
          </div>

          {management.bySdr.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem eventos registrados para o filtro atual.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">SDR</th>
                    <th className="py-2 pr-3 font-medium">Leads tocados</th>
                    <th className="py-2 pr-3 font-medium">Cards abertos</th>
                    <th className="py-2 pr-3 font-medium">Mud. etapa</th>
                    <th className="py-2 pr-3 font-medium">Lead → abertura</th>
                    <th className="py-2 pr-3 font-medium">Abertura → etapa</th>
                    <th className="py-2 font-medium">Lead → etapa</th>
                  </tr>
                </thead>
                <tbody>
                  {management.bySdr.map((row) => (
                    <tr key={row.sdrId} className="border-b last:border-0">
                      <td className="py-3 pr-3 font-medium">{row.sdrName}</td>
                      <td className="py-3 pr-3">{row.touchedLeads}</td>
                      <td className="py-3 pr-3">{row.cardsOpened}</td>
                      <td className="py-3 pr-3">{row.stageMoves}</td>
                      <td className="py-3 pr-3">{formatDurationMinutes(row.avgLeadToOpenMin)}</td>
                      <td className="py-3 pr-3">{formatDurationMinutes(row.avgOpenToStageMin)}</td>
                      <td className="py-3">{formatDurationMinutes(row.avgLeadToStageMin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">Distribuição por prioridade</h2>
        <div className="grid grid-cols-5 gap-3">
          <Kpi label="Alta" value={data.byPriority.alta} />
          <Kpi label="Média" value={data.byPriority.media} />
          <Kpi label="Baixa" value={data.byPriority.baixa} />
          <Kpi label="Fora de ICP" value={data.byPriority.fora_icp} />
          <Kpi label="Pendente" value={data.byPriority.pendente} />
        </div>
      </Card>

      <Card className="p-5 border-destructive/30">
        <p className="text-sm">
          <span className="font-semibold text-destructive">{data.stalled} leads</span>{" "}
          parados há mais de 3 dias sem ação (excluindo etapas terminais).
        </p>
      </Card>
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <Card className={`p-4 ${highlight ? "bg-primary text-primary-foreground" : ""}`}>
      <p className={`text-xs ${highlight ? "opacity-90" : "text-muted-foreground"}`}>{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </Card>
  );
}

function formatDurationMinutes(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  if (value < 60) return `${value} min`;

  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (hours < 24) return minutes ? `${hours}h ${minutes}min` : `${hours}h`;

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}