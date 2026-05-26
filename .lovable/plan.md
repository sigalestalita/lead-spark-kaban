## Objetivo

Integrar WhatsApp via **UazAPI** para enviar mensagens diretamente do detalhe do lead e ter um **Inbox unificado** dentro do app, com match por telefone (E.164).

## Provedor

UazAPI (REST + webhook). Por instância (número conectado via QR):
- `POST /send/text` — envia texto
- Webhook configurável recebendo `messages.upsert` (mensagem enviada/recebida)
- Token de instância como header `token`

Secrets necessários (via `add_secret` antes de codar):
- `UAZAPI_BASE_URL` (ex.: `https://free.uazapi.com`)
- `UAZAPI_INSTANCE_TOKEN`
- `UAZAPI_WEBHOOK_SECRET` (gerado por nós, valida o webhook)

## Banco — 2 tabelas novas

```text
whatsapp_conversations
  id, lead_id (nullable), phone_e164 (unique), last_message_at,
  last_message_preview, unread_count, status (open/archived)

whatsapp_messages
  id, conversation_id, lead_id, direction (in/out),
  phone_e164, body, media_url, status (sent/delivered/read/failed),
  external_id (id do UazAPI), error, created_at
```

- RLS: `authenticated` lê/escreve tudo (segue padrão do projeto).
- Realtime habilitado em ambas para atualizar a UI ao vivo.
- Função `normalize_phone(text)` → E.164 (`+55...`), usada em trigger e no match.

## Server-side (TanStack)

### `src/lib/whatsapp.functions.ts` (createServerFn)
- `sendWhatsappMessage({ leadId?, phone, body })` — valida com Zod, normaliza telefone, chama UazAPI, grava `whatsapp_messages` (direction=out), atualiza/cria `whatsapp_conversations`, registra `lead_interactions` tipo `whatsapp_out`.
- `listConversations({ search?, status? })` — lista paginada com join leve em `leads`.
- `getConversation({ conversationId })` — conversa + últimas N mensagens + lead.
- `markConversationRead({ conversationId })`.

### `src/routes/api/public/hooks/whatsapp.ts` (server route)
- POST recebe webhook UazAPI.
- Valida header `x-webhook-secret` contra `UAZAPI_WEBHOOK_SECRET` (timingSafeEqual).
- Para cada mensagem: normaliza telefone, faz match em `leads.phone` (E.164); se achar lead, vincula; senão deixa `lead_id=null` (caixa "sem lead").
- Insere em `whatsapp_messages` (direction=in), atualiza `whatsapp_conversations` (last_message_at, unread_count++).
- Também trata status updates (delivered/read) atualizando `external_id`.

## UI

### 1. Detalhe do lead (`src/routes/_app.lead.$id.tsx`)
- Nova aba/card "WhatsApp" com:
  - Histórico de mensagens (in/out) do telefone do lead
  - Composer (textarea + enviar)
  - Aviso se `lead.phone` estiver vazio ou não normalizável

### 2. Inbox (`src/routes/_app.inbox.tsx` — nova rota)
- Layout 2 colunas:
  - **Esquerda**: lista de conversas (ordenadas por `last_message_at`, badge unread, busca por nome/telefone, filtro "sem lead")
  - **Direita**: thread da conversa selecionada + composer
- Subscribe realtime em `whatsapp_messages` e `whatsapp_conversations` para atualizar sem refresh.
- Item no menu lateral em `src/routes/_app.tsx` (ícone MessageCircle).

## Fluxo de configuração (Configurações)

Bloco novo em `_app.configuracoes.tsx` "WhatsApp (UazAPI)":
- Mostra URL do webhook que o usuário cola no painel UazAPI: `https://sdr-grou.lovable.app/api/public/hooks/whatsapp`
- Botão "Testar envio" (envia mensagem de teste para um número informado)
- Status da última mensagem recebida (timestamp)

## Segurança

- Webhook valida secret + Zod no payload.
- Rate-limit simples no `sendWhatsappMessage` (1 msg / 2s por usuário, em memória aceitável no MVP — anotar limitação).
- `phone` validado com Zod regex E.164 antes de qualquer chamada externa.
- Service role só dentro do webhook (precisa bypassar RLS para inserir sem sessão).

## Fora de escopo (MVP)

- Templates HSM / disparo em massa
- Mídia (áudio/imagem/documento) — só texto no v1; schema já suporta `media_url` para depois
- Disparo automático por IA (fica como botão "sugerir mensagem" reusando `suggestApproach` já existente)
- Múltiplas instâncias / múltiplos números

## Ordem de execução

1. `add_secret` para `UAZAPI_BASE_URL`, `UAZAPI_INSTANCE_TOKEN`, `UAZAPI_WEBHOOK_SECRET`
2. Migration: tabelas + RLS + realtime + função normalize_phone
3. `whatsapp.functions.ts` + webhook route
4. Aba WhatsApp no detalhe do lead
5. Rota `/inbox` + item de menu
6. Card de configuração + URL do webhook

## Pergunta antes de seguir

Tem um número UazAPI já conectado e o `token` da instância em mãos? Se sim, posso pedir os 3 secrets logo no início da implementação.
