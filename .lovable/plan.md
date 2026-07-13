**Objetivo**
Atualizar a importação da planilha usada no Kanban para manter `entrada_correta` como está e substituir `entrada_organico_e_outbound` por `entrada_correta_organico-outbound`, usando o novo layout de colunas informado por você.

**Plano**
1. **Trocar a guia monitorada**
   - Substituir a aba antiga `entrada_organico_e_outbound` por `entrada_correta_organico-outbound` na rotina de leitura da planilha.
   - Manter `entrada_correta` sem alteração.

2. **Separar o mapeamento por guia**
   - Ajustar a rotina para que cada aba tenha seu próprio esquema de colunas.
   - Preservar o layout atual de `entrada_correta`.
   - Implementar o novo layout da aba `entrada_correta_organico-outbound` com este mapeamento:
     - A = data de criação
     - B = tipo de lead
     - C = nome
     - D = telefone
     - E = email
     - F = nome da empresa
     - G = porte
     - H = cargo
     - I = área
     - J = fonte

3. **Preencher os campos certos dos cards**
   - Mapear corretamente os dados importados para os campos já exibidos no Kanban:
     - `name`
     - `phone`
     - `email`
     - `company_name`
     - `company_size`
     - `position`
     - `company_segment`
     - `source/channel`
     - `lead_type`
     - `created_at` / `submitted_at`
   - Garantir que o tipo de lead continue normalizado para `empresa`, `consultoria` e `pessoa_fisica`.

4. **Ajustar a deduplicação da nova aba**
   - Revisar a geração do identificador de lead para a nova guia, já que esse layout não traz sobrenome nem os IDs extras usados no layout anterior.
   - Manter a proteção contra duplicidade por email e criar um fallback estável coerente com as novas colunas.

5. **Validar o impacto no Kanban**
   - Confirmar que filtros e destaque visual dos leads continuam funcionando normalmente após a troca da origem.
   - Verificar que os cards passam a exibir os dados da nova guia nas posições corretas.

**Detalhes técnicos**
- A mudança fica concentrada principalmente na lógica de importação em `src/lib/sheets.functions.ts`.
- Hoje o código usa um único conjunto fixo de índices para ambas as guias; a implementação passará a usar mapeamento específico por aba.
- A origem antiga `organico_outbound` pode ser preservada como valor lógico de canal/origem, mesmo com a troca do nome da aba, para não quebrar filtros já existentes — eu confirmarei isso durante a implementação para evitar regressão visual e analítica.

**Resultado esperado**
Os novos contatos da guia `entrada_correta_organico-outbound` serão criados no Kanban com nome, telefone, email, empresa, porte, cargo, área, fonte, tipo e data nas áreas corretas dos cards, substituindo totalmente a leitura da guia antiga.