## Objetivo
Adicionar filtro por **Responsável** (`assigned_to`) na tela do Kanban, ao lado dos filtros já existentes (prioridade, porte, data).

## Mudanças

### `src/routes/_app.kanban.tsx`
1. Novo estado `const [assigned, setAssigned] = useState<string>("all")`.
2. Novo `<select>` na barra de filtros (mesmo estilo dos de prioridade/porte) com opções:
   - "Todos responsáveis" (`all`)
   - "Sem responsável" (`none`) → filtra `assigned_to == null`
   - Uma opção por usuário em `data.profiles`, mostrando `full_name || email`, value = `profile.id`
3. No `data.leads.filter(...)`, adicionar:
   - `if (assigned === "none" && l.assigned_to) return false;`
   - `if (assigned !== "all" && assigned !== "none" && l.assigned_to !== assigned) return false;`
4. Lista de responsáveis derivada apenas de profiles que aparecem em pelo menos um lead (para não poluir com usuários sem leads). Ordenada por nome.

## Fora de escopo
- Persistir filtro em URL/search params.
- Filtro multi-seleção.
- Aplicar o mesmo filtro em outras telas (dashboard).

## Arquivos afetados
- edit: `src/routes/_app.kanban.tsx`
