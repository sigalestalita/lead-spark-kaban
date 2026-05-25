import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

async function callAI(messages: { role: string; content: string }[], tool?: unknown) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY não configurado");
  const body: Record<string, unknown> = { model: MODEL, messages };
  if (tool) {
    body.tools = [tool];
    body.tool_choice = { type: "function", function: { name: (tool as { function: { name: string } }).function.name } };
  }
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("Rate limit atingido. Tente novamente em alguns segundos.");
  if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos em Settings → Workspace → Usage.");
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Tipo simplificado de resultado de busca usado pela IA. */
type SearchHit = { url: string; title?: string; description?: string };

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function normalizeFirecrawlResults(raw: unknown): SearchHit[] {
  if (!raw) return [];
  // SDK v2 retorna { web: [...] } ou array direto dependendo da versão
  const r = raw as { web?: unknown[]; data?: unknown[] } | unknown[];
  const arr: unknown[] = Array.isArray(r)
    ? r
    : Array.isArray(r.web)
      ? r.web
      : Array.isArray(r.data)
        ? r.data
        : [];
  return arr
    .map((item) => {
      const it = item as { url?: string; title?: string; description?: string };
      return { url: it.url ?? "", title: it.title, description: it.description };
    })
    .filter((h) => !!h.url)
    .slice(0, 5);
}

async function firecrawlSearch(query: string): Promise<SearchHit[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return [];
  try {
    const { default: Firecrawl } = await import("@mendable/firecrawl-js");
    const fc = new Firecrawl({ apiKey: key });
    const res = await fc.search(query, { limit: 5, location: "Brazil" });
    const hits = normalizeFirecrawlResults(res);
    console.log(`[firecrawl] "${query}" → ${hits.length} hits`, hits.map((h) => h.url));
    return hits;
  } catch (e) {
    console.error("[firecrawl] busca falhou", e);
    return [];
  }
}

/** Scrape um perfil de LinkedIn e devolve texto/markdown bruto + descrição (subtítulo) para a IA extrair a empresa atual. */
async function firecrawlScrapeLinkedIn(url: string): Promise<{ markdown: string; description?: string } | null> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;
  try {
    const { default: Firecrawl } = await import("@mendable/firecrawl-js");
    const fc = new Firecrawl({ apiKey: key });
    const res = await fc.scrape(url, { formats: ["markdown"], onlyMainContent: true });
    const r = res as { markdown?: string; metadata?: { description?: string; title?: string }; data?: { markdown?: string; metadata?: { description?: string } } };
    const markdown = (r.markdown ?? r.data?.markdown ?? "").slice(0, 4000);
    const description = r.metadata?.description ?? r.data?.metadata?.description;
    console.log(`[firecrawl] scrape ${url} → md=${markdown.length} chars, desc=${description?.slice(0, 80) ?? "—"}`);
    if (!markdown && !description) return null;
    return { markdown, description };
  } catch (e) {
    console.error("[firecrawl] scrape linkedin falhou", e);
    return null;
  }
}

/** Enriquecimento via IA — gera resumo, segmento, dor provável a partir dos dados existentes. */
export const enrichLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: lead } = await supabase.from("leads").select("*").eq("id", data.id).maybeSingle();
    if (!lead) throw new Error("Lead não encontrado");

    // 1) Buscas Firecrawl para descobrir URLs reais (linkedin pessoal, linkedin empresa, site)
    const company = (lead.company_name ?? "").trim();
    const person = (lead.name ?? "").trim();
    const [linkedinHits, companyLinkedinHits, websiteHits] = await Promise.all([
      company && person
        ? firecrawlSearch(`${person} ${company} site:linkedin.com/in`)
        : Promise.resolve([] as SearchHit[]),
      company
        ? firecrawlSearch(`"${company}" linkedin empresa`)
        : Promise.resolve([] as SearchHit[]),
      company
        ? firecrawlSearch(`"${company}" -site:linkedin.com -site:facebook.com -site:instagram.com`)
        : Promise.resolve([] as SearchHit[]),
    ]);

    // Fallback de site via domínio do email corporativo
    const emailDomain = (() => {
      const m = (lead.email ?? "").match(/@([\w.-]+)$/);
      if (!m) return null;
      const dom = m[1].toLowerCase();
      const free = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br", "icloud.com", "live.com", "uol.com.br", "bol.com.br"];
      return free.includes(dom) ? null : dom;
    })();

    const tool = {
      type: "function",
      function: {
        name: "enrich_lead",
        description: "Sugere campos de enriquecimento da empresa e do lead a partir do contexto disponível.",
        parameters: {
          type: "object",
          properties: {
            company_summary: { type: "string", description: "Resumo de 1-2 frases sobre a empresa" },
            company_segment: { type: "string", description: "Segmento estimado (ex.: SaaS B2B, Indústria, Educação)" },
            company_size: { type: "string", enum: ["1-10", "11-50", "51-200", "201-500", "500+", "desconhecido"] },
            probable_pain: { type: "string", description: "Dor provável que justifica a busca por SDR/comercial" },
            confidence: { type: "string", enum: ["alta", "media", "baixa"] },
            linkedin_url: {
              type: ["string", "null"],
              description: "URL do perfil pessoal do lead no LinkedIn (linkedin.com/in/...). Use null se não houver match confiável nos resultados de busca.",
            },
            company_linkedin: {
              type: ["string", "null"],
              description: "URL da página da empresa no LinkedIn (linkedin.com/company/...). Use null se não houver match confiável.",
            },
            company_website: {
              type: ["string", "null"],
              description: "URL do site oficial da empresa. Use null se incerto. Prefira domínio raiz (ex.: https://empresa.com).",
            },
            current_company_from_linkedin: {
              type: ["string", "null"],
              description: "Nome da EMPRESA ATUAL do lead conforme aparece no perfil do LinkedIn (campo linkedin_profile_scrape). NUNCA invente: use só se aparecer no scrape. Null se não conseguir identificar com clareza ou se o scrape estiver vazio/bloqueado.",
            },
            links_confidence: {
              type: "object",
              properties: {
                linkedin_url: { type: "string", enum: ["alta", "media", "baixa", "nenhum"] },
                company_linkedin: { type: "string", enum: ["alta", "media", "baixa", "nenhum"] },
                company_website: { type: "string", enum: ["alta", "media", "baixa", "nenhum"] },
                current_company_from_linkedin: { type: "string", enum: ["alta", "media", "baixa", "nenhum"] },
              },
              required: ["linkedin_url", "company_linkedin", "company_website", "current_company_from_linkedin"],
              additionalProperties: false,
            },
          },
          required: [
            "company_summary",
            "company_segment",
            "company_size",
            "probable_pain",
            "confidence",
            "linkedin_url",
            "company_linkedin",
            "company_website",
            "current_company_from_linkedin",
            "links_confidence",
          ],
          additionalProperties: false,
        },
      },
    };

    const ctx = {
      nome: lead.name,
      email: lead.email,
      cargo: lead.position,
      empresa: lead.company_name,
      site: lead.company_website,
      segmento_atual: lead.company_segment,
      campanha: lead.campaign,
      anuncio: lead.ad_name,
      formulario: lead.form_name,
      payload: lead.form_payload,
      dominio_email_corporativo: emailDomain,
      busca_linkedin_pessoal: linkedinHits,
      busca_linkedin_empresa: companyLinkedinHits,
      busca_site_empresa: websiteHits,
    };

    // 2) Se já existe linkedin_url (manual) OU achamos um candidato com alta confiança nas buscas, tentamos fazer scrape para descobrir a empresa ATUAL do contato
    const linkedinCandidateForScrape =
      safeUrl(lead.linkedin_url) ??
      (linkedinHits[0]?.url && /linkedin\.com\/in\//i.test(linkedinHits[0].url) ? safeUrl(linkedinHits[0].url) : null);
    let linkedinScrape: { markdown: string; description?: string } | null = null;
    if (linkedinCandidateForScrape) {
      linkedinScrape = await firecrawlScrapeLinkedIn(linkedinCandidateForScrape);
    }
    (ctx as Record<string, unknown>).linkedin_profile_scrape = linkedinScrape
      ? { url: linkedinCandidateForScrape, description: linkedinScrape.description, markdown_excerpt: linkedinScrape.markdown }
      : null;
    (ctx as Record<string, unknown>).empresa_no_formulario = lead.company_name;

    const result = await callAI(
      [
        {
          role: "system",
          content:
            "Você é um analista de pré-vendas B2B. A partir do contexto fornecido produza inferências realistas e selecione URLs a partir dos resultados de busca fornecidos. REGRAS DE URL: (1) NUNCA invente URLs — escolha APENAS uma URL que aparece nos resultados de busca correspondentes (busca_linkedin_pessoal, busca_linkedin_empresa, busca_site_empresa) OU, no caso de company_website, derive do dominio_email_corporativo (https://<dominio>). (2) Nomes de empresa em formulários frequentemente têm erros de grafia, plural/singular, abreviações ou faltam letras (ex.: 'Leonfort' pode ser 'Leonforte'; 'Vivo Telefônica' = 'Vivo'). Aceite matches fuzzy razoáveis — Google também corrige automaticamente. (3) Para linkedin_url pessoal seja rigoroso: confirme nome+empresa baterem, senão null (errar perfil pessoal é pior). (4) Para company_linkedin e company_website seja PRÁTICO: se houver um resultado plausível (mesmo com pequena variação no nome ou se for o primeiro resultado orgânico que claramente é a empresa), retorne — o SDR valida com 1 clique. Descarte só agregadores óbvios (reclameaqui, glassdoor, wikipedia, indeed, jusbrasil). (5) Calibre links_confidence: 'alta' = match exato e óbvio; 'media' = match com pequena variação de nome ou 1º resultado orgânico; 'baixa' = encontrei algo plausível mas com dúvida; 'nenhum' = nada nos resultados serve. (6) Não invente CNPJ, faturamento ou número exato de funcionários. (7) EMPRESA ATUAL: o campo linkedin_profile_scrape contém o texto do perfil do LinkedIn quando disponível. Procure por seções 'Experiência'/'Experience' e identifique a posição mais RECENTE (geralmente 'o momento'/'Present' ou data final mais recente). Use APENAS o nome da empresa que aparece literalmente no scrape — preferindo o subtítulo/description do perfil quando ele exibe 'Cargo na Empresa'. Se o scrape estiver vazio (LinkedIn bloqueou), retorne null. Se a empresa atual identificada for praticamente igual à empresa_no_formulario (ignorando case, acentos, sufixos LTDA/SA), também pode retornar null para sinalizar que não há divergência.",
        },
        {
          role: "user",
          content: `Contexto do lead:\n${JSON.stringify(ctx, null, 2)}`,
        },
      ],
      tool
    );

    const call = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) throw new Error("IA não retornou estrutura esperada");
    const args = JSON.parse(call.function.arguments);

    // Aplicar links só se URL válida + confiança aceitável + lead ainda sem valor
    const lc = args.links_confidence ?? {};
    // LinkedIn pessoal: rigoroso (errar perfil de pessoa é pior). Empresa: aceita até "baixa" — SDR valida com 1 clique.
    const strict = (c: string | undefined) => c === "alta" || c === "media";
    const lenient = (c: string | undefined) => c === "alta" || c === "media" || c === "baixa";
    const newLinkedin =
      !lead.linkedin_url && strict(lc.linkedin_url) ? safeUrl(args.linkedin_url) : null;
    const newCompanyLinkedin =
      !lead.company_linkedin && lenient(lc.company_linkedin) ? safeUrl(args.company_linkedin) : null;
    const newCompanyWebsite =
      !lead.company_website && lenient(lc.company_website) ? safeUrl(args.company_website) : null;

    // Empresa atual do LinkedIn — só atualiza se nome retornado != empresa atual (case/acento/sufixo-insensitive) e confiança decente
    const norm = (s: string | null | undefined) =>
      (s ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\b(ltda|s\/?a|me|eireli|epp|inc|llc|corp|oficial)\b\.?/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const currentFromLi: string | null =
      typeof args.current_company_from_linkedin === "string" && args.current_company_from_linkedin.trim()
        ? args.current_company_from_linkedin.trim()
        : null;
    const companyChanged =
      !!currentFromLi &&
      strict(lc.current_company_from_linkedin) &&
      norm(currentFromLi) !== norm(lead.company_name);

    const patch = {
      company_summary: args.company_summary,
      company_segment: lead.company_segment || args.company_segment,
      company_size: lead.company_size || (args.company_size !== "desconhecido" ? args.company_size : lead.company_size),
      probable_pain: args.probable_pain,
      ...(newLinkedin ? { linkedin_url: newLinkedin } : {}),
      ...(newCompanyLinkedin ? { company_linkedin: newCompanyLinkedin } : {}),
      ...(newCompanyWebsite ? { company_website: newCompanyWebsite } : {}),
      ...(companyChanged
        ? {
            company_name: currentFromLi,
            // Preserva o nome original do form somente na primeira vez (não sobrescreve se já existir)
            ...(lead.original_company_name ? {} : { original_company_name: lead.company_name }),
            // Empresa mudou → limpa links/segmento/tamanho velhos para o SDR não usar dado desatualizado
            company_linkedin: newCompanyLinkedin ?? null,
            company_website: newCompanyWebsite ?? null,
            company_segment: args.company_segment ?? null,
            company_size: args.company_size && args.company_size !== "desconhecido" ? args.company_size : null,
          }
        : {}),
      enrichment_status: "found" as const,
      enriched_at: new Date().toISOString(),
    };

    await supabase.from("leads").update(patch).eq("id", data.id);
    await supabase.from("lead_interactions").insert({
      lead_id: data.id,
      author_id: userId,
      type: "enrichment",
      content: `Enriquecimento via IA (confiança ${args.confidence}). Links: linkedin=${newLinkedin ? "✓" : "—"}, empresa-linkedin=${newCompanyLinkedin ? "✓" : "—"}, site=${newCompanyWebsite ? "✓" : "—"}${companyChanged ? `. Empresa atualizada: "${lead.company_name}" → "${currentFromLi}" (form desatualizado)` : ""}`,
      metadata: {
        ...args,
        firecrawl_used: !!process.env.FIRECRAWL_API_KEY,
        applied: { linkedin_url: newLinkedin, company_linkedin: newCompanyLinkedin, company_website: newCompanyWebsite, company_name_changed: companyChanged ? { from: lead.company_name, to: currentFromLi } : null },
        linkedin_scrape_used: !!linkedinScrape,
      },
    });
    await supabase.from("integration_logs").insert({
      provider: "lovable_ai",
      action: "enrich_lead",
      status: "ok",
      detail: { lead_id: data.id, confidence: args.confidence },
    });

    return { ok: true, ...args };
  });

/** Sugere mensagem de abordagem para WhatsApp */
export const suggestApproach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: lead } = await supabase.from("leads").select("*").eq("id", data.id).maybeSingle();
    if (!lead) throw new Error("Lead não encontrado");
    const { data: tplRow } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "whatsapp_template")
      .maybeSingle();
    const template =
      ((tplRow?.value as { text?: string } | null)?.text as string | undefined) ?? "";

    const result = await callAI([
      {
        role: "system",
        content:
          "Você é um SDR experiente. Gere UMA mensagem curta de WhatsApp (3-5 frases, máx 600 caracteres) em português brasileiro, tom consultivo e humano, primeira pessoa. Sem emoji exagerado, sem parecer template. Referencie o contexto da conversão e a possível dor. Termine com uma pergunta aberta convidando a uma conversa rápida. Não use saudação genérica do tipo 'Espero que esteja bem'.",
      },
      {
        role: "user",
        content: `Lead:
- Nome: ${lead.name}
- Empresa: ${lead.company_name ?? "—"}
- Cargo: ${lead.position ?? "—"}
- Campanha/anúncio: ${lead.campaign ?? "—"} / ${lead.ad_name ?? "—"}
- Formulário: ${lead.form_name ?? "—"}
- Dor provável: ${lead.probable_pain ?? "—"}
- Resumo empresa: ${lead.company_summary ?? "—"}

Template de referência (estrutura, não copiar literal):
${template}`,
      },
    ]);

    const message = result.choices?.[0]?.message?.content?.trim() ?? "";
    await supabase.from("lead_interactions").insert({
      lead_id: data.id,
      author_id: userId,
      type: "ai_suggestion",
      content: message,
    });
    return { message };
  });