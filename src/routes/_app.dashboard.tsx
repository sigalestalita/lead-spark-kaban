import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardStats } from "@/lib/settings.functions";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SDR GROU" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchFn = useServerFn(getDashboardStats);
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchFn() });
  if (isLoading || !data) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;

  const sourceData = Object.entries(data.bySource).map(([name, count]) => ({ name, count }));

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
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