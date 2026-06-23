import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getLeadDetail } from "@/lib/leads.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PRIORITY_LABEL, PRIORITY_COLOR } from "@/lib/lead-types";
import { LEAD_TYPE_LABEL, LEAD_TYPE_COLOR, type LeadType } from "@/lib/lead-type";
import { Building2, Globe, Linkedin, Mail, Phone, ExternalLink, User } from "lucide-react";

export function LeadSidePanel({ leadId }: { leadId: string }) {
  const fn = useServerFn(getLeadDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => fn({ data: { id: leadId } }),
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
          {stage && (
            <Badge variant="outline" className="text-[10px]">{stage.name}</Badge>
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
        </div>
      </div>

      <Section title="Contato">
        <Row icon={Mail} value={lead.email} />
        <Row icon={Phone} value={lead.phone} />
        <Row
          icon={Linkedin}
          value={lead.linkedin_url}
          href={lead.linkedin_url ?? undefined}
          label="LinkedIn pessoal"
        />
      </Section>

      <Section title="Empresa">
        <Row icon={Building2} value={lead.company_name} />
        <Row icon={Globe} value={lead.company_website} href={lead.company_website ?? undefined} />
        <Row
          icon={Linkedin}
          value={lead.company_linkedin}
          href={lead.company_linkedin ?? undefined}
          label="LinkedIn empresa"
        />
        {(lead.company_segment || lead.company_size) && (
          <p className="text-xs text-muted-foreground">
            {lead.company_segment}
            {lead.company_segment && lead.company_size ? " · " : ""}
            {lead.company_size}
          </p>
        )}
      </Section>

      <Section title="Atribuição">
        <Row icon={User} value={owner?.full_name ?? owner?.email ?? "Sem responsável"} />
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
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  icon: Icon,
  value,
  href,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string | null | undefined;
  href?: string;
  label?: string;
}) {
  if (!value) return null;
  const content = (
    <span className="truncate" title={label ?? value}>
      {value}
    </span>
  );
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline truncate"
        >
          {value}
        </a>
      ) : (
        content
      )}
    </div>
  );
}