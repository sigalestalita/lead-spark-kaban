import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentRole } from "@/lib/use-role";
import { listInvoices, updateInvoiceStatus, getFinanceStats } from "@/lib/modules.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — COMPASS" }] }),
  component: FinanceiroPage,
});

const STATUS = [
  { key: "pendente", label: "Pendente" },
  { key: "pago", label: "Pago" },
  { key: "atrasado", label: "Atrasado" },
  { key: "cancelado", label: "Cancelado" },
] as const;

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function FinanceiroPage() {
  const { isFinanceiro, loading } = useCurrentRole();
  const listFn = useServerFn(listInvoices);
  const statsFn = useServerFn(getFinanceStats);
  const updFn = useServerFn(updateInvoiceStatus);
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ["invoices"], queryFn: () => listFn(), enabled: isFinanceiro });
  const { data: stats } = useQuery({ queryKey: ["finance-stats"], queryFn: () => statsFn(), enabled: isFinanceiro });

  const upd = useMutation({
    mutationFn: (v: { id: string; status: (typeof STATUS)[number]["key"] }) => updFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["finance-stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  if (!isFinanceiro)
    return <div className="p-8 text-sm text-muted-foreground">Acesso restrito ao time Financeiro.</div>;

  const invoices = data?.invoices ?? [];

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <h1 className="text-2xl font-bold">Financeiro</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Recebido</p><p className="text-xl font-bold text-emerald-500">{fmtBRL(stats?.paidAmount ?? 0)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">A receber</p><p className="text-xl font-bold">{fmtBRL(stats?.pendingAmount ?? 0)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Em atraso</p><p className="text-xl font-bold text-destructive">{fmtBRL(stats?.overdueAmount ?? 0)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Faturas atrasadas</p><p className="text-2xl font-bold">{stats?.overdueCount ?? 0}</p></Card>
      </div>

      <Card className="p-4">
        <h2 className="font-semibold text-sm mb-3">Faturas</h2>
        <div className="space-y-2">
          {invoices.map((i) => {
            const cust = (i as { cs_customers?: { company_name?: string } | null }).cs_customers;
            return (
              <div key={i.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{cust?.company_name ?? i.reference ?? "Fatura"}</p>
                  <p className="text-xs text-muted-foreground">
                    Vence em {new Date(i.due_date as string).toLocaleDateString("pt-BR")} · {fmtBRL(Number(i.amount))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{STATUS.find((s) => s.key === i.status)?.label}</Badge>
                  <select
                    className="rounded border bg-background px-2 py-1 text-xs"
                    value={i.status as string}
                    onChange={(e) => upd.mutate({ id: i.id, status: e.target.value as (typeof STATUS)[number]["key"] })}
                  >
                    {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            );
          })}
          {invoices.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma fatura ainda. As faturas são geradas a partir dos contratos.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
