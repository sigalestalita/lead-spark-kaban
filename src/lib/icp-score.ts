import type { Lead } from "./lead-types";

export interface IcpRules {
  weights?: {
    b2b?: number;
    size?: number;
    segment?: number;
    position?: number;
    campaign?: number;
    intent?: number;
  };
  target_segments?: string[];
  target_sizes?: string[];
  target_positions?: string[];
  target_campaigns?: string[];
}

export interface IcpThresholds {
  high: number;
  medium: number;
  low: number;
}

export type Priority = "alta" | "media" | "baixa" | "fora_icp" | "pendente";

const FREE_EMAIL_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "live.com",
  "uol.com.br",
  "bol.com.br",
];

function includesAny(haystack: string | null | undefined, needles: string[]): boolean {
  if (!haystack) return false;
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n.toLowerCase()));
}

export interface ScoreResult {
  score: number;
  priority: Priority;
  signals: { key: string; label: string; matched: boolean }[];
}

export function calculateScore(
  lead: Partial<Lead>,
  rules: IcpRules,
  thresholds: IcpThresholds
): ScoreResult {
  const w = {
    b2b: 20,
    size: 20,
    segment: 15,
    position: 15,
    campaign: 10,
    intent: 20,
    ...(rules.weights ?? {}),
  };

  const signals: ScoreResult["signals"] = [];
  let score = 0;

  // B2B: email corporativo (não é domínio gratuito)
  const domain = (lead.email ?? "").split("@")[1]?.toLowerCase();
  const b2b = !!domain && !FREE_EMAIL_DOMAINS.includes(domain);
  signals.push({ key: "b2b", label: "Email corporativo", matched: b2b });
  if (b2b) score += w.b2b;

  // Size
  const sizeMatch = !!lead.company_size && (rules.target_sizes ?? []).includes(lead.company_size);
  signals.push({ key: "size", label: "Tamanho da empresa aderente", matched: sizeMatch });
  if (sizeMatch) score += w.size;

  // Segment
  const segMatch = includesAny(lead.company_segment, rules.target_segments ?? []);
  signals.push({ key: "segment", label: "Segmento aderente", matched: segMatch });
  if (segMatch) score += w.segment;

  // Position
  const posMatch = includesAny(lead.position, rules.target_positions ?? []);
  signals.push({ key: "position", label: "Cargo decisor", matched: posMatch });
  if (posMatch) score += w.position;

  // Campaign
  const campMatch =
    (rules.target_campaigns?.length ?? 0) > 0 &&
    includesAny(lead.campaign, rules.target_campaigns ?? []);
  signals.push({ key: "campaign", label: "Campanha prioritária", matched: campMatch });
  if (campMatch) score += w.campaign;

  // Intent — heurística simples sobre payload
  const payloadText = JSON.stringify(lead.form_payload ?? {}).toLowerCase();
  const intentMatch = /demo|orçamento|reuniao|reunião|urgente|implementar|comprar|teste/.test(
    payloadText
  );
  signals.push({ key: "intent", label: "Intenção declarada no formulário", matched: intentMatch });
  if (intentMatch) score += w.intent;

  let priority: Priority;
  if (score >= thresholds.high) priority = "alta";
  else if (score >= thresholds.medium) priority = "media";
  else if (score >= thresholds.low) priority = "baixa";
  else priority = "fora_icp";

  return { score, priority, signals };
}