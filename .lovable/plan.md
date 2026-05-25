## O que vai mudar na sincronização com o RD Station

Três melhorias na sync, mantendo o botão manual atual e somando filtro de data, automação por cron e importação do histórico de atividades/notas.

---

### 1. Filtro de data (configurável)

Adicionar nas **Configurações → RD Station** dois campos:
- **"Janela inicial (dias)"** — quantos dias para trás puxar na primeira sync (default: 90)
- **"Janela incremental (minutos)"** — quanto tempo para trás varrer em cada sync automática (default: 15)

O filtro é aplicado via parâmetros `start_date` / `end_date` do endpoint `/deals` do RD (data de criação do deal). Se o RD ignorar o filtro para algum deal, o upsert por `rd_deal_id` evita duplicidade.

Também guardo `last_sync_at` em `app_settings` para a sync incremental saber de onde retomar.

---

### 2. Importar atividades e notas do RD

Para cada deal sincronizado, fazer duas chamadas extras:
- `GET /deals/:id/activities` — atividades (ligações, emails, reuniões)
- `GET /deals/:id/notes` — notas internas

Cada item vira um registro em `lead_interactions`:
- `type`: `rd_activity` ou `rd_note`
- `content`: texto da atividade/nota
- `metadata`: payload original (tipo da atividade, autor RD, data)
- `created_at`: data original do RD

Dedup por uma chave composta (`lead_id` + `rd_activity_id` salvo em `metadata`) para não duplicar a cada nova sync.

No card detalhado do lead (`/lead/$id`), a timeline já existente passa a mostrar atividades RD intercaladas com notas internas, ordenadas por data.

**Importante:** isso multiplica o número de chamadas ao RD (1 deal = 3 requests). Vou aplicar throttle simples (50ms entre chamadas) e cap por sync. Tornar a importação de atividades/notas **opcional via toggle** nas Configurações para casos em que o usuário só queira deals.

---

### 3. Sync automática (cron a cada 15 min)

- Criar endpoint público `POST /api/public/hooks/sync-rd` que roda a mesma lógica do `syncRdLeads`, autenticado via header `apikey` (anon key) — o prefixo `/api/public/*` já bypassa auth do site publicado.
- Habilitar extensões `pg_cron` + `pg_net` e agendar job rodando a cada 15 min apontando para esse endpoint.
- Cada execução grava em `integration_logs` (já existe a tabela) com `fetched/created/updated` e duração — visível em uma nova aba **"Logs"** nas Configurações.
- Botão **"Sincronizar agora"** continua existindo no Kanban (sync manual completo, ignora janela incremental).

---

### Mudanças por arquivo

**Banco (migration):**
- `app_settings`: novas chaves `rd_sync_window_days` (90), `rd_sync_incremental_minutes` (15), `rd_import_activities` (true), `rd_last_sync_at`
- Habilitar `pg_cron` e `pg_net`
- Job cron `sync-rd-incremental` a cada 15 min

**Código:**
- `src/lib/rd-station.functions.ts` — adicionar `start_date/end_date` no fetch, importar activities/notes, escrever `rd_last_sync_at`, novo modo `incremental` vs `full`
- `src/routes/api/public/hooks/sync-rd.ts` — novo endpoint chamado pelo cron
- `src/routes/_app.configuracoes.tsx` — novos campos (janela, toggle activities) + aba de logs de sync
- `src/routes/_app.lead.$id.tsx` — timeline passa a renderizar `lead_interactions` do tipo `rd_activity`/`rd_note`

---

### Como vai se comportar na prática

- **Primeira sync (manual, agora):** traz tudo dos últimos 90 dias do funil "Leads - Empresas" + atividades/notas de cada deal
- **A partir daí:** cron a cada 15 min puxa só o que mudou nos últimos 15 min
- **Forçar refresh total:** botão "Sincronizar agora" no Kanban
- **Histórico do RD:** aparece automaticamente na timeline do lead, junto com notas que o SDR adicionar no sistema

Vou pedir aprovação antes de rodar a migration e começar a implementação.