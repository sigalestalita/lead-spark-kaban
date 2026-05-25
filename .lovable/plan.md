# Rebranding Gerdau + Redesign Tech/Inovação

## Identidade visual

- Inserir o logo Gerdau (copiado para `src/assets/gerdau-logo.png`) no header do painel.
- Paleta principal:
  - Azul Gerdau `#003DA5` (primário)
  - Azul escuro `#00237D` (profundidade / fundos)
  - Azul claro `#4A90E2` (acentos / hover)
  - Branco `#FFFFFF` e off-white `#F5F7FA` (superfícies)
  - Cinza neutro `#6B7280` e `#1F2937` (texto)
- Faixas de compatibilidade migram para tons coerentes com a marca:
  - Excelente: azul Gerdau
  - Muito Boa: azul claro
  - Aceitável: âmbar
  - Baixa: vermelho corporativo

Tokens atualizados em `src/styles.css` (oklch) — `--primary`, `--background`, `--card`, `--accent`, `--faixa-*` etc. Nenhum componente usará cor hardcoded.

## Direção de redesign — "Tech / Inovação"

Conceito: painel executivo no estilo dashboard de SaaS B2B moderno (Linear / Vercel / Stripe), aplicado à identidade industrial Gerdau. Sensação de dado vivo, precisão analítica.

Elementos:

- **Header fixo** com logo Gerdau à esquerda, seletor de cargo como pill segmentado central, badge de período à direita.
- **Hero KPI strip**: 4 cards grandes com números em fonte display (Space Grotesk), micro-sparkline embaixo de cada KPI, borda sutil azul, fundo branco com glow azul no card de correlação.
- **Mensagem-chave**: bloco full-width sobre gradiente `#00237D → #003DA5`, texto branco, 4 chips de faixa empilhados horizontalmente mostrando "Excelente → Baixa" com setas e número de ocorrências médias crescendo visualmente. Animação de entrada com contagem.
- **Ranking**: lista vertical com barras duplas (compatibilidade azul preenchida + ocorrências em traço vermelho-âmbar) lado a lado, nome + faixa em badge colorido. Hover revela detalhamento.
- **Heatmap**: grid denso, células com escala oklch azul→vermelho, header fixo, tipografia mono nos números.
- **Comparativo por faixa**: gráfico de barras agrupadas mais clean, grid suave, sem bordas pesadas.
- **Tabela detalhada**: estilo data-table moderno, zebra sutil, header sticky, ordenação clicável.

Tipografia:
- Display/headings: **Space Grotesk** (geométrica, tech)
- Corpo: **Inter** (legibilidade dashboard)
- Números KPI: **JetBrains Mono** tabular

Detalhes de polish:
- Cantos `rounded-xl` consistentes
- Sombras suaves `0 1px 3px rgba(0,61,165,.08)`
- Gradiente sutil de fundo da página (`#F5F7FA → #FFFFFF`)
- Microinterações: fade-up nos cards, contagem animada nos KPIs, hover lift discreto

## Escopo desta entrega

1. Copiar logo para `src/assets/gerdau-logo.png` e importar no header.
2. Reescrever tokens em `src/styles.css` para a paleta Gerdau (oklch).
3. Atualizar `src/routes/index.tsx` com a nova estrutura visual descrita acima, mantendo os mesmos dados e cálculos.
4. Adicionar fontes Space Grotesk + Inter + JetBrains Mono via Google Fonts.

Fora de escopo (próximo passo): inclusão do Cargo 2 — Especialista de Manutenção.

## Detalhes técnicos

- Tokens em `oklch()` no `:root` de `src/styles.css`.
- Logo importado como módulo ES6: `import logo from "@/assets/gerdau-logo.png"`.
- Fontes carregadas via `<link>` no `__root.tsx` head.
- Sem mudança em lógica de cálculo (`pearson`, `getFaixa`, `totalOcorrencias`).
