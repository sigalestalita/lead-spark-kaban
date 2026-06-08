export type LeadType = "consultoria" | "empresa" | "pessoa_fisica";

export const LEAD_TYPE_LABEL: Record<LeadType, string> = {
  consultoria: "Consultoria",
  empresa: "Empresa",
  pessoa_fisica: "Pessoa Física",
};

export const LEAD_TYPE_COLOR: Record<LeadType, string> = {
  consultoria: "var(--lead-type-consultoria)",
  empresa: "var(--lead-type-empresa)",
  pessoa_fisica: "var(--lead-type-pessoa-fisica)",
};

export function normalizeLeadType(raw: string | null | undefined): LeadType | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/consultor/.test(s)) return "consultoria";
  if (/empresa/.test(s)) return "empresa";
  if (/f[ií]sic/.test(s)) return "pessoa_fisica";
  return null;
}