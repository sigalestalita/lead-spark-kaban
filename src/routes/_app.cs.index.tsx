import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentRole } from "@/lib/use-role";
import { listCustomers, updateCustomerStatus, getCsStats } from "@/lib/modules.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/cs/")({
  component: CsPage,
});

const STATUS = [
  { key: "onboarding", label: "Onboarding" },
  { key: "ativo", label: "Ativo" },
  { key: "em_risco", label: "Em risco" },
  { key: "churn", label: "Churn" },
] as const;

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function CsPage() {
  const { isCs, loading } = useCurrentRole();
  const listFn = useServerFn(listCustomers);
  const statsFn = useServerFn(getCsStats);
  const statusFn = useServerFn(updateCustomerStatus);
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ["cs-customers"], queryFn: () => listFn(), enabled: isCs });
  const { data: stats } = useQuery({ queryKey: ["cs-stats"], queryFn: () => statsFn(), enabled: isCs });

  const upd = useMutation({
    mutationFn: (v: { id: string; status: (typeof STATUS)[number]["key"] }) => statusFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cs-customers"] });
      qc.invalidateQueries({ queryKey: ["cs-stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  if (!isCs) return <div className="p-8 text-sm text-muted-foreground">Acesso restrito ao time de CS.</div>;

  const customers = data?.customers ?? [];

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <h1 className="text-2xl font-bold">Customer Success</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">MRR ativo</p><p className="text-xl font-bold">{fmtBRL(stats?.mrr ?? 0)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Onboarding</p><p className="text-2xl font-bold">{stats?.onboarding ?? 0}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Ativos</p><p className="text-2xl font-bold">{stats?.active ?? 0}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Em risco</p><p className="text-2xl font-bold text-amber-500">{stats?.atRisk ?? 0}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Churn</p><p className="text-2xl font-bold text-destructive">{stats?.churn ?? 0}</p></Card>
      </div>

      <Card className="p-4">
        <h2 className="font-semibold text-sm mb-3">Clientes</h2>
        <div className="space-y-2">
          {customers.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{c.company_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {c.contact_name ?? "—"} · MRR {c.mrr != null ? fmtBRL(Number(c.mrr)) : "—"} · Health {c.health_score ?? "—"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{STATUS.find((s) => s.key === c.status)?.label}</Badge>
                <select
                  className="rounded border bg-background px-2 py-1 text-xs"
                  value={c.status as string}
                  onChange={(e) => upd.mutate({ id: c.id, status: e.target.value as (typeof STATUS)[number]["key"] })}
                >
                  {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            </div>
          ))}
          {customers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum cliente ainda. Ao marcar um deal como "Ganho" no Comercial, o cliente é criado aqui automaticamente.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
