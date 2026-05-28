## Newsletter semanal automática para `time@grougp.com.br`

Replicar o padrão do projeto "Plataforma de Sucesso do Cliente: Grou": **Resend + domínio `grougp.com.br` já verificado lá**.

### 1. Secret
- Solicitar `RESEND_API_KEY` (mesma chave usada no outro projeto da Grou — pode copiar de lá).

### 2. Schema (migration)
Nova tabela `weekly_digests`:
- `id uuid pk`
- `week_start date` (segunda-feira da semana)
- `subject text`
- `content_html text` (HTML do email)
- `content_summary text` (resumo em markdown, exibido no /novidades)
- `stats jsonb` (números crus: leads novos, conversões, etc.)
- `status text` (`draft`/`sent`/`failed`)
- `sent_at timestamptz`
- `error_message text`
- `created_at timestamptz default now()`
- RLS: leitura para `authenticated`, escrita só via service role.
- GRANTs apropriados.

### 3. Server function: `generateWeeklyDigest` (`src/lib/digest.functions.ts`)
- Coleta dados da última semana via `supabaseAdmin`:
  - Total de leads novos (`leads.created_at`)
  - Leads enriquecidos
  - Mudanças de stage / conversões
  - Interações registradas
  - Top empresas pelo score
- Chama Lovable AI (`google/gemini-3-flash-preview`) com tool calling estruturado para gerar:
  - `subject` (assunto do email)
  - `summary_markdown` (resumo amigável para /novidades)
  - `html_body` (corpo HTML do email, com seções: novidades da plataforma, números da semana, destaques)
- Insere em `weekly_digests` com `status='draft'`.

### 4. Server route pública: `/api/public/hooks/send-weekly-digest`
- Protegida por `apikey` header (anon key — padrão Lovable).
- Chama `generateWeeklyDigest` se não houver digest da semana atual.
- Envia via Resend API direta:
  - From: `Grou Plataforma <noreply@grougp.com.br>`
  - To: `time@grougp.com.br`
  - Subject/HTML do digest gerado
- Atualiza `weekly_digests` para `status='sent'` + `sent_at`. Em erro, `failed` + `error_message`.

### 5. Cron pg_cron
- Job `send-weekly-digest-thursday` rodando toda quinta às 09:00 BRT (12:00 UTC): `0 12 * * 4`.
- Body vazio `{}`.

### 6. Página `/novidades` (`src/routes/_app.novidades.tsx`)
- Lista todas as edições de `weekly_digests` ordenadas por `week_start desc`.
- Cada card mostra: semana, assunto, status (badge), preview do `summary_markdown`, botão "ver HTML enviado" (modal).
- Botão "Gerar e enviar agora" (admin) — chama a server route manualmente para testar.

### 7. Item de menu
- Adicionar link "Novidades" na navegação do `_app.tsx`.

### Detalhes técnicos
- Resend: chamada direta via `fetch('https://api.resend.com/emails', ...)` no server route (Node-compatível, sem SDK).
- Conteúdo gerado: a IA recebe um system prompt explicando o conceito da plataforma SDR GROU (CRM de leads, Kanban, enriquecimento, scoring ICP, integração RD/Sheets/WhatsApp) + os números da semana, e gera HTML estilizado simples (inline CSS, sem dependências).
- Idempotência: a server route checa se já existe digest com `week_start = segunda-feira atual` e `status='sent'` antes de enviar de novo.