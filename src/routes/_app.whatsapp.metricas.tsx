import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWhatsappMetrics } from "@/lib/whatsapp-metrics.functions";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  MessageSquare, ArrowDownLeft, ArrowUpRight, CheckCheck, Eye,
  AlertCircle, Timer, Flame, Snowflake, Thermometer, Zap,
} from "lucide-react";

export const Route = createFileRoute("/_app/whatsapp/metricas")({
  component: MetricsPage,
});

function MetricsPage() {
  const fn = useServerFn(getWhatsappMetrics);
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");

  const { from, to } = useMemo(() => {
    const now = new Date();
    const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
    const fromD = new Date(now.getTime() - days * 86400000);
    return { from: fromD.toISOString(), to: now.toISOString() };
  }, [range]);

  const { data, isLoading } = useQuery({
    queryKey: ["wa-metrics", range],
    queryFn: () => fn({ data: { from, to } }),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Métricas de WhatsApp</h2>
          <p className="text-xs text-muted-foreground">Volume, entregas, resposta e conversão por SDR / campanha.</p>
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as "7d" | "30d" | "90d")}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {data && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={<ArrowUpRight className="h-4 w-4" />} label="Enviadas" value={data.totals.outbound} />
            <KpiCard icon={<ArrowDownLeft className="h-4 w-4" />} label="Recebidas" value={data.totals.inbound} />
            <KpiCard
              icon={<CheckCheck className="h-4 w-4" />}
              label="Entrega"
              value={`${Math.round(data.totals.deliveryRate * 100)}%`}
              sub={`${data.totals.delivered}/${data.totals.outbound}`}
            />
            <KpiCard
              icon={<Eye className="h-4 w-4" />}
              label="Leitura"
              value={`${Math.round(data.totals.readRate * 100)}%`}
              sub={`${data.totals.read} lidas`}
            />
            <KpiCard
              icon={<Timer className="h-4 w-4" />}
              label="Resposta média SDR"
              value={data.avgFirstResponseMin == null ? "—" : `${data.avgFirstResponseMin} min`}
            />
            <KpiCard icon={<MessageSquare className="h-4 w-4" />} label="Conversas ativas" value={data.totals.activeConvs} />
            <KpiCard icon={<MessageSquare className="h-4 w-4" />} label="Novas no período" value={data.totals.newConvs} />
            <KpiCard icon={<AlertCircle className="h-4 w-4 text-destructive" />} label="Falhas" value={data.totals.failed} />
          </div>

          {/* Volume diário */}
          <Card title="Volume diário (enviadas vs recebidas)">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.series}>
                  <defs>
                    <linearGradient id="g-sent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g-recv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="rgba(255,255,255,0.3)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="rgba(255,255,255,0.3)" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="sent" name="Enviadas" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#g-sent)" />
                  <Area type="monotone" dataKey="received" name="Recebidas" stroke="#10b981" fillOpacity={1} fill="url(#g-recv)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Temperatura */}
            <Card title="Temperatura dos leads">
              <div className="grid grid-cols-2 gap-4 items-center">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Quente", value: data.tempCounts.quente, color: "#ef4444" },
                          { name: "Morno", value: data.tempCounts.morno, color: "#f59e0b" },
                          { name: "Frio", value: data.tempCounts.frio, color: "#0ea5e9" },
                          { name: "Sem", value: data.tempCounts.sem, color: "#475569" },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={40}
                        outerRadius={70}
                      >
                        {[
                          "#ef4444", "#f59e0b", "#0ea5e9", "#475569",
                        ].map((c) => <Cell key={c} fill={c} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 text-xs">
                  <TempRow icon={<Flame className="h-4 w-4 text-red-400" />} label="Quente" value={data.tempCounts.quente} />
                  <TempRow icon={<Thermometer className="h-4 w-4 text-amber-400" />} label="Morno" value={data.tempCounts.morno} />
                  <TempRow icon={<Snowflake className="h-4 w-4 text-sky-400" />} label="Frio" value={data.tempCounts.frio} />
                  <TempRow icon={<span className="h-2 w-2 rounded-full bg-muted inline-block" />} label="Sem classificação" value={data.tempCounts.sem} />
                </div>
              </div>
            </Card>

            {/* Automações */}
            <Card title="Automações no período" right={<Zap className="h-4 w-4 text-muted-foreground" />}>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Stat label="Execuções" value={data.automations.executed} />
                <Stat label="Enviadas" value={data.automations.sent} valueClass="text-green-400" />
                <Stat label="Puladas" value={data.automations.skipped} valueClass="text-muted-foreground" />
                <Stat label="Falhas" value={data.automations.failed} valueClass="text-destructive" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                Status das conversas: {data.statusCounts.open} abertas · {data.statusCounts.pending} pendentes · {data.statusCounts.closed} fechadas.
              </p>
            </Card>
          </div>

          {/* Por SDR */}
          <Card title="Por SDR">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-muted-foreground">
                    <th className="text-left py-2 px-3">SDR</th>
                    <th className="text-right py-2 px-3">Conversas</th>
                    <th className="text-right py-2 px-3">Enviadas</th>
                    <th className="text-right py-2 px-3">Recebidas</th>
                    <th className="text-right py-2 px-3">Quente</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySdr.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Sem dados.</td></tr>
                  )}
                  {data.bySdr.map((s) => (
                    <tr key={s.user_id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 px-3">{s.name}</td>
                      <td className="text-right py-2 px-3">{s.conversations}</td>
                      <td className="text-right py-2 px-3 text-primary">{s.sent}</td>
                      <td className="text-right py-2 px-3 text-emerald-400">{s.received}</td>
                      <td className="text-right py-2 px-3">
                        {s.quente > 0 ? (
                          <Badge variant="outline" className="border-red-500/40 text-red-300 text-[10px]">
                            {s.quente}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Campanhas */}
          <Card title="Campanhas no período">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-muted-foreground">
                    <th className="text-left py-2 px-3">Nome</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-right py-2 px-3">Total</th>
                    <th className="text-right py-2 px-3">Enviadas</th>
                    <th className="text-right py-2 px-3">Entregues</th>
                    <th className="text-right py-2 px-3">Lidas</th>
                    <th className="text-right py-2 px-3">Falhas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byCampaign.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">Nenhuma campanha no período.</td></tr>
                  )}
                  {data.byCampaign.map((c) => (
                    <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 px-3">
                        <Link to="/whatsapp/campanhas/$id" params={{ id: c.id }} className="hover:underline text-primary">
                          {c.name}
                        </Link>
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                      </td>
                      <td className="text-right py-2 px-3">{c.total}</td>
                      <td className="text-right py-2 px-3">{c.sent}</td>
                      <td className="text-right py-2 px-3">{c.delivered}</td>
                      <td className="text-right py-2 px-3">{c.read}</td>
                      <td className="text-right py-2 px-3 text-destructive">{c.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-white/5 rounded-lg p-3 bg-card/50">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border border-white/5 rounded-lg bg-card/50">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function TempRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2">{icon} {label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: number; valueClass?: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
}