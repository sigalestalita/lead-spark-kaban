## O que vou entregar

### 1. Edição da prévia antes do disparo
- Na página `/novidades`, ao clicar em "Ver prévia" o modal passa a abrir em **modo editor**:
  - Campo de **Assunto** editável.
  - Editor do **HTML do email** (textarea com fonte mono + pré-visualização ao vivo em iframe lado a lado).
  - Campo opcional de **Resumo** (o texto que aparece no card).
  - Botões: "Salvar alterações", "Salvar e enviar", "Cancelar".
- Nova server function `updateDigestDraft({ digestId, subject?, contentHtml?, contentSummary? })` que só altera digests com `status != 'sent'`.
- Migration: adicionar policies de `UPDATE` em `weekly_digests` para `authenticated` (hoje só tem SELECT), restritas a linhas onde `status <> 'sent'`. INSERT continua só via service_role.
- O botão "Aprovar e enviar" do card continua funcionando para envio direto sem abrir o editor.

### 2. Novo layout do email (visual da plataforma Lidi)
Substituir o `wrapHtml` em `src/lib/digest.functions.ts` por um template novo:
- **Fundo escuro azul** (mesmo tom da plataforma — `oklch(0.11 0.03 265)` convertido para HEX equivalente para compatibilidade com clientes de email).
- **Header**: faixa com gradiente azul → roxo (estilo aurora do login), logo Lidi branca centralizada, tagline "Newsletter semanal do time Grou".
- **Card de conteúdo** central (max-width 640px) com fundo `#0f172a`/translúcido, bordas arredondadas, texto claro, accent em azul Gerdau.
- **Bloco de números** (stats) em grid de 4 cards com números grandes em fonte display.
- **Footer** escuro com logo pequena + "Gerado automaticamente pela Lidi · Grou".
- Tipografia: Plus Jakarta Sans (já carregada na plataforma) via fallback web-safe.
- Tudo inline CSS (compatível com Gmail/Outlook), sem dependência externa exceto a logo hospedada em `/public`.

### 3. Logo nova (anexo `Logo_Branco.png`)
- Copiar o anexo para `public/lidi-logo-white.png` (usado no email, pois precisa de URL pública absoluta) e para `src/assets/lidi-logo-white.png` (usado nos componentes React).
- **Tela de login** (`src/routes/login.tsx`): substituir o ícone `<Users />` + texto "SDR GROU" pela logo Lidi branca (altura ~40px). Atualizar subtítulo para "Plataforma de qualificação de leads · Grou".
- **App shell** (`src/routes/_app.tsx`): substituir o branding atual no topbar/sidebar pela logo Lidi branca.
- **Email**: header usa a logo via URL absoluta (`https://<published>/lidi-logo-white.png`) — uso `VITE_PUBLIC_SITE_URL` se existir, senão hardcode do domínio publicado `https://sdr-grou.lovable.app`.
- Títulos `<title>` de páginas que ainda dizem "SDR GROU" passam para "Lidi".

### Detalhes técnicos
- Migration adiciona:
  ```sql
  CREATE POLICY digests_auth_update ON public.weekly_digests
    FOR UPDATE TO authenticated
    USING (status <> 'sent') WITH CHECK (status <> 'sent');
  GRANT UPDATE ON public.weekly_digests TO authenticated;
  ```
- `updateDigestDraft` valida com Zod (subject 1-200, html 1-200000, summary 0-5000) e usa `supabaseAdmin` para garantir update independente de RLS, mas rejeita se `status === 'sent'` no servidor antes do update.
- Editor usa textarea simples (sem dep nova) + iframe `srcDoc` que re-renderiza com debounce de 300ms. Sem rich-text editor para não inflar bundle.
- Cores do email (HEX para compatibilidade): bg `#0b1226`, surface `#121a33`, border `#1f2a4a`, primary `#4A90E2`, primary-dark `#003DA5`, text `#e6ecff`, muted `#94a3c8`.

### Arquivos afetados
- novo: `supabase/migrations/<timestamp>_weekly_digests_update_policy.sql`
- novo: `public/lidi-logo-white.png`, `src/assets/lidi-logo-white.png`
- novo: `src/components/digest-editor.tsx` (modal editor)
- edit: `src/lib/digests.functions.ts` (add `updateDigestDraft`)
- edit: `src/lib/digest.functions.ts` (novo `wrapHtml` com layout Lidi)
- edit: `src/routes/_app.novidades.tsx` (usar editor no lugar do preview read-only)
- edit: `src/routes/login.tsx` (logo Lidi)
- edit: `src/routes/_app.tsx` (logo Lidi no shell)
