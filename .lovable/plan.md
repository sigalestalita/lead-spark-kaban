## Objetivo
Adicionar campo "Responsável pelo lead" em cada contato, preenchido com a lista de usuários cadastrados na plataforma (`profiles`).

## Contexto técnico
- A tabela `leads` já possui a coluna `assigned_to uuid` (atualmente sem uso na UI).
- `updateLead` em `src/lib/leads.functions.ts` já aceita `assigned_to` na lista de campos editáveis.
- `listKanbanData` já retorna `profiles` (id, full_name, email), e `getLeadDetail` precisa receber os profiles também.

Nenhuma migration é necessária.

## Mudanças

### 1. `src/lib/leads.functions.ts`
- Em `getLeadDetail`: incluir consulta a `profiles (id, full_name, email)` no `Promise.all` e retornar `profiles` junto.

### 2. `src/routes/_app.lead.$id.tsx`
- Adicionar um `<Select>` (componente shadcn) com label "Responsável" no card "Dados do lead".
- Opções: lista de profiles (`full_name ?? email`) + opção "— Sem responsável —".
- Valor controlado por `lead.assigned_to`; ao mudar, chama `update.mutate({ assigned_to: novoId | null })`.

### 3. `src/routes/_app.kanban.tsx` (LeadCard)
- Mostrar nome do responsável (badge pequeno) no card, usando `data.profiles` já disponível.
- Sem editor inline aqui — edição acontece na tela do lead.

## Arquivos afetados
- edit: `src/lib/leads.functions.ts`
- edit: `src/routes/_app.lead.$id.tsx`
- edit: `src/routes/_app.kanban.tsx`
