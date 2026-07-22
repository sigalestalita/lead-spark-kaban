import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useCurrentRole } from "@/lib/use-role";
import {
  listDeals,
  createDeal,
  updateDealStage,
  getCommercialStats,
} from "@/lib/modules.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/comercial")({
  head: () => ({ meta: [{ title: "Comercial — COMPASS" }] }),
  component: ComercialPage,
});

const STAGES: { key: "novo" | "qualificado" | "proposta" | "negociacao" | "ganho" | "perdido"; label: string }[] = [
  { key: "novo", label: "Novo" },
  { key: "qualificado", label: "Qualificado" },
  { key: "proposta", label: "Proposta" },
  { key: "negociacao", label: "Negociação" },
  { key: "ganho", label: "Ganho" },
  { key: "perdido", label: "Perdido" },
];

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ComercialPage() {
  const { isComercial, loading } = useCurrentRole();
  const listFn = useServerFn(listDeals);
  const statsFn = useServerFn(getCommercialStats);
  const createFn = useServerFn(createDeal);
  const stageFn = useServerFn(updateDealStage);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [amount, setAmount] = useState("");

  const { data } = useQuery({ queryKey: ["deals"], queryFn: () => listFn(), enabled: isComercial });
  const { data: stats } = useQuery({ queryKey: ["deals-stats"], queryFn: () => statsFn(), enabled: isComercial });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          title,
          company_name: company || null,
          amount: amount ? Number(amount) : null,
          stage: "novo",
        },
      }),
    onSuccess: () => {
      toast.success("Oportunidade criada");
      setTitle("");
      setCompany("");
      setAmount("");
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["deals-stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const move = useMutation({
    mutationFn: (v: { id: string; stage: (typeof STAGES)[number]["key"] }) => stageFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["deals-stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  if (!isComercial)
    return <div className="p-8 text-sm text-muted-foreground">Acesso restrito ao time Comercial.</div>;

  const deals = data?.deals ?? [];

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <h1 className="text-2xl font-bold">Comercial</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Oportunidades abertas</p><p className="text-2xl font-bold">{stats?.openCount ?? 0}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Pipeline aberto</p><p className="text-2xl font-bold">{fmtBRL(stats?.openAmount ?? 0)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Ganhos</p><p className="text-2xl font-bold">{stats?.wonCount ?? 0}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Receita fechada</p><p className="text-2xl font-bold">{fmtBRL(stats?.wonAmount ?? 0)}</p></Card>
      </div>

      <Card className="p-4 space-y-2">
        <h2 className="font-semibold text-sm">Nova oportunidade</h2>
        <div className="grid md:grid-cols-4 gap-2">
          <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Empresa" value={company} onChange={(e) => setCompany(e.target.value)} />
          <Input placeholder="Valor (R$)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Button onClick={() => create.mutate()} disabled={!title || create.isPending}>Criar</Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold text-sm mb-3">Pipeline</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {STAGES.map((s) => {
            const items = deals.filter((d) => d.stage === s.key);
            return (
              <div key={s.key} className="space-y-2">
                <div className="text-xs font-medium flex items-center justify-between">
                  <span>{s.label}</span>
                  <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
                </div>
                {items.map((d) => (
                  <div key={d.id} className="rounded-md border p-2 text-xs space-y-1 bg-card">
                    <p className="font-medium truncate">{d.title}</p>
                    {d.company_name && <p className="text-muted-foreground truncate">{d.company_name}</p>}
                    {d.amount != null && <p className="text-muted-foreground">{fmtBRL(Number(d.amount))}</p>}
                    <select
                      className="mt-1 w-full rounded border bg-background px-1 py-0.5 text-[11px]"
                      value={d.stage as string}
                      onChange={(e) => move.mutate({ id: d.id, stage: e.target.value as (typeof STAGES)[number]["key"] })}
                    >
                      {STAGES.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
                    </select>
                  </div>
                ))}
                {items.length === 0 && <p className="text-[11px] text-muted-foreground">—</p>}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
