## Objetivo

Permitir que o Claude (que já tem acesso ao RD CRM) puxe os deals e insira diretamente como leads no Kanban deste app, sem depender da sincronização OAuth que está dando 401.

## Como vai funcionar

1. Você abre uma conversa no Claude e dá a ele:
   - **URL do Supabase:** `https://vlfohgirjbgpqhqbnuks.supabase.co`
   - **Service Role Key** (eu te mostro onde pegar — é uma chave secreta com permissão total no banco)
   - O **mapeamento de campos** RD → tabela `leads` (abaixo)
2. O Claude usa a API REST do Supabase (`POST /rest/v1/leads`) ou um script Node/Python para inserir/atualizar os deals.
3. Os leads aparecem automaticamente no Kanban porque já lemos da tabela `leads`.

## O que eu preciso preparar aqui

### 1. Migration na tabela `leads`
- Adicionar `UNIQUE (rd_deal_id)` para o Claude poder fazer **upsert** (`on_conflict=rd_deal_id`) sem duplicar leads quando rodar de novo.
- Garantir que o `stage_id` default aponte para o primeiro estágio do Kanban (ou aceitar null e o front renderiza em "Sem estágio").

### 2. Stages prontos
Verificar que existem estágios na tabela `stages` casando com os do RD (ex.: "Qualificação", "Proposta", "Ganho", "Perdido"). Se faltar, crio os que faltam.

### 3. Mapa de campos RD → `leads`
| RD CRM                | leads (Supabase)        |
| --------------------- | ----------------------- |
| `deal.id`             | `rd_deal_id` (chave)    |
| `deal.name`           | `name`                  |
| `contacts[0].emails`  | `email`                 |
| `contacts[0].phones`  | `phone`                 |
| `organization.name`   | `company_name`          |
| `deal_stage.name`     | mapear → `stage_id`     |
| `user.name`           | `rd_owner`              |
| `deal_source.name`    | `source`                |
| `deal_custom_fields`  | `form_payload` (jsonb)  |
| `win`/`hold`          | `rd_status`             |

### 4. Snippet pronto para o Claude
Vou gerar um `RD_TO_SUPABASE.md` (no projeto) com:
- endpoint exato (`/rest/v1/leads?on_conflict=rd_deal_id`),
- headers (`apikey`, `Authorization: Bearer <service_role>`, `Prefer: resolution=merge-duplicates`),
- exemplo de body JSON com o mapa acima,
- exemplo de query para buscar `stages.id` por `slug`.

Assim você só copia/cola no Claude.

### 5. Limpar / desativar a sync OAuth atual
Deixa o botão "Conectar RD Station" escondido (ou marca como "experimental") já que vamos pela rota Claude. Não removo o código — só escondo do UI pra não confundir.

## Detalhes técnicos

- **Service Role Key bypassa RLS** — necessário pro Claude inserir sem login. Você vai pegar a chave em Lovable Cloud → Settings → API Keys. Trate como senha (não cole em chat público).
- Nada de Edge Function nem novo endpoint aqui no app — quanto menos código intermediário, menos coisa pra quebrar.
- Realtime já tá ativado na tabela leads? Se sim, o Kanban atualiza sozinho quando o Claude inserir. Se não, vale habilitar (1 linha de SQL).

## Não vou fazer

- Mexer no fluxo OAuth do RD (fica como está, escondido).
- Criar UI nova de import — o trigger é você falar com o Claude.
- Tocar em outras tabelas além de `leads` e `stages`.

Confirma que posso seguir?