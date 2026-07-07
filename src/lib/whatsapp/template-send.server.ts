import { fetchMetaTemplateDetails } from "./meta-templates.server";

type AccountForTemplateLookup = {
  access_token: string;
  provider_base_url?: string | null;
};

type LeadForTemplateParams = {
  name?: string | null;
  company_name?: string | null;
};

type ResolveTemplateParamsInput = {
  account: AccountForTemplateLookup;
  metaTemplateId?: string | null;
  storedVariables?: unknown;
  lead?: LeadForTemplateParams | null;
};

type ResolvedTemplateParams = {
  headerParams: string[];
  bodyParams: string[];
};

function extractPlaceholderCount(text?: string | null) {
  if (!text) return 0;
  const matches = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)];
  if (matches.length === 0) return 0;
  return matches.reduce((max, match) => Math.max(max, Number(match[1] ?? 0)), 0);
}

function leadValueMap(lead?: LeadForTemplateParams | null): Record<string, string> {
  const fullName = lead?.name?.trim() ?? "";
  const firstName = fullName.split(/\s+/).filter(Boolean)[0] ?? "";
  const company = lead?.company_name?.trim() ?? "";

  return {
    nome: fullName,
    primeiro_nome: firstName,
    empresa: company,
  };
}

function normalizeParamValues(values: string[], expectedCount: number, fallbacks: string[]) {
  if (expectedCount <= 0) return [];

  const normalized = values.slice(0, expectedCount);
  let fallbackIndex = 0;

  while (normalized.length < expectedCount) {
    const next = fallbacks[fallbackIndex] ?? " ";
    normalized.push(next || " ");
    fallbackIndex += 1;
  }

  return normalized.map((value) => value || " ");
}

export async function resolveTemplateSendParams(input: ResolveTemplateParamsInput): Promise<ResolvedTemplateParams> {
  const namedValues = leadValueMap(input.lead);
  const storedVariables = Array.isArray(input.storedVariables) ? input.storedVariables.map(String) : [];
  const orderedStoredValues = storedVariables.map((name) => namedValues[name] ?? " ");
  const genericFallbacks = [namedValues.primeiro_nome, namedValues.nome, namedValues.empresa, " "];

  let headerCount = 0;
  let bodyCount = storedVariables.length;

  if (input.metaTemplateId) {
    const details = await fetchMetaTemplateDetails(input.account, input.metaTemplateId);
    for (const component of details.components ?? []) {
      const type = String(component.type ?? "").toUpperCase();
      if (type === "HEADER" && String(component.format ?? "").toUpperCase() === "TEXT") {
        headerCount = extractPlaceholderCount(component.text);
      }
      if (type === "BODY") {
        bodyCount = extractPlaceholderCount(component.text);
      }
    }
  }

  const headerParams = normalizeParamValues(genericFallbacks, headerCount, genericFallbacks);
  const bodyParams = normalizeParamValues(orderedStoredValues, bodyCount, genericFallbacks);

  return { headerParams, bodyParams };
}