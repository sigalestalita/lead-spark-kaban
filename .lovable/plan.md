# Plano: campo "Demo Free" no lead

## 1. Banco

Migração adicionando coluna `demo_free boolean` (nullable) em `public.leads`. Sem default — `null` significa "não informado".

## 2. Ingestão da planilha (`src/lib/sheets.functions.ts`)

- Adicionar `demo_free: 12` no mapa `C` (coluna M = índice 12).
- Helper `parseDemoFree(v)`: `true` para `sim/yes/true/1/x`, `false` para `não/nao/no/false/0`, `null` caso vazio.
- No `rowToLead`, incluir `demo_free` no `payload` e também guardar o valor bruto em `form_payload.demo_free_raw`.
- No `INSERT` do chunk, gravar `demo_free`.

## 3. Backfill dos leads já importados

Nova server fn `backfillDemoFreeFromSheet` (autenticada, role admin ou super_admin):

- Busca a planilha (mesma rotina `fetchSheetRows`).
- Para cada linha com `demo_free` não-nulo, faz `UPDATE leads SET demo_free = $1 WHERE form_payload->>'lead_id' = $2 AND demo_free IS DISTINCT FROM $1`.
- Retorna `{ updated, scanned }`.
- Disparada uma vez automaticamente após o deploy via botão na tela de Configurações (ou simplesmente invocada uma vez via `invoke-server-function` após o merge — opção mais simples e sem UI nova). **Vou seguir a opção sem UI nova:** após aprovado, chamo a fn uma vez via tool de invocação.

## 4. UI

### Card do Kanban (`src/routes/_app.kanban.tsx`)

Quando `lead.demo_free === true`, mostrar um badge verde compacto "Demo Free" logo abaixo do nome/tipo, antes da empresa.

### Detalhe do lead (`src/routes/_app.lead.$id.tsx`)

- Em "Dados do Lead" (bloco com tipo de lead), adicionar linha **Demo Free** com `Select` (Sim / Não / Não informado), salvando via `update.mutate({ demo_free: ... })`.
- Incluir `"demo_free"` em `allowedKeys` de `updateLead` (`src/lib/leads.functions.ts`).

## 5. Fora de escopo

- Filtro do Kanban por "tem demo free".

## Arquivos

- nova migração SQL
- `src/lib/sheets.functions.ts`
- nova `src/lib/leads-backfill.functions.ts` (ou anexar em `sheets.functions.ts`)
- `src/lib/leads.functions.ts`
- `src/routes/_app.kanban.tsx`
- `src/routes/_app.lead.$id.tsx`