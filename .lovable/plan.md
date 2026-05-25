## Objetivo

Expandir o enriquecimento por IA para preencher também:
- `linkedin_url` (perfil pessoal do lead)
- `company_website` (site da empresa)
- `company_linkedin` (página da empresa no LinkedIn)

Hoje o `enrichLead` em `src/lib/ai.functions.ts` só gera `company_summary`, `company_segment`, `company_size` e `probable_pain`. Esses três campos novos ficam vazios.

## Estratégia

A IA sozinha (Gemini/GPT) **não navega na web** — se eu só pedir esses links no tool schema, ela vai inventar URLs. Para resolver de verdade preciso combinar duas coisas:

1. **Busca real com Firecrawl** (já temos como connector padrão neste stack): faço 1-3 buscas direcionadas usando nome + empresa + cargo, e passo os resultados para a IA escolher a URL correta.
2. **IA como classificador**: recebe os resultados da busca e retorna apenas URLs que aparecem nos resultados, com `confidence` por campo. Se a confiança for baixa, não grava (evita lixo).

## Mudanças

### 1. Ativar connector Firecrawl
Pedir ao usuário para conectar o Firecrawl (single click). Sem ele, faço fallback: a IA tenta inferir só a partir do domínio do email da empresa (ex.: `joao@acme.com` → `https://acme.com`) — útil mas limitado.

### 2. `src/lib/ai.functions.ts` — refatorar `enrichLead`
- Antes de chamar a IA, fazer até 3 buscas Firecrawl:
  - `"{nome} {empresa} site:linkedin.com/in"` → candidatos a `linkedin_url`
  - `"{empresa} site:linkedin.com/company"` → candidatos a `company_linkedin`
  - `"{empresa} site oficial"` (filtrando linkedin/facebook) → candidatos a `company_website`
- Passar top 5 resultados de cada busca como contexto para a IA.
- Expandir o tool schema com:
  - `linkedin_url: string | null`
  - `company_website: string | null`
  - `company_linkedin: string | null`
  - `links_confidence: { linkedin_url, company_website, company_linkedin } com "alta"/"media"/"baixa"/"nenhum"`
- Regras de gravação no `update`:
  - Só preencher campo se `confidence !== "baixa"` E `!== "nenhum"` E o lead ainda não tiver valor manual.
  - Validar formato (`new URL(...)`) antes de gravar — descartar se não for URL válida.
- Logar em `lead_interactions` (tipo `enrichment`) quais links foram encontrados e descartados.

### 3. UI no detalhe do lead (`src/routes/_app.lead.$id.tsx`)
- Onde já mostro os campos da empresa, garantir que os três links apareçam como **link clicável** (ícone externo) quando preenchidos.
- Se vazios após enriquecimento, mostrar "—" (já é o padrão hoje, só validar).

### 4. Fallback sem Firecrawl
Se `FIRECRAWL_API_KEY` não estiver definido:
- Pular a busca, chamar IA só com contexto local + domínio do email.
- A IA pode sugerir `company_website` baseado no domínio do email (ex.: email `@empresa.com.br` → `https://empresa.com.br`), mas `linkedin_url` e `company_linkedin` ficam null.

## Detalhes técnicos

- Firecrawl chamado **dentro do `.handler()`** via `@mendable/firecrawl-js` (SDK v2), nunca no client. `FIRECRAWL_API_KEY` lido de `process.env`.
- Usar modelo `google/gemini-3-flash-preview` (já em uso) — barato e suficiente para essa classificação.
- Não criar tabela nova: os campos já existem em `leads`.
- Sem mudança de schema, sem migration.

## Fora de escopo

- Não vou scrapear o conteúdo do LinkedIn (LinkedIn bloqueia bots e o Firecrawl não é confiável lá).
- Não vou tentar achar telefone — campo `phone` continua manual.
- Não vou mexer no fluxo do Claude/RD (continua como está).

## Pergunta antes de seguir

Posso pedir para você conectar o **Firecrawl** (connector padrão da Lovable, gratuito até certo volume) para que a busca funcione de verdade? Sem ele, só consigo o `company_website` aproximado pelo domínio do email.
