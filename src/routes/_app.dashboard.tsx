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

  const { from, to } = useMemo(() => {
    const now = new Date();
    const days = range === "7d" ? 7 : range === "90d" ? 90 : range === "180d" ? 180 : 30;
    return {
      from: new Date(now.getTime() - days * 86400000).toISOString(),
      to: now.toISOString(),
    };
  }, [range]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", range],
    queryFn: () => fetchFn({ data: { from, to } }),
  });
  if (isLoading || !data) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;

  const sourceData = Object.entries(data.bySource).map(([name, count]) => ({ name, count }));

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