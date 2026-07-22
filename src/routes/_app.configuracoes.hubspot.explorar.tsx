import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listHubspotRecords } from "@/lib/hubspot-explorer.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/configuracoes/hubspot/explorar")({
  head: () => ({ meta: [{ title: "Explorar dados HubSpot — COMPASS" }] }),
  component: ExplorerPage,
});

type ObjType = "contacts" | "companies" | "deals" | "owners";
const TABS: { key: ObjType; label: string }[] = [
  { key: "contacts", label: "Contatos" },
  { key: "companies", label: "Empresas" },
  { key: "deals", label: "Negócios" },
  { key: "owners", label: "Owners" },
];

function ExplorerPage() {
  const [tab, setTab] = useState<ObjType>("contacts");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const listFn = useServerFn(listHubspotRecords);

  const { data, isLoading } = useQuery({
    queryKey: ["hs-explorer", tab, search, page],
    queryFn: () => listFn({ data: { objectType: tab, search, page, pageSize } }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.count / pageSize)) : 1;

  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Explorar dados HubSpot</h1>
          <p className="text-sm text-muted-foreground">
            Registros importados pra tabelas <code>hs_*</code>. Isolados do COMPASS.
          </p>
        </div>
        <Link to="/configuracoes/hubspot"><Button variant="outline" size="sm">Voltar</Button></Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t.key} size="sm"
            variant={tab === t.key ? "default" : "outline"}
            onClick={() => { setTab(t.key); setPage(0); }}>
            {t.label}
          </Button>
        ))}
      </div>

      <div className="flex gap-2">
        <Input placeholder="Buscar…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading || !data ? (
          <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
        ) : data.rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Nenhum registro encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>{headers(tab).map((h) => <th key={h} className="text-left px-3 py-2">{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    {renderCells(tab, r)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{data?.count?.toLocaleString("pt-BR") ?? 0} registros no total</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
          <span>Pág {page + 1} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}>Próxima</Button>
        </div>
      </div>
    </div>
  );
}

function headers(tab: ObjType): string[] {
  if (tab === "contacts") return ["Nome", "Email", "Telefone", "Empresa", "Cargo", "Lifecycle", "Atualizado"];
  if (tab === "companies") return ["Nome", "Domínio", "CNPJ", "Indústria", "Funcionários", "Atualizado"];
  if (tab === "deals") return ["Negócio", "Valor", "Pipeline", "Etapa", "Status", "Fechado em", "Atualizado"];
  return ["Nome", "Email", "Ativo"];
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("pt-BR"); } catch { return "—"; }
}
function fmtMoney(v?: number | null, c?: string | null) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: c || "BRL" }).format(v);
}

function td(children: React.ReactNode, i: number) {
  return <td key={i} className="px-3 py-2 align-top">{children}</td>;
}

function renderCells(tab: ObjType, r: any): React.ReactNode {
  if (tab === "contacts") {
    return [
      `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "—",
      r.email ?? "—",
      r.phone ?? "—",
      r.company_name ?? "—",
      r.jobtitle ?? "—",
      r.lifecyclestage ?? "—",
      fmtDate(r.hs_updated_at),
    ].map(td);
  }
  if (tab === "companies") {
    return [
      r.name ?? "—",
      r.domain ?? "—",
      r.cnpj ?? "—",
      r.industry ?? "—",
      r.numberofemployees ?? "—",
      fmtDate(r.hs_updated_at),
    ].map(td);
  }
  if (tab === "deals") {
    const status = r.outcome === "won"
      ? <Badge>Ganho</Badge>
      : r.outcome === "lost"
      ? <Badge variant="destructive">Perdido</Badge>
      : <Badge variant="outline">Aberto</Badge>;
    return [
      r.dealname ?? "—",
      fmtMoney(r.amount, r.currency),
      r.pipeline ?? "—",
      r.dealstage ?? "—",
      status,
      fmtDate(r.hs_closed_at),
      fmtDate(r.hs_updated_at),
    ].map(td);
  }
  return [
    `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "—",
    r.email ?? "—",
    r.active ? <Badge>Ativo</Badge> : <Badge variant="outline">Inativo</Badge>,
  ].map(td);
}
