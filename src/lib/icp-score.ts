import type { Lead } from "./lead-types";
import { evaluateIcpFit } from "./icp-fit";

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

export interface ScoreResult {
  score: number;
  priority: Priority;
  signals: { key: string; label: string; matched: boolean }[];
}

/**
 * Scoring simplificado — 3 sinais binários (compartilhados com `evaluateIcpFit`):
 *  1. Cargo decisor (gerente/coordenador/supervisor/diretor/CEO/HRBP/BP/etc.)
 *  2. Email corporativo (qualquer domínio não-pessoal)
 *  3. Empresa com >100 funcionários
 *
 * Cada sinal vale ~33pts. Prioridade pela quantidade de sinais batidos:
 *  3/3 → alta · 2/3 → média · 1/3 → baixa · 0/3 → fora_icp.
 *
 * Os parâmetros `rules`/`thresholds` são aceitos por compatibilidade mas ignorados.
 */
export function calculateScore(
  lead: Partial<Lead>,
  _rules?: IcpRules,
  _thresholds?: IcpThresholds
): ScoreResult {
  const fit = evaluateIcpFit(lead as Lead);
  const signals: ScoreResult["signals"] = [
    { key: "position", label: "Cargo decisor", matched: fit.seniorPosition },
    { key: "b2b", label: "Email corporativo", matched: fit.corporateEmail },
    { key: "size", label: "Empresa com mais de 100 funcionários", matched: fit.bigCompany },
  ];
  const matched = signals.filter((s) => s.matched).length;
  // 1 sinal = 33, 2 = 66, 3 = 100
  const score = matched === 3 ? 100 : matched * 33;
  let priority: Priority;
  if (matched === 3) priority = "alta";
  else if (matched === 2) priority = "media";
  else if (matched === 1) priority = "baixa";
  else priority = "fora_icp";
  return { score, priority, signals };
}