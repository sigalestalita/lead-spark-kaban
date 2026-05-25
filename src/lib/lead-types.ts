import type { Database } from "@/integrations/supabase/types";

export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type Stage = Database["public"]["Tables"]["stages"]["Row"];
export type IcpConfig = Database["public"]["Tables"]["icp_config"]["Row"];
export type LeadNote = Database["public"]["Tables"]["lead_notes"]["Row"];
export type LeadInteraction = Database["public"]["Tables"]["lead_interactions"]["Row"];

export const PRIORITY_LABEL: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
  fora_icp: "Fora de ICP",
  pendente: "Pendente",
};

export const PRIORITY_COLOR: Record<string, string> = {
  alta: "var(--priority-alta)",
  media: "var(--priority-media)",
  baixa: "var(--priority-baixa)",
  fora_icp: "var(--priority-fora)",
  pendente: "var(--muted-foreground)",
};