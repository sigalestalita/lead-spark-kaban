## Plano: OAuth2 com RD Station CRM

### URL de callback (cole no formulário do App agora)

```
https://project--773e2ce3-3b97-4224-ac14-c22657fc102a.lovable.app/api/public/rd/callback
https://project--773e2ce3-3b97-4224-ac14-c22657fc102a-dev.lovable.app/api/public/rd/callback
```

Uma por linha. A primeira é a URL estável de produção, a segunda serve previews. Salve o App no RD — ele vai gerar **Client ID** e **Client Secret**, que vou pedir como secrets logo abaixo.

---

### O que muda na integração

Hoje o sistema usa um token estático em `?token=XXX`. O OAuth2 do RD CRM funciona diferente:

1. Usuário clica "Conectar RD" → redireciona para `https://api.rdstation.com.br/auth/dialog?client_id=...&redirect_uri=.../api/public/rd/callback`
2. Usuário autoriza → RD redireciona de volta com `?code=XXX`
3. Nosso callback troca o `code` por `access_token` (válido 24h) + `refresh_token` (perene)
4. Guardamos os dois no banco
5. Em toda chamada à API, mandamos `Authorization: Bearer <access_token>`
6. Quando der 401, refrescamos automaticamente usando o `refresh_token`

---

### Mudanças no banco

Nova tabela `rd_oauth_tokens` (single-row, gerenciada pelo admin):
- `access_token` (text)
- `refresh_token` (text)
- `expires_at` (timestamptz)
- `connected_by` (uuid, quem autorizou)
- `connected_at`, `updated_at`

RLS: leitura apenas para `authenticated`, escrita apenas via server functions (com `supabaseAdmin`).

---

### Arquivos novos / alterados

**Novos:**
- `src/routes/api/public/rd/callback.ts` — server route que recebe o `code`, troca por tokens e salva no banco, depois redireciona para `/configuracoes?rd=connected`
- `src/lib/rd-oauth.server.ts` — helpers: `getValidAccessToken()` (lê do banco, refresca se expirado), `exchangeCode()`, `refreshToken()`
- `src/lib/rd-oauth.functions.ts` — server fn `getRdConnectionStatus()` e `disconnectRd()`

**Alterados:**
- `src/lib/rd-station.functions.ts` — todas as chamadas passam a usar `Bearer` e `getValidAccessToken()`; endpoints do CRM continuam os mesmos (`/api/v1/deals`, `/deals/:id/activities`, `/deals/:id/notes`); remove o uso de `RD_STATION_TOKEN`
- `src/routes/_app.configuracoes.tsx` — substitui o campo "Token RD" pelo botão **"Conectar ao RD Station"** que abre o popup OAuth + estado "Conectado como X / Desconectar"

**Secrets a adicionar:**
- `RD_CLIENT_ID`
- `RD_CLIENT_SECRET`

(O `RD_STATION_TOKEN` antigo pode ser removido depois que a nova conexão estiver funcionando.)

---

### Detalhes técnicos

- **Endpoints OAuth do RD CRM**:
  - Authorize: `https://api.rdstation.com.br/auth/dialog?client_id=<id>&redirect_uri=<callback>`
  - Token exchange / refresh: `POST https://api.rdstation.com.br/auth/token` (body `{client_id, client_secret, code}` ou `{client_id, client_secret, refresh_token}`)
- **Chamadas API**: header `Authorization: Bearer <access_token>` em vez de `?token=`
- **Refresh automático**: `getValidAccessToken()` checa `expires_at`. Se faltar < 5 min, chama refresh antes de devolver. Em caso de 401 da API, força refresh + 1 retry.
- **Segurança do callback**: o endpoint `/api/public/rd/callback` é público (precisa ser, o RD chama sem auth), mas valida `state` (gerado quando o usuário inicia o fluxo, guardado em cookie httpOnly) para evitar CSRF.

---

### Como vai ficar para o usuário

1. Vai em **Configurações → RD Station**
2. Clica em **"Conectar ao RD Station"**
3. Faz login no RD e autoriza o app "LEADS SDR"
4. Volta pro sistema com mensagem "Conectado ✓"
5. A partir daí, sync manual + cron a cada 15 min funcionam normalmente, sem token estático

Posso prosseguir?
