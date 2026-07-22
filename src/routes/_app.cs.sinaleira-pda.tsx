import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentRole } from "@/lib/use-role";
import {
  syncSinaleiraPDA,
  listSinaleiraClients,
  updateSinaleiraClient,
  listSinaleiraActivities,
  addSinaleiraActivity,
  listCsAssignableUsers,
} from "@/lib/cs-sinaleira.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_app/cs/sinaleira-pda")({
  component: SinaleiraPage,
});

const COLORS = [
  { key: "VERMELHO", label: "Vermelho", bg: "bg-red-500/10", border: "border-red-500/40", dot: "bg-red-500" },
  { key: "AMARELO", label: "Amarelo", bg: "bg-yellow-500/10", border: "border-yellow-500/40", dot: "bg-yellow-500" },
  { key: "VERDE", label: "Verde", bg: "bg-green-500/10", border: "border-green-500/40", dot: "bg-green-500" },
  { key: "PRETO", label: "Preto", bg: "bg-neutral-800/10", border: "border-neutral-700/40", dot: "bg-neutral-900" },
] as const;

const KANBAN_STATUS = [
  { key: "a_contatar", label: "A contatar" },
  { key: "em_contato", label: "Em contato" },
  { key: "atendido", label: "Atendido" },
  { key: "concluido", label: "Concluído" },
] as const;

const ACT_TYPES = [
  { key: "reuniao_estrategica", label: "Reunião estratégica" },
  { key: "onboarding", label: "Onboarding" },
  { key: "masterclass", label: "Masterclass" },
  { key: "outro", label: "Outro" },
] as const;

type Client = Awaited<ReturnType<typeof listSinaleiraClients>>["clients"][number];

function SinaleiraPage() {
  const { isCs, loading } = useCurrentRole();
  const qc = useQueryClient();
  const syncFn = useServerFn(syncSinaleiraPDA);
  const listFn = useServerFn(listSinaleiraClients);
  const usersFn = useServerFn(listCsAssignableUsers);
  const updateFn = useServerFn(updateSinaleiraClient);

  const { data, isLoading } = useQuery({
    queryKey: ["signal-clients"],
    queryFn: () => listFn(),
    enabled: isCs,
  });
  const { data: usersData } = useQuery({
    queryKey: ["cs-users"],
    queryFn: () => usersFn(),
    enabled: isCs,
  });

  const [selected, setSelected] = useState<Client | null>(null);
  const [filter, setFilter] = useState("");

  const syncMut = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      toast.success(`Sincronizado: ${r.count} clientes da aba "${r.tab}"`);
      qc.invalidateQueries({ queryKey: ["signal-clients"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const updMut = useMutation({
    mutationFn: (v: { id: string; kanban_status?: string; assigned_user_id?: string | null }) =>
      updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["signal-clients"] }),
  });

  const clients = data?.clients ?? [];
  const users = usersData?.users ?? [];

  const grouped = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const filtered = f
      ? clients.filter((c) => c.nome.toLowerCase().includes(f) || (c.motivo_sinaleira ?? "").toLowerCase().includes(f))
      : clients;
    const g: Record<string, Client[]> = { VERMELHO: [], AMARELO: [], VERDE: [], PRETO: [] };
    for (const c of filtered) {
      const key = (c.sinaleira ?? "PRETO").toUpperCase();
      (g[key] ?? (g[key] = [])).push(c);
    }
    return g;
  }, [clients, filter]);

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  if (!isCs) return <div className="p-8 text-sm text-muted-foreground">Acesso restrito ao time de CS.</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sinaleira PDA</h1>
          <p className="text-xs text-muted-foreground">
            Sincroniza sempre com a aba mais recente da planilha de sinaleira.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filtrar por cliente ou motivo…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-64"
          />
          <Button onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMut.isPending ? "animate-spin" : ""}`} />
            Sincronizar planilha
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : clients.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum cliente sincronizado ainda. Clique em <strong>Sincronizar planilha</strong> para importar.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {COLORS.map((col) => {
            const list = grouped[col.key] ?? [];
            return (
              <div key={col.key} className={`rounded-lg border ${col.border} ${col.bg} p-3 flex flex-col min-h-[200px]`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-3 w-3 rounded-full ${col.dot}`} />
                    <h3 className="font-semibold text-sm">{col.label}</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">{list.length}</span>
                </div>
                <div className="space-y-2 overflow-y-auto max-h-[70vh]">
                  {list.map((c) => {
                    const assigned = users.find((u) => u.id === c.assigned_user_id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelected(c)}
                        className="w-full text-left rounded-md border bg-background p-2.5 hover:border-primary transition-colors"
                      >
                        <p className="font-medium text-sm truncate">{c.nome.trim()}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {c.tipo_conta ?? "—"} · Saldo {c.saldo_atual ?? "—"} · {c.meses_restantes ?? "—"} m
                        </p>
                        {c.motivo_sinaleira ? (
                          <p className="text-[11px] text-muted-foreground truncate mt-1">{c.motivo_sinaleira}</p>
                        ) : null}
                        <div className="flex items-center justify-between mt-2">
                          <Badge variant="outline" className="text-[10px]">
                            {KANBAN_STATUS.find((s) => s.key === c.kanban_status)?.label ?? c.kanban_status}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                            {assigned?.full_name ?? "sem responsável"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ClientDialog
        client={selected}
        users={users}
        onClose={() => setSelected(null)}
        onUpdate={(patch) => selected && updMut.mutate({ id: selected.id, ...patch })}
      />
    </div>
  );
}

function ClientDialog({
  client,
  users,
  onClose,
  onUpdate,
}: {
  client: Client | null;
  users: { id: string; full_name: string | null; email: string | null }[];
  onClose: () => void;
  onUpdate: (patch: { kanban_status?: string; assigned_user_id?: string | null }) => void;
}) {
  const qc = useQueryClient();
  const listActs = useServerFn(listSinaleiraActivities);
  const addAct = useServerFn(addSinaleiraActivity);

  const { data: actsData } = useQuery({
    queryKey: ["signal-activities", client?.id],
    queryFn: () => listActs({ data: { clientId: client!.id } }),
    enabled: !!client,
  });

  const [type, setType] = useState<(typeof ACT_TYPES)[number]["key"]>("reuniao_estrategica");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  const addMut = useMutation({
    mutationFn: () =>
      addAct({ data: { clientId: client!.id, activity_type: type, title: title || null, notes: notes || null } }),
    onSuccess: () => {
      toast.success("Atividade registrada. Responsável notificado por e-mail.");
      setTitle("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["signal-activities", client?.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const acts = actsData?.activities ?? [];

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {client && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${
                  client.sinaleira === "VERDE" ? "bg-green-500"
                    : client.sinaleira === "AMARELO" ? "bg-yellow-500"
                    : client.sinaleira === "VERMELHO" ? "bg-red-500" : "bg-neutral-800"
                }`} />
                {client.nome.trim()}
              </DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Tipo" v={client.tipo_conta} />
              <Info label="Sinaleira" v={client.sinaleira} />
              <Info label="Saldo atual" v={client.saldo_atual} />
              <Info label="Meses restantes" v={client.meses_restantes} />
              <Info label="Meta mensal" v={client.meta_mensal} />
              <Info label="Consumo último mês" v={client.consumo_ultimo_mes} />
              <Info label="Data expiração créditos" v={client.data_expiracao_creditos} />
              <Info label="Data expiração conta" v={client.data_expiracao_conta} />
              <div className="col-span-2">
                <Info label="Motivo sinaleira" v={client.motivo_sinaleira} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t pt-3">
              <div>
                <label className="text-xs font-medium">Status no kanban</label>
                <select
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
                  value={client.kanban_status}
                  onChange={(e) => onUpdate({ kanban_status: e.target.value })}
                >
                  {KANBAN_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Responsável</label>
                <select
                  className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
                  value={client.assigned_user_id ?? ""}
                  onChange={(e) => onUpdate({ assigned_user_id: e.target.value || null })}
                >
                  <option value="">— sem responsável —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t pt-3 space-y-2">
              <h4 className="font-semibold text-sm">Registrar atividade</h4>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="rounded border bg-background px-2 py-1.5 text-sm"
                  value={type}
                  onChange={(e) => setType(e.target.value as typeof type)}
                >
                  {ACT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <Input placeholder="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <Textarea placeholder="Notas / resumo do atendimento" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              <div className="flex justify-end">
                <Button size="sm" onClick={() => addMut.mutate()} disabled={addMut.isPending}>
                  {addMut.isPending ? "Salvando…" : "Registrar e notificar"}
                </Button>
              </div>
            </div>

            <div className="border-t pt-3">
              <h4 className="font-semibold text-sm mb-2">Histórico</h4>
              {acts.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma atividade registrada.</p>
              ) : (
                <ul className="space-y-2">
                  {acts.map((a) => (
                    <li key={a.id} className="rounded border p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {ACT_TYPES.find((t) => t.key === a.activity_type)?.label ?? a.activity_type}
                          {a.title ? ` — ${a.title}` : ""}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(a.performed_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      {a.notes ? <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">{a.notes}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, v }: { label: string; v: unknown }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-medium">{v == null || v === "" ? "—" : String(v)}</p>
    </div>
  );
}
