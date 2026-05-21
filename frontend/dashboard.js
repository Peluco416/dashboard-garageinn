'use strict';

const R = (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const PROD_CFG = {
  Carro:     { color: '#00d4ff', bg: 'rgba(0,212,255,.18)',  icon: '🚗' },
  Moto:      { color: '#ff4fa3', bg: 'rgba(255,79,163,.18)', icon: '🏍' },
  Selos:     { color: '#00e676', bg: 'rgba(0,230,118,.18)',  icon: '📮' },
  Bicicleta: { color: '#ff7c2a', bg: 'rgba(255,124,42,.18)', icon: '🚲' },
};

let chart = null;

// ── Banner ────────────────────────────────────────────────────────────────────
function renderBanner(b) {
  document.getElementById('banner-period').textContent  = b.month_label ?? '';
  document.getElementById('banner-value').textContent   = R(b.current_total);

  const up  = b.variation_pct >= 0;
  const el  = document.getElementById('banner-variation');
  el.textContent = `${up ? '↗' : '↘'} ${up ? '+' : ''}${b.variation_pct.toFixed(1)}%`;
  el.className   = `acum-growth-value ${up ? 'up' : 'down'}`;
}

// ── Hoje / Ontem ──────────────────────────────────────────────────────────────
function renderKpis(k) {
  document.getElementById('today-total').textContent     = R(k.today_total);
  document.getElementById('yesterday-total').textContent = R(k.yesterday_total);

  const delta = k.today_total - k.yesterday_total;
  const up    = delta >= 0;
  const sign  = up ? '+' : '';

  document.getElementById('today-sub').innerHTML =
    `<span class="${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${sign}${R(delta)}</span> vs ontem`;
  document.getElementById('yesterday-sub').textContent =
    `${k.yesterday_count} venda(s) • Ticket: ${R(k.yesterday_ticket)}`;
}

// ── Gráfico ───────────────────────────────────────────────────────────────────
function renderChart(monthly) {
  const labels = monthly.map(m => m.month);
  const totals = monthly.map(m => m.total);

  let acc = 0;
  const cumul = totals.map(v => { acc += v; return +acc.toFixed(2); });

  const currentVal = cumul[cumul.length - 1] ?? 0;
  document.getElementById('chart-current').textContent = R(currentVal);

  const ptColors = monthly.map(m => m.is_current ? '#00e676' : '#00d4ff');
  const ptSizes  = monthly.map(m => m.is_current ? 7 : 4);

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data              = cumul;
    chart.data.datasets[0].pointBackgroundColor = ptColors;
    chart.data.datasets[0].pointRadius       = ptSizes;
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
        data: cumul,
        borderColor: '#00d4ff',
        borderWidth: 2.5,
        backgroundColor: (context) => {
          const { ctx: c, chartArea } = context.chart;
          if (!chartArea) return 'transparent';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, 'rgba(0,212,255,.3)');
          g.addColorStop(1, 'rgba(0,212,255,.01)');
          return g;
        },
        fill: true,
        tension: 0.45,
        pointRadius: ptSizes,
        pointHoverRadius: 9,
        pointBackgroundColor: ptColors,
        pointBorderColor: '#060913',
        pointBorderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0d1527',
          borderColor: '#192036',
          borderWidth: 1,
          titleColor: '#7a8fae',
          bodyColor: '#fff',
          callbacks: {
            label: (ctx) => `Acumulado: ${R(ctx.parsed.y)}`,
            afterLabel: (ctx) => `Mês: ${R(totals[ctx.dataIndex])}`,
          }
        },
        datalabels: {
          align: 'top', anchor: 'end', offset: 4,
          color: '#7a8fae',
          font: { size: 10, weight: '700', family: 'Segoe UI' },
          formatter: (v) => R(v),
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(25,32,54,.7)', drawBorder: false },
          ticks: { color: '#4a5568', font: { size: 11 } },
        },
        y: {
          grid: { color: 'rgba(25,32,54,.7)', drawBorder: false },
          ticks: { color: '#4a5568', callback: (v) => R(v), font: { size: 11 } },
        }
      },
      layout: { padding: { top: 26, right: 8 } }
    }
  });
}

// ── Produtos ──────────────────────────────────────────────────────────────────
function renderProducts(products) {
  const total = products.reduce((s, p) => s + p.total, 0);
  document.getElementById('products-total').textContent = R(total);

  document.getElementById('products-list').innerHTML = products.map(p => {
    const cfg  = PROD_CFG[p.product] ?? { color: '#00d4ff', bg: 'rgba(0,212,255,.18)', icon: '📦' };
    const pct  = total > 0 ? (p.total / total * 100).toFixed(1) : 0;
    return `
    <div class="prod-row">
      <div class="prod-top">
        <div class="prod-name-wrap">
          <div class="prod-icon" style="background:${cfg.bg}">${cfg.icon}</div>
          <span class="prod-name-text">${p.product}</span>
        </div>
        <div class="prod-right">
          <div class="prod-value" style="color:${cfg.color}">${R(p.total)}</div>
          <div class="prod-pct">${pct}%</div>
        </div>
      </div>
      <div class="prog-bar">
        <div class="prog-fill" style="width:${pct}%;background:${cfg.color};box-shadow:0 0 8px ${cfg.color}55"></div>
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
  const mc = b.current_count ?? 0;
  document.getElementById('month-count').textContent = mc;
  const mcEl = document.getElementById('month-count-delta');
  mcEl.textContent = `${k.today_count} venda(s) hoje`;
  mcEl.className   = 'kpi-delta flat';

  // Pedidos hoje
  document.getElementById('today-count').textContent = k.today_count;
  const cd   = k.today_count - k.yesterday_count;
  const cdEl = document.getElementById('today-count-delta');
  cdEl.textContent = `${cd >= 0 ? '▲ +' : '▼ '}${cd} vs ontem`;
  cdEl.className   = `kpi-delta ${cd >= 0 ? 'up' : 'down'}`;

  // Ticket médio mensal
  document.getElementById('month-ticket').textContent = R(b.current_ticket ?? 0);
  const tkEl = document.getElementById('month-ticket-delta');
  const tkRef = k.today_ticket || 0;
  tkEl.textContent = `Ticket hoje: ${R(tkRef)}`;
  tkEl.className   = 'kpi-delta flat';

  // Comparativo semanal (Dom → hoje vs mesmo período semana passada)
  if (w?.period_label) {
    const pEl = document.getElementById('weekly-period');
    if (pEl) pEl.textContent = w.period_label;
  }
  document.getElementById('weekly-today').textContent = R(w?.current_total ?? 0);
  const wEl = document.getElementById('weekly-delta');
  if (w && w.prev_total > 0) {
    const up = w.variation_pct >= 0;
    wEl.textContent = `${up ? '▲ +' : '▼ '}${w.variation_pct.toFixed(1)}% vs semana passada`;
    wEl.className   = `kpi-delta ${up ? 'up' : 'down'}`;
  } else {
    wEl.textContent = 'Sem dados semana anterior';
    wEl.className   = 'kpi-delta flat';
  }
}

// ── Rankings ──────────────────────────────────────────────────────────────────
function badge(r) {
  if (r === 1) return `<span class="badge b1">1</span>`;
  if (r === 2) return `<span class="badge b2">2</span>`;
  if (r === 3) return `<span class="badge b3">3</span>`;
  return `<span class="badge bn">${r}</span>`;
}

function renderRanking(id, rows) {
  document.getElementById(id).innerHTML = rows.map(r => `
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
  const btn = document.getElementById('btn-gerar');
  btn.disabled = false; btn.textContent = 'Gerar Link de Convite';
}
function fecharModal() { document.getElementById('modal-overlay').classList.remove('open'); }
async function criarLink() {
  const btn = document.getElementById('btn-gerar');
  btn.disabled = true; btn.textContent = 'Gerando...';
  try {
    const res  = await fetch('/api/invite', { method: 'POST' });
    const data = await res.json();
    if (!data.link) throw new Error();
    document.getElementById('link-box').textContent = data.link;
    document.getElementById('link-info').textContent =
      `⏰ Válido 7 dias • Uso único • Expira ${new Date(data.expiresAt).toLocaleDateString('pt-BR')}`;
    document.getElementById('modal-link-area').style.display = 'block';
    document.getElementById('btn-copiar').textContent = '📋 Copiar link';
  } catch { btn.textContent = 'Erro — tente novamente'; btn.disabled = false; }
}
function copiarLink() {
  navigator.clipboard.writeText(document.getElementById('link-box').textContent).then(() => {
    const btn = document.getElementById('btn-copiar');
    btn.textContent = '✅ Copiado!';
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
