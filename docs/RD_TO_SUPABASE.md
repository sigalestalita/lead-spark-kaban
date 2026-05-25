# Importar deals do RD CRM para o Lovable via Claude

Este guia é para colar dentro de uma conversa com o Claude (ou qualquer
agente com acesso à API do RD CRM). Ele insere/atualiza leads direto na
tabela `leads` deste projeto.

## Credenciais que o Claude precisa

- `SUPABASE_URL` = `https://vlfohgirjbgpqhqbnuks.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = pegar em **Lovable Cloud → Settings → API Keys** (chave `service_role`). É secreta — não publique.
- Token do RD CRM (você já tem no Claude).

## Endpoint Supabase (upsert)

```
POST {SUPABASE_URL}/rest/v1/leads?on_conflict=rd_deal_id

Headers:
  apikey: {SUPABASE_SERVICE_ROLE_KEY}
  Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}
  Content-Type: application/json
  Prefer: resolution=merge-duplicates,return=minimal
```

Body é um array de objetos. Cada objeto = 1 deal do RD.

## Mapeamento RD → leads

| Campo RD CRM                | Coluna `leads`         |
| --------------------------- | ---------------------- |
| `deal.id`                   | `rd_deal_id` (chave)   |
| `deal.name`                 | `name`                 |
| `contacts[0].emails[0].email` | `email`              |
| `contacts[0].phones[0].phone` | `phone`              |
| `contacts[0].job_title`     | `position`             |
| `organization.name`         | `company_name`         |
| `organization.website`      | `company_website`      |
| `deal_stage.name`           | mapear → `stage_id` (ver abaixo) |
| `user.name` / `user.email`  | `rd_owner`             |
| `deal_source.name`          | `source`               |
| `deal_custom_fields`        | `form_payload` (jsonb) |
| `win` (bool) / `hold`       | `rd_status` (`won` / `lost` / `open`) |
| `created_at` do deal        | `created_at`           |

Campos obrigatórios na inserção: **`name`** (nunca null) e **`rd_deal_id`** (chave de upsert).

## Mapear `deal_stage.name` do RD → `stage_id` do Kanban

Estágios disponíveis hoje (slug → id):

| slug              | nome no Kanban           |
| ----------------- | ------------------------ |
| `novo`            | Novo lead                |
| `enriquecendo`    | Enriquecendo dados       |
| `pronto`          | Pronto para abordagem    |
| `abordado`        | Abordado                 |
| `qualificacao`    | Em qualificação          |
| `aguardando`      | Aguardando retorno       |
| `agendado`        | Agendado                 |
| `comercial`       | Enviado para comercial   |
| `desqualificado`  | Desqualificado           |
| `perdido`         | Perdido                  |

Para buscar o `id` de cada stage:

```
GET {SUPABASE_URL}/rest/v1/stages?select=id,slug
Headers: apikey, Authorization (mesmos do POST)
```

Faça um dicionário no Claude: `{ "Qualificação": "<id de qualificacao>", ... }`. Se não houver match, use o stage `novo` como default.

## Exemplo de body

```json
[
  {
    "rd_deal_id": "abc-123",
    "name": "João Silva",
    "email": "joao@empresa.com",
    "phone": "+5511999999999",
    "company_name": "Empresa LTDA",
    "company_website": "https://empresa.com",
    "position": "Diretor de Marketing",
    "stage_id": "cecdccb2-ab0b-4250-8b52-06048b7c0b31",
    "rd_owner": "Vendedor X",
    "source": "Landing page",
    "rd_status": "open",
    "form_payload": { "custom_field_1": "valor" }
  }
]
```

## Prompt sugerido para o Claude

> Para cada deal no meu funil do RD CRM, gere um objeto JSON usando o
> mapeamento acima e faça um POST em lote (até 100 por vez) para
> `https://vlfohgirjbgpqhqbnuks.supabase.co/rest/v1/leads?on_conflict=rd_deal_id`
> com os headers indicados. Antes, faça GET em `/rest/v1/stages?select=id,slug`
> e monte o dicionário de stage_id. Reporte ao final: quantos inseridos,
> quantos atualizados, e quais deals falharam.

## Observação

O Kanban deste app lê em tempo real da tabela `leads` — assim que o
Claude terminar o POST, os cards aparecem sem precisar recarregar.