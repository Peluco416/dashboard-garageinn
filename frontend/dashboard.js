'use strict';

const R = (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const PROD_COLORS = {
  Carro:     { bar: '#00d4ff', bg: 'rgba(0,212,255,.15)' },
  Moto:      { bar: '#f97316', bg: 'rgba(249,115,22,.15)' },
  Bicicleta: { bar: '#fbbf24', bg: 'rgba(251,191,36,.15)' },
  Selos:     { bar: '#00e676', bg: 'rgba(0,230,118,.15)' },
};
const PROD_ICONS = { Carro: '🚗', Moto: '🏍', Bicicleta: '🚲', Selos: '📮' };

let chart = null;

// ── Banner ────────────────────────────────────────────────────────────────────
function renderBanner(b) {
  document.getElementById('banner-period').textContent = b.month_label ?? '';
  document.getElementById('banner-value').textContent  = R(b.current_total);

  const up  = b.variation_pct >= 0;
  const el  = document.getElementById('banner-variation');
  el.textContent = `${up ? '↗' : '↘'} ${up ? '+' : ''}${b.variation_pct.toFixed(1)}%`;
  el.className   = `growth-value ${up ? 'up' : 'down'}`;
}

// ── Hoje / Ontem ──────────────────────────────────────────────────────────────
function renderKpis(k) {
  document.getElementById('today-total').textContent     = R(k.today_total);
  document.getElementById('yesterday-total').textContent = R(k.yesterday_total);

  const delta = k.today_total - k.yesterday_total;
  const up    = delta >= 0;
  document.getElementById('today-sub').textContent =
    `${up ? '▲' : '▼'} ${up ? '+' : ''}${R(delta)} vs ontem  •  Ticket: ${R(k.today_ticket)}`;

  document.getElementById('yesterday-sub').textContent =
    `${k.yesterday_count} venda(s)  •  Ticket: ${R(k.yesterday_ticket)}`;
}

// ── Gráfico cumulativo ────────────────────────────────────────────────────────
function renderChart(monthly) {
  const labels  = monthly.map(m => m.month);
  const totals  = monthly.map(m => m.total);

  // Acumulado ano
  let acc = 0;
  const cumulative = totals.map(v => { acc += v; return acc; });
  const currentAcc = cumulative[cumulative.length - 1] ?? 0;
  document.getElementById('chart-current').textContent = R(currentAcc);

  const ptColors = monthly.map(m => m.is_current ? '#00e676' : '#00d4ff');

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = cumulative;
    chart.data.datasets[0].pointBackgroundColor = ptColors;
    chart.update('none');
    return;
  }

  Chart.register(ChartDataLabels);

  const ctx = document.getElementById('monthlyChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: cumulative,
        borderColor: '#00d4ff',
        backgroundColor: (context) => {
          const { ctx: c, chartArea } = context.chart;
          if (!chartArea) return 'transparent';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, 'rgba(0,212,255,.25)');
          g.addColorStop(1, 'rgba(0,212,255,.01)');
          return g;
        },
        fill: true,
        tension: 0.4,
        borderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointBackgroundColor: ptColors,
        pointBorderColor: '#080c18',
        pointBorderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `Acumulado: ${R(ctx.parsed.y)}`,
            afterLabel: (ctx) => `Mês: ${R(totals[ctx.dataIndex])}`,
          }
        },
        datalabels: {
          align: 'top',
          anchor: 'end',
          color: '#8892a4',
          font: { size: 10, weight: '600' },
          formatter: (v) => R(v),
          display: (ctx) => ctx.datasetIndex === 0,
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(30,42,69,.5)' },
          ticks: { color: '#4a5568', font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(30,42,69,.5)' },
          ticks: { color: '#4a5568', callback: (v) => R(v), font: { size: 11 } }
        }
      },
      layout: { padding: { top: 24 } }
    }
  });
}

// ── Produtos ──────────────────────────────────────────────────────────────────
function renderProducts(products) {
  const total = products.reduce((s, p) => s + p.total, 0);
  document.getElementById('products-total').textContent = R(total);

  document.getElementById('products-list').innerHTML = products.map(p => {
    const c    = PROD_COLORS[p.product] ?? { bar: '#00d4ff', bg: 'rgba(0,212,255,.15)' };
    const icon = PROD_ICONS[p.product] ?? '📦';
    const pct  = total > 0 ? (p.total / total * 100).toFixed(1) : 0;
    return `
    <div class="prod-row">
      <div class="prod-top">
        <div class="prod-name">
          <div class="prod-icon" style="background:${c.bg}">${icon}</div>
          ${p.product.toUpperCase()}
        </div>
        <div class="prod-right">
          <div class="prod-value" style="color:${c.bar}">${R(p.total)}</div>
          <div class="prod-pct">${pct}%</div>
        </div>
      </div>
      <div class="prog-bar">
        <div class="prog-fill" style="background:${c.bar};width:${pct}%"></div>
      </div>
    </div>`;
  }).join('');
}

// ── Bottom KPIs ───────────────────────────────────────────────────────────────
function renderBottomKpis(data) {
  const b = data.banner;
  const k = data.kpis;
  const w = data.weekly;

  // Vendas no mês
  document.getElementById('month-count').textContent = b.current_count ?? '—';
  document.getElementById('month-count-delta').textContent =
    `${k.today_count} venda(s) hoje`;
  document.getElementById('month-count-delta').className = 'kpi-delta flat';

  // Pedidos hoje
  document.getElementById('today-count').textContent = k.today_count;
  const countDelta = k.today_count - k.yesterday_count;
  const countEl = document.getElementById('today-count-delta');
  countEl.textContent = `${countDelta >= 0 ? '▲' : '▼'} ${countDelta >= 0 ? '+' : ''}${countDelta} vs ontem`;
  countEl.className = `kpi-delta ${countDelta >= 0 ? 'up' : 'down'}`;

  // Ticket médio mensal
  document.getElementById('month-ticket').textContent = R(b.current_ticket ?? 0);
  const ticketDelta = (b.current_ticket ?? 0) - (k.today_ticket || 0);
  const ticketEl = document.getElementById('month-ticket-delta');
  ticketEl.textContent = `Hoje: ${R(k.today_ticket)} por venda`;
  ticketEl.className = 'kpi-delta flat';

  // Comparativo semanal
  document.getElementById('weekly-today').textContent = R(w?.today_total ?? 0);
  const wEl  = document.getElementById('weekly-delta');
  if (w && w.lastweek_total > 0) {
    const up = w.variation_pct >= 0;
    wEl.textContent = `${up ? '▲' : '▼'} ${up ? '+' : ''}${w.variation_pct.toFixed(1)}% vs semana passada`;
    wEl.className   = `kpi-delta ${up ? 'up' : 'down'}`;
  } else {
    wEl.textContent = 'Sem dados semana anterior';
    wEl.className   = 'kpi-delta flat';
  }
}

// ── Rankings ──────────────────────────────────────────────────────────────────
function badge(rank) {
  if (rank === 1) return `<span class="badge b1">1</span>`;
  if (rank === 2) return `<span class="badge b2">2</span>`;
  if (rank === 3) return `<span class="badge b3">3</span>`;
  return `<span class="badge bn">${rank}</span>`;
}

function renderRanking(tbodyId, rows) {
  document.getElementById(tbodyId).innerHTML = rows.map(r => `
    <tr>
      <td>${badge(r.rank)}</td>
      <td title="${r.unit_name ?? r.unit}">${r.unit_name ?? r.unit}</td>
      <td style="font-weight:700">${R(r.month_total)}</td>
      <td style="color:#4a5568">${R(r.month_ticket)}</td>
    </tr>`).join('');
}

// ── Render principal ──────────────────────────────────────────────────────────
function render(data) {
  renderBanner(data.banner);
  renderKpis(data.kpis);
  renderChart(data.monthly_chart);
  renderProducts(data.products);
  renderBottomKpis(data);
  renderRanking('top5-best',  data.top5_best);
  renderRanking('top5-worst', data.top5_worst);
}

// ── Convite ───────────────────────────────────────────────────────────────────
function gerarConvite() {
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('modal-link-area').style.display = 'none';
  document.getElementById('btn-gerar').disabled = false;
  document.getElementById('btn-gerar').textContent = 'Gerar Link de Convite';
}
function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}
async function criarLink() {
  const btn = document.getElementById('btn-gerar');
  btn.disabled = true; btn.textContent = 'Gerando...';
  try {
    const res  = await fetch('/api/invite', { method: 'POST' });
    const data = await res.json();
    if (!data.link) throw new Error();
    document.getElementById('link-box').textContent = data.link;
    document.getElementById('link-info').textContent =
      `⏰ Válido por 7 dias  •  Uso único  •  Expira em ${new Date(data.expiresAt).toLocaleDateString('pt-BR')}`;
    document.getElementById('modal-link-area').style.display = 'block';
    document.getElementById('btn-copiar').textContent = '📋 Copiar link';
  } catch { btn.textContent = 'Erro — tente novamente'; btn.disabled = false; }
}
function copiarLink() {
  navigator.clipboard.writeText(document.getElementById('link-box').textContent).then(() => {
    const btn = document.getElementById('btn-copiar');
    btn.textContent = '✅ Link copiado!';
    setTimeout(() => { btn.textContent = '📋 Copiar link'; }, 3000);
  });
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function initUser() {
  try {
    const data = await fetch('/api/me').then(r => r.json());
    const btn  = document.getElementById('btn-invite');
    if (btn) btn.style.display = data.user?.username === 'admin' ? 'inline-flex' : 'none';
  } catch (_) {}
}

// ── SSE ───────────────────────────────────────────────────────────────────────
function connect() {
  const es = new EventSource('/api/stream');
  es.onmessage = (e) => { try { render(JSON.parse(e.data)); } catch (_) {} };
  es.onerror   = () => { es.close(); setTimeout(connect, 5000); };
}

initUser();
connect();
