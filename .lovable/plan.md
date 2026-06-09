## Objetivo
Disparar um e-mail automaticamente quando um novo lead é inserido (via sincronização do Google Sheets ou criação manual), avisando o responsável conforme o `lead_type`:

- `empresa` ou `pessoa_fisica` → **lisiane@grougp.com.br** (Lisiane Baudini)
- `consultoria` → **mariana.borges@grougp.com.br** (Mariana Borges)
- Sem `lead_type` identificado → não dispara (evita ruído).

Conteúdo do e-mail: nome do lead, empresa, classificação (Consultoria/Empresa/Pessoa Física) e nota (score/priority).

## Provedor
Usar o **Resend** já conectado no projeto (`RESEND_API_KEY` já existe nos secrets) via gateway de connectors. Sem necessidade de configurar domínio novo — usar `onboarding@resend.dev` como remetente até que um domínio próprio seja verificado (posso trocar depois se preferirem).

## Mudanças

### 1. `src/lib/lead-notify.server.ts` (novo, server-only)
- Função `notifyNewLead(lead)` que:
  - Mapeia `lead_type` → destinatário (Lisiane/Mariana). Retorna cedo se não houver match.
  - Monta assunto: `Novo lead: {nome} — {Classificação}`.
  - Monta HTML simples com: Nome, Empresa, Classificação (badge colorida por tipo), Score/Priority, link para `/lead/{id}` no app.
  - POST para `https://connector-gateway.lovable.dev/resend/emails` com headers `Authorization: Bearer LOVABLE_API_KEY` + `X-Connection-Api-Key: RESEND_API_KEY`.
  - Captura erro e loga em `integration_logs` (provider `resend`, action `notify_new_lead`) — nunca derruba o fluxo de inserção.

### 2. `src/lib/sheets.functions.ts`
- Após o loop de inserção de leads (no `syncLeadsFromSheet`), para cada linha efetivamente inserida, chamar `notifyNewLead(...)` em paralelo (`Promise.allSettled`) usando os dados do `payload` + `lead_type` já normalizado.
- Disparo só ocorre para leads recém-inseridos (não para skipped/existentes).

### 3. `src/lib/leads.functions.ts`
- No `createManualLead`, após o insert bem-sucedido, chamar `notifyNewLead(...)` com os dados do lead criado (normalizando o `lead_type` se vier preenchido).

### 4. URL base para o link "Abrir lead"
- Usar `process.env.APP_PUBLIC_URL` se existir, fallback para `https://sdr-grou.lovable.app`. Sem novo secret obrigatório.

## Fora de escopo
- Configurar domínio próprio no Resend (posso fazer depois se quiserem o remetente `@grougp.com.br`).
- Templates React Email com infra de fila / Lovable Emails — overkill para 2 destinatários internos.
- Notificação para mudanças de estágio, atualizações ou re-importações.
- UI de configuração dos destinatários (mapeamento fica fixo no código por enquanto; trivial mover para `app_settings` depois).

## Arquivos afetados
- create: `src/lib/lead-notify.server.ts`
- edit: `src/lib/sheets.functions.ts`
- edit: `src/lib/leads.functions.ts`
