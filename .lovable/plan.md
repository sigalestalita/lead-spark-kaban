## Objetivo
Tratar a planilha `leads_meta_pipeline-inbound` (aba `entrada_correta`) como fonte de verdade dos leads inbound da Meta. Toda linha vira um card na coluna "Novos leads", com enriquecimento automático já existente.

## Mapeamento (colunas do Sheet → campos do lead)

| Sheet | Lead |
|---|---|
| Data | `form_payload.submitted_at` (e `created_at` ao inserir) |
| Tipo de lead | `form_payload.lead_type` |
| Nome + Sobrenome | `name` |
| Telefone | `phone` (normalizado para E.164 `+55...`) |
| Email | `email` |
| Empresa | `company_name` + `original_company_name` |
| Área | `company_segment` |
| Porte | `company_size` |
| Cargo | `position` |
| Dor | `probable_pain` |
| Campanha | `campaign` |
| Conjunto | `form_payload.ad_set` |
| Ad | `ad_name` |
| Campanha id / Ad set ID / Ad ID | `form_payload.meta_ids` |
| Form_ID | `form_name` |
| Lead_ID | `form_payload.lead_id` (chave única de dedupe) |

Fixos: `source = "meta_ads"`, `channel = "meta_ads"`, `stage_id = stage 'novo'`, `enrichment_status = 'pending'` (o loop atual de auto-enriquecimento já pega esses leads e roda IA + Firecrawl).

## O que vou implementar

1. **`src/lib/sheets.functions.ts`** — server fn `syncLeadsFromSheet`:
   - Lê `entrada_correta!A2:W` via gateway Google Sheets (já conectado).
   - Para cada linha com `Lead_ID`, monta o objeto de lead.
   - Busca em batch os `form_payload->>lead_id` já existentes em `leads` e ignora duplicados.
   - Insere os novos em `leads` (stage = `novo`, `enrichment_status = 'pending'`).
   - Grava log em `integration_logs` (`provider='google_sheets'`, action='sync', detail com counts).
   - Atualiza `app_settings` chave `sheets_sync_state` com `{ last_sync_at, last_lead_id, inserted, skipped }`.
   - Retorna `{ inserted, skipped, total }`.

2. **Backfill inicial** — primeira execução importa todas as ~2.4k linhas (em batches de 200 inserts). Como o enriquecimento já roda em ciclos, os cards ficam visíveis imediatamente e vão sendo enriquecidos em background.

3. **Sincronização contínua** — duas formas, complementares:
   - **No Kanban**: mesmo loop que já chama `autoEnrichPending` chama também `syncLeadsFromSheet` a cada ~60s enquanto a aba está aberta (barato — só lê o sheet quando alguém está usando).
   - **Endpoint público** `src/routes/api/public/cron/sheets-sync.ts` protegido por header `x-cron-secret` (novo secret `CRON_SECRET`) para um cron externo opcional disparar a sincronização independente do uso da UI.

4. **UI em Configurações** — bloco "Integração Google Sheets":
   - Mostra `last_sync_at`, total importado, link para o sheet.
   - Botão "Sincronizar agora" disparando `syncLeadsFromSheet` manualmente.

## Detalhes técnicos

- **Telefone**: helper que tira não-dígitos; se começar com `55` e tiver 12-13 dígitos vira `+55...`; senão tenta `+<digitos>`.
- **Dedupe**: `Lead_ID` da Meta é o identificador único. Query: `select form_payload->>'lead_id' from leads where form_payload->>'lead_id' in (...)`.
- **Empresa "."** ou vazia: cai como `null` em `company_name` (o enriquecimento ainda roda pelo email/LinkedIn).
- **Connector**: usa `GOOGLE_SHEETS_API_KEY` + `LOVABLE_API_KEY` via gateway (`https://connector-gateway.lovable.dev/google_sheets/v4/...`). Já vinculado ao projeto.
- **ID da planilha** fica fixo no código por enquanto: `1gGib1CJCUaS-1xNKBrexP7OzuY87u_ZDWehsJdz1U5A`, aba `entrada_correta`.
- **Secret novo**: `CRON_SECRET` (só pedido se você quiser configurar um cron externo; sem ele, a sincronização via UI já funciona).

## Fora de escopo
- Webhook em tempo real do Sheets (Apps Script) — pode vir depois; o polling de 60s é suficiente para o fluxo atual.
- Sincronização inversa (escrever no sheet a partir do CRM).
