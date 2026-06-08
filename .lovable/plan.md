## Objetivo
Adicionar o campo **Tipo do lead** (`lead_type`) — Consultoria, Empresa ou Pessoa Física — visível e editável em "Dados do lead" e exibido como badge colorido no card do Kanban. Cada tipo terá uma cor única.

## Contexto técnico
- Hoje o tipo só existe dentro de `leads.form_payload->>lead_type` como texto cru ("Sou consultor", "sou_de_empresa", etc.). Não há coluna própria, então não dá pra editar/normalizar/colorir.
- A coluna `assigned_to` já passou pelo mesmo padrão (allowed key em `updateLead`, exposta na detail page) — vamos seguir o mesmo padrão.

## Mudanças

### 1. Migration — nova coluna `lead_type`
- Adicionar `lead_type text` em `public.leads` com CHECK em (`consultoria`, `empresa`, `pessoa_fisica`).
- **Backfill** a partir de `form_payload->>'lead_type'` usando este mapeamento (case-insensitive, trim):
  - `consultoria` ← "Sou consultor", "Atuo em uma consultoria", variações com "consultor"
  - `empresa` ← "Sou de empresa", "sou_de_empresa", "Atuo em uma empresa", variações com "empresa"
  - `pessoa_fisica` ← "Sou pessoa física" / "fisica"
- Index simples em `lead_type` para filtros futuros.

### 2. Helper `src/lib/lead-type.ts` (novo)
- `normalizeLeadType(raw: string | null): "consultoria" | "empresa" | "pessoa_fisica" | null` — mesma regra do backfill, reutilizada na ingestão.
- `LEAD_TYPE_LABEL` e `LEAD_TYPE_COLOR` (uma cor por tipo, mesmo formato dos tokens `--priority-*`).

### 3. Ingestão — `src/lib/sheets.functions.ts`
- No `mapRowToStaging` e/ou no insert final em `leads`, calcular `lead_type = normalizeLeadType(row[C.tipo])` e gravar na nova coluna (mantendo também o valor cru em `form_payload` para auditoria).

### 4. Server fn — `src/lib/leads.functions.ts`
- Em `updateLead`, adicionar `"lead_type"` à lista `allowedKeys`.

### 5. Tela do lead — `src/routes/_app.lead.$id.tsx`
- No card "Dados do lead", adicionar `<Select>` "Tipo do lead" com as 3 opções + "— Não definido —", controlado por `lead.lead_type`; chama `update.mutate({ lead_type: novo })`.
- Ao lado do select, mostrar o badge colorido (mesmo estilo do badge de prioridade) usando `LEAD_TYPE_COLOR`.

### 6. Card do Kanban — `src/routes/_app.kanban.tsx`
- Em `LeadCard`, ao lado do badge de prioridade (mesma linha), renderizar um badge colorido com `LEAD_TYPE_LABEL[lead.lead_type]` quando existir. Mesma altura/tipografia do badge atual de prioridade.

### Tokens de cor
Adicionar em `src/styles.css` três variáveis dedicadas (ex.: `--lead-type-consultoria`, `--lead-type-empresa`, `--lead-type-pessoa-fisica`) com cores distintas entre si e do conjunto de prioridade.

## Arquivos afetados
- new migration: adiciona coluna + backfill
- new: `src/lib/lead-type.ts`
- edit: `src/styles.css`
- edit: `src/lib/sheets.functions.ts`
- edit: `src/lib/leads.functions.ts`
- edit: `src/routes/_app.lead.$id.tsx`
- edit: `src/routes/_app.kanban.tsx`

## Fora de escopo
- Filtro do Kanban por `lead_type` (pode ser feito depois).
- Reprocessamento histórico além do backfill SQL inicial.