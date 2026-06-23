import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLeadsAnalytics } from "@/lib/leads-analytics.functions";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import {
  Users, Flame, Phone, Calendar, Trophy, XCircle, TrendingUp, Megaphone,
} from "lucide-react";

export const Route = createFileRoute("/_app/leads-analytics")({
  component: LeadsAnalyticsPage,
});

type Dim = "campaign" | "ad_name" | "source" | "channel" | "form_name";
const DIM_LABEL: Record<Dim, string> = {
  campaign: "Campanha",
  ad_name: "Anúncio",
  source: "Fonte",
  channel: "Canal",
  form_name: "Formulário",
};

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#64748b"];

function LeadsAnalyticsPage() {
  const fn = useServerFn(getLeadsAnalytics);
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "180d">("30d");
  const [dimension, setDimension] = useState<Dim>("campaign");

  const { from, to } = useMemo(() => {
    const now = new Date();
    const days = range === "7d" ? 7 : range === "90d" ? 90 : range === "180d" ? 180 : 30;
    return { from: new Date(now.getTime() - days * 86400000).toISOString(), to: now.toISOString() };
  }, [range]);

  const { data, isLoading } = useQuery({
    queryKey: ["leads-analytics", range, dimension],
    queryFn: () => fn({ data: { from, to, dimension } }),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Analytics de Leads</h2>
          <p className="text-xs text-muted-foreground">
            Perfil de quem entra, campanhas/ads com maior volume e conversão no funil por origem.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dimension} onValueChange={(v) => setDimension(v as Dim)}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["campaign", "ad_name", "source", "channel", "form_name"] as Dim[]).map((d) => (
                <SelectItem key={d} value={d}>Por {DIM_LABEL[d]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7d</SelectItem>
              <SelectItem value="30d">Últimos 30d</SelectItem>
              <SelectItem value="90d">Últimos 90d</SelectItem>
              <SelectItem value="180d">Últimos 180d</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Kpi icon={<Users className="h-4 w-4" />} label="Leads" value={data.totals.leads} />
            <Kpi icon={<Phone className="h-4 w-4" />} label="Contatados" value={data.totals.contacted}
                 sub={`${pct(data.totals.contacted, data.totals.leads)}%`} />
            <Kpi icon={<Calendar className="h-4 w-4" />} label="Reuniões" value={data.totals.meetings}
                 sub={`${pct(data.totals.meetings, data.totals.leads)}%`} />
            <Kpi icon={<Flame className="h-4 w-4 text-red-400" />} label="Quentes" value={data.totals.hot} />
            <Kpi icon={<Trophy className="h-4 w-4 text-emerald-400" />} label="Ganhos" value={data.totals.won}
                 sub={`${pct(data.totals.won, data.totals.leads)}%`} />
            <Kpi icon={<XCircle className="h-4 w-4 text-destructive" />} label="Perdidos" value={data.totals.lost} />
          </div>

          <Card title="Volume diário de leads (com reuniões / ganhos)">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.series}>
                  <defs>
                    <linearGradient id="g-total" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="rgba(255,255,255,0.3)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="rgba(255,255,255,0.3)" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="total" name="Leads" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#g-total)" />
                  <Area type="monotone" dataKey="meeting" name="Reuniões" stroke="#f59e0b" fill="transparent" />
                  <Area type="monotone" dataKey="won" name="Ganhos" stroke="#10b981" fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Funil */}
          <div className="grid lg:grid-cols-3 gap-4">
            <Card title="Funil — distribuição atual" className="lg:col-span-2">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.funnel} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" tick={{ fontSize: 10 }} stroke="rgba(255,255,255,0.3)" allowDecimals={false} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} stroke="rgba(255,255,255,0.3)" width={120} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12 }} />
                    <Bar dataKey="count" name="Leads">
                      {data.funnel.map((f, i) => (
                        <Cell key={f.stage_id} fill={f.is_terminal ? (i % 2 ? "#10b981" : "#ef4444") : COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {data.unstaged > 0 && (
                <p className="text-[11px] text-muted-foreground mt-2">+ {data.unstaged} sem estágio definido.</p>
              )}
            </Card>

            <Card title="Razões de perda">
              {data.lostBreakdown.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem perdas no período.</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {data.lostBreakdown.map((r) => (
                    <li key={r.label} className="flex items-center justify-between gap-2">
                      <span className="truncate">{r.label}</span>
                      <Badge variant="outline" className="text-[10px]">{r.value}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Perfis */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ProfileCard title="Tipo de lead" rows={data.profile.lead_type} />
            <ProfileCard title="Prioridade" rows={data.profile.priority} />
            <ProfileCard title="Segmento" rows={data.profile.segment} />
            <ProfileCard title="Porte" rows={data.profile.size} />
            <ProfileCard title="Localização" rows={data.profile.location} />
            <ProfileCard title="Fonte" rows={data.profile.source} />
          </div>

          {/* Por dimensão */}
          <Card
            title={`Performance por ${DIM_LABEL[data.dimension as Dim]}`}
            right={<Megaphone className="h-4 w-4 text-muted-foreground" />}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-muted-foreground">
                    <th className="text-left py-2 px-3">{DIM_LABEL[data.dimension as Dim]}</th>
                    <th className="text-right py-2 px-3">Leads</th>
                    <th className="text-right py-2 px-3">Contatados</th>
                    <th className="text-right py-2 px-3">Reuniões</th>
                    <th className="text-right py-2 px-3">Quente</th>
                    <th className="text-right py-2 px-3">Ganhos</th>
                    <th className="text-right py-2 px-3">Perdidos</th>
                    <th className="text-right py-2 px-3">Win %</th>
                    <th className="text-right py-2 px-3">Score médio</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byDimension.length === 0 && (
                    <tr><td colSpan={9} className="text-center py-6 text-muted-foreground">Sem dados.</td></tr>
                  )}
                  {data.byDimension.map((r) => (
                    <tr key={r.key} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 px-3 max-w-[280px] truncate" title={r.key}>{r.key}</td>
                      <td className="text-right py-2 px-3 font-medium">{r.total}</td>
                      <td className="text-right py-2 px-3">{r.contacted}</td>
                      <td className="text-right py-2 px-3 text-amber-300">{r.meeting}</td>
                      <td className="text-right py-2 px-3 text-red-300">{r.hot}</td>
                      <td className="text-right py-2 px-3 text-emerald-300">{r.won}</td>
                      <td className="text-right py-2 px-3 text-destructive">{r.lost}</td>
                      <td className="text-right py-2 px-3">
                        <span className={r.winRate >= 0.1 ? "text-emerald-300" : "text-muted-foreground"}>
                          {Math.round(r.winRate * 100)}%
                        </span>
                      </td>
                      <td className="text-right py-2 px-3">{r.avgScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Top 50 — combine com o seletor de dimensão pra comparar campanhas vs anúncios vs fontes.
            </p>
          </Card>

          {/* Conversão por dimensão x estágio */}
          <Card title={`Evolução no funil por ${DIM_LABEL[data.dimension as Dim]} (top 10)`}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-muted-foreground">
                    <th className="text-left py-2 px-3 sticky left-0 bg-card/50">{DIM_LABEL[data.dimension as Dim]}</th>
                    {data.stages.map((s) => (
                      <th key={s.id} className="text-right py-2 px-3">{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.byDimension.slice(0, 10).map((r) => (
                    <tr key={r.key} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 px-3 max-w-[200px] truncate sticky left-0 bg-card/30" title={r.key}>{r.key}</td>
                      {data.stages.map((s) => {
                        const c = r.byStage[s.id] ?? 0;
                        const ratio = r.total > 0 ? c / r.total : 0;
                        return (
                          <td key={s.id} className="text-right py-2 px-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <span>{c}</span>
                              {c > 0 && (
                                <span className="text-[10px] text-muted-foreground">
                                  {Math.round(ratio * 100)}%
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-[11px] text-muted-foreground text-center">
            Dica: vá até o <Link to="/kanban" className="underline text-primary">Kanban</Link> para detalhar leads específicos.
          </p>
        </>
      )}
    </div>
  );
}

function pct(num: number, den: number) {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
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

function Card({ title, right, children, className }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`border border-white/5 rounded-lg bg-card/50 ${className ?? ""}`}>
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ProfileCard({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
  const total = rows.reduce((a, b) => a + b.value, 0);
  const top = rows.slice(0, 6);
  const pie = top.map((r, i) => ({ ...r, color: COLORS[i % COLORS.length] }));
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem dados.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 items-center">
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="label" innerRadius={28} outerRadius={50}>
                  {pie.map((p) => <Cell key={p.label} fill={p.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-1 text-xs">
            {top.map((r, i) => (
              <li key={r.label} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="truncate" title={r.label}>{r.label}</span>
                </span>
                <span className="font-mono text-muted-foreground">
                  {r.value} <span className="text-[10px]">({pct(r.value, total)}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
