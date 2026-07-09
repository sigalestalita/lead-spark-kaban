import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTemplates } from "@/lib/whatsapp-templates.functions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquareText } from "lucide-react";

type HsmTemplatePickerProps = {
  onSend: (templateId: string) => void;
  sending?: boolean;
  title?: string;
  description?: string;
};

export function HsmTemplatePicker({
  onSend,
  sending = false,
  title = "Disparar HSM de abordagem",
  description = "A janela de 24h está fechada. Escolha um template aprovado para iniciar ou retomar o contato.",
}: HsmTemplatePickerProps) {
  const listFn = useServerFn(listTemplates);
  const { data, isLoading } = useQuery({
    queryKey: ["wa-templates-hsm-picker"],
    queryFn: () => listFn(),
  });

  const templates = useMemo(
    () =>
      (data?.templates ?? []).filter(
        (template) => template.status === "approved" && !!template.provider_template_name,
      ),
    [data?.templates],
  );

  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  useEffect(() => {
    if (!templates.length) {
      setSelectedTemplateId("");
      return;
    }
    if (!selectedTemplateId || !templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [selectedTemplateId, templates]);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;

  return (
    <div className="space-y-3 rounded-md border border-white/10 bg-background/60 p-3">
      <div className="flex items-start gap-2">
        <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando templates aprovados…
        </div>
      ) : templates.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum template HSM aprovado disponível para disparo.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger className="h-9 text-xs sm:flex-1">
                <SelectValue placeholder="Selecione o template HSM" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              onClick={() => selectedTemplateId && onSend(selectedTemplateId)}
              disabled={sending || !selectedTemplateId}
              className="sm:shrink-0"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disparar HSM"}
            </Button>
          </div>

          {selectedTemplate && (
            <div className="space-y-2 rounded-md border border-white/10 bg-muted/20 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium">{selectedTemplate.name}</p>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  {selectedTemplate.language ?? "pt_BR"}
                </Badge>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  {selectedTemplate.category}
                </Badge>
              </div>
              <p className="text-xs whitespace-pre-wrap text-muted-foreground">
                {selectedTemplate.body}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}