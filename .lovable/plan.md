
# Sistema de Qualificação de Leads Inbound — Kanban SDR (MVP)

## Resumo
Plataforma web interna integrada ao RD Station CRM (funil "Leads - Empresas") que organiza leads inbound em um Kanban, abre cards enriquecidos com contexto de conversão, calcula prioridade por ICP e gera sugestão de mensagem para WhatsApp via Lovable AI. Login simples por email/senha (sem roles ainda).

## O que será entregue neste MVP

### 1. Autenticação
- Email/senha via Lovable Cloud
- Rota `/login` pública e rotas protegidas para o resto do app
- Trigger para criar registro em `profiles` no signup

### 2. Banco de dados (Lovable Cloud / Supabase)
Tabelas com RLS habilitado:
- `profiles` — usuário (id, nome, email)
- `leads` — dados do lead + empresa + contexto de conversão + score + status + assignee + timestamps; índice único para evitar duplicidade por email/telefone
- `lead_interactions` — histórico (tipo, conteúdo, autor, data)
- `lead_notes` — observações internas
- `stages` — etapas do Kanban configuráveis (ordem, nome, cor)
- `icp_config` — critérios e pesos do score (JSON)
- `integration_logs` — log de chamadas RD e enriquecimento
- `app_settings` — token RD, SLA, templates de mensagem
- Seed das 10 etapas iniciais + ICP padrão

### 3. Integração RD Station CRM
- Secret `RD_STATION_TOKEN` (token de API pessoal — pedirei via add_secret quando entrarmos em build)
- Server function `syncRdLeads`: busca deals do funil "Leads - Empresas", normaliza para a tabela `leads`, evita duplicados (upsert por rd_deal_id + email)
- Server function `updateRdDealStage`: ao mover card no Kanban, tenta refletir mudança no RD
- Botão "Sincronizar agora" + cron (a configurar depois)

### 4. Kanban
- View principal `/kanban` com colunas dinâmicas vindas de `stages`
- Drag-and-drop entre colunas (@dnd-kit) atualiza status no banco e dispara `updateRdDealStage`
- Card mostra: nome, empresa, badge de prioridade (cor), origem/campanha, tempo na etapa, avatar do responsável

### 5. Card detalhado do lead (modal ou rota `/lead/$id`)
- Bloco dados pessoais / empresa / conversão (campanha, anúncio, formulário, data)
- Histórico de interações
- Botões: WhatsApp (`https://wa.me/...`), LinkedIn pessoa, LinkedIn empresa, site
- Campo de observações internas (autosave)
- Campo "resultado da abordagem"
- Botão "Enriquecer lead" (ver item 6)
- Botão "Gerar sugestão de mensagem" (ver item 7)

### 6. Enriquecimento (estrutura + manual + IA leve)
- Campos no `leads`: website, descrição, segmento, tamanho, localização, linkedin pessoa, linkedin empresa, resumo, dor provável, sinais ICP, `enrichment_status` ('pending' | 'found' | 'not_found' | 'manual')
- Server function `enrichLead` usa Lovable AI (Gemini) para gerar resumo/segmento/dor provável a partir do que já temos (nome, empresa, email corporativo). Campos não encontrados ficam editáveis manualmente.
- Arquitetura preparada para plugar SerpAPI/Apollo/Clearbit no futuro (interface `EnrichmentProvider`)

### 7. Sugestão de mensagem WhatsApp (Lovable AI)
- Server function `suggestApproach` chama gateway com prompt consultivo usando: nome, empresa, contexto da conversão, dor provável, template configurável
- Botão "Copiar" + "Abrir no WhatsApp"

### 8. Score ICP e priorização
- Função pura `calculateScore(lead, icpConfig)` rodando ao criar/atualizar lead
- Classifica em Alta / Média / Baixa / Fora de ICP, com cor no card
- Filtro por prioridade no Kanban

### 9. Filtros e busca
- Barra no topo do Kanban: busca textual + filtros (origem, campanha, status, prioridade, responsável, segmento, tamanho, "sem abordagem", "aguardando retorno", "alta prioridade")
- Estado persistido em querystring

### 10. Dashboard `/dashboard`
- Cards de KPI: total recebidos, novos, abordados, qualificados, agendados, desqualificados
- Tempo médio até primeira abordagem
- Taxa de conversão lead → agenda
- Gráfico de volume por origem/campanha (Recharts)
- Distribuição por etapa do Kanban
- Lista de "leads parados há mais de X dias"

### 11. Alertas / SLA (versão simples)
- Coluna `last_action_at` + cálculo de "stalled" no servidor
- Badge vermelho nos cards que estouraram SLA
- Página `/alertas` com listagem (notificações por email ficam para depois)

### 12. Configurações `/configuracoes`
- Etapas do Kanban (CRUD + reordenar)
- Critérios e pesos do ICP
- Templates de mensagem
- SLA (minutos para primeira abordagem, dias máximos por etapa)
- Conexão RD Station (status do token + botão testar)

## Fora do escopo deste MVP (combinado)
- Roles (Admin/SDR/Gestor) — todos enxergam tudo por enquanto
- Integrações reais de enriquecimento (SerpAPI/Apollo/Clearbit) — estrutura pronta, sem chamadas externas
- Notificações por email/push
- OAuth do RD Station (usaremos token pessoal)

## Notas técnicas
- TanStack Start + Lovable Cloud (Supabase) já configurados no projeto
- Toda lógica sensível (token RD, chamadas Lovable AI, score, sync) em `createServerFn`
- `supabaseAdmin` apenas em rotas/server functions de webhook ou jobs administrativos
- RLS: usuários autenticados veem todos os leads (compartilhados pelo time); writes registram `updated_by`
- Drag-and-drop: `@dnd-kit/core` + `@dnd-kit/sortable`
- Design system: paleta atual (azul Gerdau) será substituída por uma identidade neutra própria de produto SDR (a definir no build — posso propor direções se quiser)

## Ordem de implementação sugerida
1. Auth + schema do banco + seed de etapas/ICP
2. Settings (token RD) + server function de sync + tela básica de leads em lista
3. Kanban com drag-and-drop
4. Card detalhado + observações + interações + botões externos
5. Score ICP + filtros/busca
6. Enriquecimento via Lovable AI + sugestão de mensagem
7. Dashboard
8. Alertas/SLA

Posso começar pelo passo 1 assim que aprovar — vou pedir o token do RD Station no momento certo (passo 2).
