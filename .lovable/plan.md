## O que vou entregar

### 1. Sistema de roles
Nova migration cria:
- `enum app_role` com valores `super_admin`, `gestao`, `executivo`, `sdr`.
- Tabela `public.user_roles (id, user_id, role, created_at)` com unique `(user_id, role)`, RLS + grants:
  - `SELECT` permitido a `authenticated` (necessário pro front saber o role do próprio user e o super_admin listar todos).
  - `INSERT/UPDATE/DELETE` só via `service_role` (gerenciados por server functions).
- Função `public.has_role(_user_id uuid, _role app_role)` `SECURITY DEFINER` (padrão Lovable, evita recursão de RLS).
- Função `public.is_super_admin(_user_id uuid)` shortcut.
- Trigger `handle_new_user` é estendido: além de criar profile, se o email for `talita.sigales@grougp.com.br` insere automaticamente role `super_admin`; senão lê o role escolhido em `raw_user_meta_data->>'role'` (validado contra o enum, fallback `sdr`).

### 2. Restrição de domínio + role no cadastro (`src/routes/login.tsx`)
- No modo signup, validar client-side que o email termina em `@grougp.com.br` antes de chamar `supabase.auth.signUp`. Erro amigável caso contrário.
- Adicionar `<RadioGroup>` com opções: SDR, Executivo, Gestão (somente no modo signup).
- Passar `data: { full_name, role }` no `signUp` options — o trigger usa esse role.
- Validação server-side via trigger: se email não termina em `@grougp.com.br`, `RAISE EXCEPTION` (defesa em profundidade).
- Mensagem no card de signup: "Cadastro restrito ao time Grou (@grougp.com.br)".

### 3. Hook `useCurrentRole`
Novo `src/lib/use-role.ts`: query simples no `user_roles` filtrando por `auth.uid()`, retorna `{ role, isSuperAdmin, isGestao, loading }`. Cacheada via React Query.

### 4. Tela de gestão de usuários (`/configuracoes/usuarios` — acessível só a super_admin/gestão)
Nova rota `src/routes/_app.configuracoes.usuarios.tsx`:
- Tabela com todos os usuários (join `profiles` + `user_roles`), mostrando email, nome, role atual, data de cadastro.
- Para cada linha: `<Select>` para alterar o role + botão "Remover acesso" (super_admin only).
- Server functions em `src/lib/users.functions.ts`:
  - `listUsers()` — usa `requireSupabaseAuth` + checa `has_role(super_admin|gestao)`, retorna lista via `supabaseAdmin`.
  - `updateUserRole({ userId, role })` — super_admin only, deleta roles antigas e insere a nova.
  - `removeUser({ userId })` — super_admin only, usa `supabaseAdmin.auth.admin.deleteUser`.
- Bloquear remoção/alteração do próprio super_admin (Talita).
- Link "Gerenciar usuários" aparece no `_app.configuracoes.tsx` apenas se `isSuperAdmin || isGestao`.

### 5. Backfill da Talita
Caso ela já exista em `auth.users`, a migration roda um `INSERT ... ON CONFLICT DO NOTHING` para garantir o role `super_admin`. Se ainda não existir, o trigger cuida quando ela se cadastrar.

### 6. Visibilidade no app shell
- Sidebar (`_app.tsx`) continua mostrando todas as abas pra todos — o controle real é por server function. Apenas a aba "Usuários" dentro de Configurações é gated por role.
- (Nada além disso muda hoje na UI por role — você só pediu visão total pra Talita, o que já acontece naturalmente. Se quiser esconder abas específicas para SDR/executivo no futuro, dá pra evoluir com base no mesmo hook.)

### Detalhes técnicos
- Migration ordem: enum → table → grants → RLS → policies → função has_role → função is_super_admin → atualizar `handle_new_user` (drop+recreate) → backfill Talita.
- Trigger valida domínio:
  ```sql
  IF NEW.email NOT LIKE '%@grougp.com.br' THEN
    RAISE EXCEPTION 'Apenas emails @grougp.com.br podem se cadastrar';
  END IF;
  ```
- `updateUserRole` e `removeUser` checam `is_super_admin(context.userId)` no início; retornam 403 se falso.
- `listUsers` permite gestão também (read-only), mas server retorna `canEdit: false` pra esse caso e o front desabilita os controles.
- Validação Zod em todas as server fns (`role` é `z.enum([...])`, `userId` é `z.string().uuid()`).

### Arquivos afetados
- nova migration: `supabase/migrations/<ts>_user_roles_and_domain_restriction.sql`
- nova: `src/lib/users.functions.ts`
- nova: `src/lib/use-role.ts`
- nova: `src/routes/_app.configuracoes.usuarios.tsx`
- edit: `src/routes/login.tsx` (validação de domínio + RadioGroup de role)
- edit: `src/routes/_app.configuracoes.tsx` (link condicional para gestão de usuários)
