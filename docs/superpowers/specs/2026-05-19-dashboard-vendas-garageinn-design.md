# Design: Dashboard Vendas Online — GarageINN

**Data:** 2026-05-19  
**Status:** Aprovado

---

## Visão Geral

Dashboard web de acompanhamento de vendas online em tempo real para a GarageINN. Exibe faturamento mensal, comparativos diários de valor e ticket médio, ranking de unidades e breakdown por produto. Atualiza automaticamente ao receber e-mails de confirmação de vendas.

---

## Unidades monitoradas

10 unidades: ACYR, ATRIUM II, BERRINI, COMOLATTI, CUBO, IGUATEMI, JF100, JK28, MYKONOS, PARAISO.

---

## Layout aprovado

### Título
- Texto: **DASHBOARD VENDAS ONLINE — GarageINN**
- Indicador "🟢 AO VIVO" no canto superior direito
- Tema escuro (`#0f172a` de fundo)

### Banner — Acumulado do Mês (acima dos KPIs, full-width)

Faixa full-width com gradiente verde escuro (`#1e3a2f` → `#1e293b`), borda sutil verde.

| Elemento | Conteúdo |
|----------|----------|
| Esquerda | Label "Faturamento Acumulado — Mês/Ano" + valor em destaque grande |
| Direita | Variação % em verde (▲) ou vermelho (▼) + diferença em R$ + "vs Mês Anterior: R$XXX" |

Regra de cor da variação:
- `▲ +X%` em `#4ade80` (verde) quando mês atual > mês anterior
- `▼ -X%` em `#ef4444` (vermelho) quando mês atual < mês anterior

Dado seed: `R$ 847.000 ▲ +2,0% vs Abril: R$ 830.000 (+R$ 17.000)`

### Linha 1 — KPIs (4 cards no topo)
| Card | Dado | Detalhe |
|------|------|---------|
| Vendas Hoje | Valor total do dia corrente | Variação em R$ vs ontem (▲/▼) |
| Vendas Ontem | Valor total do dia anterior | Label "Dia anterior completo" |
| Ticket Médio Hoje | Ticket médio do dia corrente | Variação em R$ vs ontem (▲/▼) |
| Ticket Médio Ontem | Ticket médio do dia anterior | Label "Dia anterior completo" |

Cada card tem borda colorida no topo (azul, roxo, amarelo, laranja).

### Linha 2 — Gráfico de linha + Produtos (lado a lado)

**Gráfico de linha (2/3 da largura):**
- Eixo X: meses do ano (Jan–Dez)
- Eixo Y: faturamento em R$ (escala automática)
- Linha com área preenchida (gradiente azul)
- Pontos circulares em cada mês
- Mês atual destacado em verde com label "R$XXX ●"
- Faturamento acumulado exibido no cabeçalho do card
- Implementar com Chart.js (tipo `line`, `fill: true`)

**Painel de Produtos (1/3 da largura):**
- 4 produtos: 🚗 Carro, 🏍 Moto, 🚲 Bicicleta, 📮 Selos
- Cada produto exibe: valor total (R$) + barra de progresso proporcional
- Cores distintas por produto (azul, roxo, amarelo, verde)

### Linha 3 — Ranking de Unidades (lado a lado, 50%/50%)

**Top 5 Melhores** (borda/título verde 🏆):
Tabela com colunas: `#` | Unidade | Faturamento (mês atual) | Ticket Médio (mês atual) | Var% (hoje vs ontem)

**Top 5 Piores** (borda/título vermelho ⚠️):
Tabela com colunas: `#` | Unidade | Faturamento (mês atual) | Ticket Médio (mês atual) | Var% (hoje vs ontem)

- `Var%` = variação do faturamento de hoje vs ontem por unidade
- Verde (▲) para crescimento, vermelho (▼) para queda, cinza (—) para neutro
- Posição global (#1–#10) exibida com medalha colorida (ouro, prata, bronze para top 3)

---

## Dados fictícios de referência (seed)

### Faturamento mensal 2025
| Mês | Faturamento |
|-----|-------------|
| Jan | R$ 620.000 |
| Fev | R$ 710.000 |
| Mar | R$ 790.000 |
| Abr | R$ 830.000 |
| Mai | R$ 847.000 (mês atual) |

**Acumulado:** R$ 3.797.000

### Ranking de unidades (faturamento acumulado do mês atual)
| # | Unidade | Faturamento | Ticket Médio | Var% Hoje |
|---|---------|-------------|--------------|-----------|
| 1 | BERRINI | R$ 98.200 | R$ 1.540 | ▲ +18% |
| 2 | IGUATEMI | R$ 87.500 | R$ 1.420 | ▲ +12% |
| 3 | CUBO | R$ 73.900 | R$ 1.380 | ▲ +9% |
| 4 | JK28 | R$ 62.100 | R$ 1.190 | — 0% |
| 5 | PARAISO | R$ 54.300 | R$ 1.050 | ▲ +5% |
| 6 | MYKONOS | R$ 43.200 | R$ 980 | ▼ -7% |
| 7 | ATRIUM II | R$ 35.700 | R$ 870 | ▼ -11% |
| 8 | JF100 | R$ 25.400 | R$ 760 | ▼ -15% |
| 9 | ACYR | R$ 18.900 | R$ 680 | ▼ -19% |
| 10 | COMOLATTI | R$ 14.200 | R$ 590 | ▼ -24% |

### Acumulado do mês vs mês anterior
| Métrica | Mês Atual (Mai) | Mês Anterior (Abr) | Variação |
|---------|-----------------|---------------------|---------|
| Faturamento acumulado | R$ 847.000 | R$ 830.000 | ▲ +2,0% (+R$ 17.000) |

### KPIs do dia
| Métrica | Hoje | Ontem | Variação |
|---------|------|-------|---------|
| Vendas totais | R$ 42.180 | R$ 35.860 | ▲ +R$ 6.320 |
| Ticket Médio | R$ 1.250 | R$ 1.105 | ▲ +R$ 145 |

### Produtos (acumulado do período)
| Produto | Valor | % |
|---------|-------|---|
| 🚗 Carro | R$ 297.000 | 35% |
| 🏍 Moto | R$ 237.000 | 28% |
| 🚲 Bicicleta | R$ 186.000 | 22% |
| 📮 Selos | R$ 127.000 | 15% |

---

## Atualização automática via e-mail

O dashboard deve se atualizar automaticamente ao receber e-mails de confirmação de vendas.

**Fluxo:**
1. E-mail de confirmação chega na caixa de entrada
2. Sistema lê e faz parsing do e-mail (valor, unidade, produto, data)
3. Dados são gravados/atualizados no storage (JSON local ou SQLite)
4. Dashboard recarrega os dados via polling (a cada 30s) ou WebSocket

**Parsing do e-mail:**
- Conectar via IMAP (biblioteca `imaplib` Python ou `imap-simple` Node.js)
- Filtrar por remetente ou assunto reconhecido como confirmação de venda
- Extrair: unidade, produto, valor, data/hora

**Tecnologia de atualização em tempo real:**
- Opção A (simples): polling a cada 30 segundos via `setInterval` + `fetch`
- Opção B (reativa): Server-Sent Events (SSE) — servidor envia push quando novo e-mail chega

Recomendação: **SSE** — sem overhead de WebSocket, nativo no browser, suficiente para este caso.

---

## Stack técnica recomendada

| Camada | Tecnologia |
|--------|------------|
| Frontend | HTML + CSS + JavaScript (sem framework) |
| Gráficos | Chart.js |
| Backend | Python (Flask) ou Node.js (Express) |
| Leitura de e-mail | `imaplib` (Python) ou `imap-simple` (Node) |
| Storage | JSON local (seed) → SQLite (produção) |
| Atualização real-time | Server-Sent Events (SSE) |

---

## Fora de escopo

- Autenticação/login
- Exportação de relatórios
- Histórico além do período atual
- Edição manual de dados pelo dashboard
