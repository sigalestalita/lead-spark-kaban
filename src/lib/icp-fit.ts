import type { Lead } from "./lead-types";

const SENIOR_KEYWORDS = [
  "tomador de decisão",
  "tomador de decisao",
  "decisor",
  "analista",
  "gerente",
  "coordenador",
  "coordenadora",
  "ceo",
  "diretor",
  "diretora",
  "head",
  "supervisor",
  "supervisora",
  "presidente",
  "vp",
  "c-level",
  "cto",
  "cfo",
  "coo",
  "cmo",
  "chro",
  "founder",
  "owner",
  "sócio",
  "socio",
  "hrbp",
  "business partner",
];

const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "yahoo.com.br",
  "hotmail.com",
  "hotmail.com.br",
  "outlook.com",
  "outlook.com.br",
  "live.com",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
  "icloud.com",
  "me.com",
  "msn.com",
  "ig.com.br",
  "proton.me",
  "protonmail.com",
  "globo.com",
  "r7.com",
]);

export type IcpFit = {
  seniorPosition: boolean;
  bigCompany: boolean;
  corporateEmail: boolean;
  score: number; // 0..3
};

function parseSize(size?: string | null): number | null {
  if (!size) return null;
  const nums = size.match(/\d[\d.]*/g);
  if (!nums || nums.length === 0) return null;
  const parsed = nums.map((n) => Number(n.replace(/\./g, "")));
  return Math.max(...parsed);
}

export function evaluateIcpFit(lead: Lead): IcpFit {
  const positionRaw = (lead.position ?? "").toLowerCase();
  // Padroniza separadores para detectar "bp" como token isolado (HR BP, People BP, etc.)
  const positionTokens = positionRaw.split(/[^a-záéíóúâêôãõç]+/i).filter(Boolean);
  const seniorPosition =
    SENIOR_KEYWORDS.some((k) => positionRaw.includes(k)) || positionTokens.includes("bp");

  const sizeNum = parseSize(lead.company_size);
  const bigCompany = sizeNum != null && sizeNum >= 100;

  const email = (lead.email ?? "").toLowerCase().trim();
  const domain = email.includes("@") ? email.split("@")[1] : "";
  const corporateEmail = !!domain && !PERSONAL_DOMAINS.has(domain);

  const score =
    (seniorPosition ? 1 : 0) + (bigCompany ? 1 : 0) + (corporateEmail ? 1 : 0);

  return { seniorPosition, bigCompany, corporateEmail, score };
}