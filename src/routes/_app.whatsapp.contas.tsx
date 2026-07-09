import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAccounts,
  upsertAccount,
  deleteAccount,
  testSendAccount,
  registerCloudNumber,
} from "@/lib/whatsapp-accounts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Copy, Send, CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/whatsapp/contas")({
  component: ContasPage,
});

type AccountRow = {
  id: string;
  label: string | null;
  phone_number: string;
  provider: string;
  provider_instance_id: string | null;
  provider_base_url: string | null;
  access_token: string | null;
  webhook_secret: string | null;
  metadata: Record<string, unknown> | null;
  is_default: boolean;
  status: string;
};

const emptyForm = {
  id: undefined as string | undefined,
  label: "",
  phone_number: "",
  provider: "meta_cloud" as "meta_cloud" | "mock",
  provider_instance_id: "",
  access_token: "",
  webhook_secret: "",
  verify_token: "",
  waba_id: "",
  provider_base_url: "",
  is_default: false,
  status: "active" as "active" | "disabled",
};

const STABLE_WEBHOOK_ORIGIN = "https://sdr-grou.lovable.app";

function ContasPage() {
  const listFn = useServerFn(listAccounts);
  const saveFn = useServerFn(upsertAccount);
  const delFn = useServerFn(deleteAccount);
  const testFn = useServerFn(testSendAccount);
  const registerFn = useServerFn(registerCloudNumber);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["wa-accounts"],
    queryFn: () => listFn(),
  });

  const accounts = (data?.accounts ?? []) as AccountRow[];

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [testOpen, setTestOpen] = useState<AccountRow | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testBody, setTestBody] = useState("Teste de integração WhatsApp Cloud API ✅");
  const [regOpen, setRegOpen] = useState<AccountRow | null>(null);
  const [regPin, setRegPin] = useState("");

  const origin = STABLE_WEBHOOK_ORIGIN;

  function openCreate() {
    setForm(emptyForm);
    setOpen(true);
  }
  function openEdit(a: AccountRow) {
    setForm({
      id: a.id,
      label: a.label ?? "",
      phone_number: a.phone_number,
      provider: (a.provider as "meta_cloud" | "mock") ?? "meta_cloud",
      provider_instance_id: a.provider_instance_id ?? "",
      access_token: "",
      webhook_secret: "",
      verify_token: "",
      waba_id: (a.metadata?.waba_id as string) ?? "",
      provider_base_url: a.provider_base_url ?? "",
      is_default: a.is_default,
      status: (a.status as "active" | "disabled") ?? "active",
    });
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: form.id,
          label: form.label,
          phone_number: form.phone_number,
          provider: form.provider,
          provider_instance_id: form.provider_instance_id,
          access_token: form.access_token || undefined,
          webhook_secret: form.webhook_secret || undefined,
          verify_token: form.verify_token || undefined,
          waba_id: form.waba_id || undefined,
          provider_base_url: form.provider_base_url || undefined,
          is_default: form.is_default,
          status: form.status,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-accounts"] });
      setOpen(false);
      toast.success("Conta salva.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-accounts"] }),
  });

  const test = useMutation({
    mutationFn: () =>
      testFn({ data: { id: testOpen!.id, to: testTo, body: testBody } }),
    onSuccess: (r) => {
      if (r.status === "failed") toast.error(`Falhou: ${r.error ?? "erro"}`);
      else toast.success(`Enviado (id: ${r.providerMessageId || "—"})`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const register = useMutation({
    mutationFn: () => registerFn({ data: { id: regOpen!.id, pin: regPin } }),
    onSuccess: () => {
      toast.success("Número registrado na Cloud API! Guarde o PIN.");
      setRegOpen(null);
      setRegPin("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const webhookUrl = useMemo(
    () => (form.id ? `${origin}/api/public/whatsapp/webhook/${form.id}` : ""),
    [form.id, origin],
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Contas de WhatsApp</h2>
          <p className="text-xs text-muted-foreground">
            Configure uma ou mais contas <strong>Meta WhatsApp Cloud API</strong>. Cada conta
            tem seu webhook próprio.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Nova conta
        </Button>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {!isLoading && accounts.length === 0 && (
        <div className="border border-dashed border-white/10 rounded-lg p-8 text-center text-sm text-muted-foreground">
          Nenhuma conta configurada. Clique em <strong>Nova conta</strong> para conectar a Meta Cloud API.
        </div>
      )}

      <div className="grid gap-3">
        {accounts.map((a) => {
          const url = `${origin}/api/public/whatsapp/webhook/${a.id}`;
          return (
            <div key={a.id} className="border border-white/5 rounded-lg p-4 bg-card/50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{a.label || a.phone_number}</p>
                    <Badge variant="outline" className="text-[10px]">{a.provider}</Badge>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${a.status === "active" ? "border-green-500/40 text-green-400" : "border-muted-foreground/30"}`}
                    >
                      {a.status}
                    </Badge>
                    {a.is_default && (
                      <Badge className="text-[10px] bg-primary/20 text-primary border border-primary/30">
                        padrão
                      </Badge>
                    )}
                    {a.access_token && (
                      <span className="text-[10px] text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> credenciais ok
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Número: <span className="font-mono">{a.phone_number}</span>
                    {a.provider_instance_id && (
                      <>
                        {" · "}phone_number_id:{" "}
                        <span className="font-mono">{a.provider_instance_id}</span>
                      </>
                    )}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="text-[11px] bg-background border border-white/10 rounded px-2 py-1 truncate flex-1 font-mono">
                      {url}
                    </code>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(url);
                        toast.success("URL copiada");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {a.provider === "meta_cloud" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Registrar número na Cloud API"
                      onClick={() => { setRegOpen(a); setRegPin(""); }}
                    >
                      <ShieldCheck className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Enviar teste"
                    onClick={() => {
                      setTestOpen(a);
                      setTestTo("");
                    }}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(a)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Excluir conta "${a.label || a.phone_number}"?`)) del.mutate(a.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dialog criar/editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar conta" : "Nova conta WhatsApp"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Rótulo</label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Grou · SDR" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Provider</label>
                <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v as "meta_cloud" | "mock" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meta_cloud">Meta WhatsApp Cloud API</SelectItem>
                    <SelectItem value="mock">Mock (desenvolvimento)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Número (E.164)</label>
                <Input value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} placeholder="+5511999999999" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Phone Number ID (Meta)</label>
                <Input value={form.provider_instance_id} onChange={(e) => setForm({ ...form, provider_instance_id: e.target.value })} placeholder="123456789012345" />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">
                Access Token permanente (System User)
                {form.id && <span className="ml-1 text-[10px]">— deixe em branco para manter o atual</span>}
              </label>
              <Input
                value={form.access_token}
                onChange={(e) => setForm({ ...form, access_token: e.target.value })}
                placeholder="EAAB..."
                type="password"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">
                  App Secret (HMAC do webhook)
                  {form.id && <span className="ml-1 text-[10px]">— em branco mantém</span>}
                </label>
                <Input
                  value={form.webhook_secret}
                  onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })}
                  placeholder="App Secret"
                  type="password"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Verify Token (configurado no Meta)
                  {form.id && <span className="ml-1 text-[10px]">— em branco mantém</span>}
                </label>
                <Input
                  value={form.verify_token}
                  onChange={(e) => setForm({ ...form, verify_token: e.target.value })}
                  placeholder="qualquer string forte"
                  type="password"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">WABA ID (opcional)</label>
                <Input value={form.waba_id} onChange={(e) => setForm({ ...form, waba_id: e.target.value })} placeholder="WhatsApp Business Account ID" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Base URL override (opcional)</label>
                <Input value={form.provider_base_url} onChange={(e) => setForm({ ...form, provider_base_url: e.target.value })} placeholder="https://graph.facebook.com/v21.0" />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
                <span className="text-xs">Conta padrão para envios</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.status === "active"} onCheckedChange={(v) => setForm({ ...form, status: v ? "active" : "disabled" })} />
                <span className="text-xs">Ativa</span>
              </div>
            </div>

            {webhookUrl && (
              <div className="border border-white/5 rounded-md p-3 bg-background/40">
                <p className="text-[11px] text-muted-foreground mb-1">
                  Configure este Callback URL no painel Meta → Webhooks da conta:
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-[11px] flex-1 font-mono truncate">{webhookUrl}</code>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(webhookUrl);
                      toast.success("URL copiada");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Use o <strong>mesmo Verify Token</strong> acima. Inscreva os campos{" "}
                  <code>messages</code> e <code>message_template_status_update</code>.
                </p>
              </div>
            )}

            {save.error instanceof Error && (
              <p className="text-xs text-destructive">{save.error.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || !form.label || !form.phone_number || !form.provider_instance_id}
            >
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog teste de envio */}
      <Dialog open={!!testOpen} onOpenChange={(v) => !v && setTestOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar mensagem de teste</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Via conta <strong>{testOpen?.label || testOpen?.phone_number}</strong>. O destinatário
              precisa ter conversado com seu número nas últimas 24h ou estar dentro de um template aprovado.
            </p>
            <div>
              <label className="text-xs text-muted-foreground">Para (E.164, ex: 5511999999999)</label>
              <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="5511999999999" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Mensagem</label>
              <Input value={testBody} onChange={(e) => setTestBody(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(null)}>Fechar</Button>
            <Button onClick={() => test.mutate()} disabled={test.isPending || !testTo || !testBody}>
              {test.isPending ? "Enviando…" : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog registrar número na Cloud API */}
      <Dialog open={!!regOpen} onOpenChange={(v) => !v && setRegOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar número na Cloud API</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Executa <code>POST /{regOpen?.provider_instance_id}/register</code> na Meta. Faça isso
              uma única vez por número, antes de enviar mensagens. Defina um <strong>PIN de 6 dígitos</strong>{" "}
              (verificação em duas etapas) — guarde-o, pode ser pedido em re-verificações futuras.
            </p>
            <div>
              <label className="text-xs text-muted-foreground">PIN (6 dígitos)</label>
              <Input
                value={regPin}
                onChange={(e) => setRegPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                maxLength={6}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Erros comuns: <code>#133006</code> número já registrado em outro app (precisa de recovery
              token); <code>#100</code> token sem acesso à WABA; <code>#133005</code> PIN antigo divergente.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegOpen(null)}>Cancelar</Button>
            <Button onClick={() => register.mutate()} disabled={register.isPending || regPin.length !== 6}>
              {register.isPending ? "Registrando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}