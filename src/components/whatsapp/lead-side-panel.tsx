import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getLeadDetail, updateLead } from "@/lib/leads.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRIORITY_LABEL, PRIORITY_COLOR } from "@/lib/lead-types";
import { LEAD_TYPE_LABEL, LEAD_TYPE_COLOR, type LeadType } from "@/lib/lead-type";
import { Building2, Globe, Linkedin, Mail, Phone, ExternalLink, User } from "lucide-react";

const LOST_PRESETS = ["Sem perfil", "Sem fit com soluções", "Sem contato"];

export function LeadSidePanel({ leadId }: { leadId: string }) {
  const fn = useServerFn(getLeadDetail);
  const updateFn = useServerFn(updateLead);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => fn({ data: { id: leadId } }),
  });

  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      updateFn({ data: { id: leadId, patch } }),
    onSuccess: () => {
      toast.success("Salvo");
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  if (isLoading) {
    return <p className="p-4 text-xs text-muted-foreground">Carregando lead…</p>;
  }
  if (!data) {
    return <p className="p-4 text-xs text-muted-foreground">Lead não encontrado.</p>;
  }

  const lead = data.lead;
  const stage = data.stages.find((s) => s.id === lead.stage_id) ?? null;
  const owner = data.profiles.find((p) => p.id === lead.assigned_to) ?? null;
  const lastNote = data.notes[0] ?? null;
  const isLost = stage?.slug === "desqualificado";

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 text-sm">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-semibold truncate">{lead.name ?? "Sem nome"}</p>
            {(lead.position || lead.company_name) && (
              <p className="text-xs text-muted-foreground truncate">
                {lead.position}
                {lead.position && lead.company_name ? " @ " : ""}
                {lead.company_name}
              </p>
            )}
          </div>
          <Button asChild size="sm" variant="outline" className="h-7 text-[11px] gap-1 shrink-0">
            <Link to="/lead/$id" params={{ id: leadId }}>
              Abrir <ExternalLink className="h-3 w-3" />
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {lead.priority && (
            <Badge
              variant="outline"
              style={{ borderColor: PRIORITY_COLOR[lead.priority], color: PRIORITY_COLOR[lead.priority] }}
              className="text-[10px]"
            >
              {PRIORITY_LABEL[lead.priority]} · {lead.score ?? 0} pts
            </Badge>
          )}
          {lead.lead_type && (
            <Badge
              variant="outline"
              style={{
                borderColor: LEAD_TYPE_COLOR[lead.lead_type as LeadType],
                color: LEAD_TYPE_COLOR[lead.lead_type as LeadType],
              }}
              className="text-[10px]"
            >
              {LEAD_TYPE_LABEL[lead.lead_type as LeadType]}
            </Badge>
          )}
          {lead.demo_free && (
            <Badge variant="outline" className="text-[10px] border-emerald-500/60 text-emerald-600 dark:text-emerald-400">
              Demo Free
            </Badge>
          )}
        </div>
      </div>

      <Section title="Etapa">
        <Select
          value={lead.stage_id ?? ""}
          onValueChange={(v) => update.mutate({ stage_id: v, stage_entered_at: new Date().toISOString() })}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Etapa" /></SelectTrigger>
          <SelectContent>
            {data.stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>

      <Section title="Responsável">
        <Select
          value={lead.assigned_to ?? "__none"}
          onValueChange={(v) => update.mutate({ assigned_to: v === "__none" ? null : v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Sem responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— Sem responsável —</SelectItem>
            {data.profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.email ?? p.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {owner && (
          <p className="text-[10px] text-muted-foreground">Atual: {owner.full_name ?? owner.email}</p>
        )}
      </Section>

      <Section title="Tags">
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Tipo de lead</p>
          <Select
            value={lead.lead_type ?? "__none"}
            onValueChange={(v) => update.mutate({ lead_type: v === "__none" ? null : v })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— Não definido —</SelectItem>
              <SelectItem value="consultoria">Consultoria</SelectItem>
              <SelectItem value="empresa">Empresa</SelectItem>
              <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-1">Demo Free</p>
          <Select
            value={lead.demo_free === null || lead.demo_free === undefined ? "__none" : lead.demo_free ? "yes" : "no"}
            onValueChange={(v) => update.mutate({ demo_free: v === "__none" ? null : v === "yes" })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— Não informado —</SelectItem>
              <SelectItem value="yes">Sim</SelectItem>
              <SelectItem value="no">Não</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isLost && (
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Motivo de descarte</p>
            <Select
              value={
                !lead.lost_reason
                  ? "__none"
                  : LOST_PRESETS.includes(lead.lost_reason)
                    ? lead.lost_reason
                    : "__custom"
              }
              onValueChange={(v) => {
                if (v === "__none") update.mutate({ lost_reason: null });
                else if (v !== "__custom") update.mutate({ lost_reason: v });
              }}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Sem motivo —</SelectItem>
                {LOST_PRESETS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
                <SelectItem value="__custom">Outro…</SelectItem>
              </SelectContent>
            </Select>
            {lead.lost_reason && !LOST_PRESETS.includes(lead.lost_reason) && (
              <EditableField
                value={lead.lost_reason}
                onSave={(v) => update.mutate({ lost_reason: v || null })}
              />
            )}
          </div>
        )}
      </Section>

      <Section title="Contato">
        <EditableField icon={User} label="Nome" value={lead.name} onSave={(v) => update.mutate({ name: v })} />
        <EditableField icon={Mail} label="Email" value={lead.email} onSave={(v) => update.mutate({ email: v || null })} />
        <EditableField icon={Phone} label="Telefone" value={lead.phone} onSave={(v) => update.mutate({ phone: v || null })} />
        <EditableField label="Cargo" value={lead.position} onSave={(v) => update.mutate({ position: v || null })} />
        <EditableField icon={Linkedin} label="LinkedIn" value={lead.linkedin_url} onSave={(v) => update.mutate({ linkedin_url: v || null })} />
      </Section>

      <Section title="Empresa">
        <EditableField icon={Building2} label="Empresa" value={lead.company_name} onSave={(v) => update.mutate({ company_name: v || null })} />
        <EditableField icon={Globe} label="Site" value={lead.company_website} onSave={(v) => update.mutate({ company_website: v || null })} />
        <EditableField icon={Linkedin} label="LinkedIn empresa" value={lead.company_linkedin} onSave={(v) => update.mutate({ company_linkedin: v || null })} />
        <EditableField label="Área" value={lead.company_segment} onSave={(v) => update.mutate({ company_segment: v || null })} />
        <EditableField label="Tamanho" value={lead.company_size} onSave={(v) => update.mutate({ company_size: v || null })} />
      </Section>

      {lastNote && (
        <Section title="Última observação">
          <p className="text-xs whitespace-pre-wrap text-muted-foreground line-clamp-6">
            {lastNote.content}
          </p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            {new Date(lastNote.created_at).toLocaleString("pt-BR")}
          </p>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EditableField({
  icon: Icon,
  label,
  value,
  onSave,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label?: string;
  value: string | null | undefined;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value ?? "");
  useEffect(() => { setV(value ?? ""); }, [value]);
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-2" />}
      <div className="flex-1 min-w-0">
        {label && <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>}
        <Input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => { if (v !== (value ?? "")) onSave(v); }}
          className="h-7 text-xs"
          placeholder="—"
        />
      </div>
    </div>
  );
}