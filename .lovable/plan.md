# Filtro "Demo Free" no Kanban

Adicionar mais um filtro na barra de filtros do Kanban (`src/routes/_app.kanban.tsx`), no mesmo padrão dos filtros existentes (Prioridade, Porte, Responsável).

## Mudanças

1. **Estado**: novo `useState<string>("all")` chamado `demoFree` com opções:
   - `all` → Todos (padrão)
   - `sim` → Apenas leads com `demo_free === true`
   - `nao` → Apenas leads com `demo_free === false`
   - `nd` → Não informado (`demo_free == null`)

2. **Filtro**: dentro do `data.leads.filter(...)` (linha 185), adicionar:
   ```ts
   if (demoFree === "sim" && l.demo_free !== true) return false;
   if (demoFree === "nao" && l.demo_free !== false) return false;
   if (demoFree === "nd" && l.demo_free != null) return false;
   ```

3. **UI**: novo `<select>` na barra de filtros (próximo ao de Responsável), com as 4 opções acima.

## Fora de escopo

- Persistir filtro em URL/search params.
- Mudar visual do badge no card (já existe).
- Filtrar por demo_free em outras telas (dashboard etc.).

## Arquivos

- `src/routes/_app.kanban.tsx`
