'use strict';

const R = (v) =>
  'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const PROD_COLORS = { Carro: '#38bdf8', Moto: '#a78bfa', Bicicleta: '#fbbf24', Selos: '#4ade80' };

let chart = null;

// ── Banner ───────────────────────────────────────────────────────────────────
function renderBanner(b) {
  document.getElementById('banner-label').textContent =
    `Faturamento Acumulado — ${b.month_label ?? ''}`;
  document.getElementById('banner-value').textContent = R(b.current_total);

  const up    = b.variation_pct >= 0;
  const cls   = up ? 'up' : 'down';
  const arrow = up ? '▲' : '▼';
  const sign  = up ? '+' : '';

  const varEl = document.getElementById('banner-variation');
  varEl.textContent = `${arrow} ${sign}${b.variation_pct.toFixed(1)}%`;
  varEl.className   = `banner-variation ${cls}`;

  document.getElementById('banner-prev').textContent =
    `vs ${b.previous_month_label ?? 'mês ant.'}: ${R(b.previous_total)}`;

  const diffEl = document.getElementById('banner-diff');
  diffEl.textContent = `${up ? '+' : ''}${R(b.variation_value)}`;
  diffEl.className   = `banner-diff ${cls}`;
}

// ── KPIs ─────────────────────────────────────────────────────────────────────
function renderKpis(k) {
  document.getElementById('today-total').textContent      = R(k.today_total);
  document.getElementById('yesterday-total').textContent  = R(k.yesterday_total);
  document.getElementById('today-ticket').textContent     = R(k.today_ticket);
  document.getElementById('yesterday-ticket').textContent = R(k.yesterday_ticket);

  const delta = k.today_total - k.yesterday_total;
  const el    = document.getElementById('today-delta');
  const up    = delta >= 0;
  el.textContent = `${up ? '▲' : '▼'} ${up ? '+' : ''}${R(delta)} vs ontem`;
  el.className   = `kpi-delta ${up ? 'up' : 'down'}`;
}

// ── Comparativo Semanal ───────────────────────────────────────────────────────
function renderWeekly(w) {
  const weekdayLabel = w.weekday_label ?? 'Hoje';
  document.getElementById('weekly-label').textContent =
    `${weekdayLabel} vs mesmo dia semana passada`;
  document.getElementById('weekly-today').textContent  = R(w.today_total);
  document.getElementById('weekly-ticket').textContent = R(w.today_ticket);

  // Format last week date: dd/mm
  const [y, m, d] = w.lastweek_date.split('-');
  document.getElementById('weekly-prev-label').innerHTML =
    `Semana passada (${d}/${m}): <strong id="weekly-last">${R(w.lastweek_total)}</strong>`;

  const el = document.getElementById('weekly-delta');
  const up = w.variation_pct >= 0;
  el.textContent = w.lastweek_total > 0
    ? `${up ? '▲' : '▼'} ${up ? '+' : ''}${w.variation_pct.toFixed(1)}%`
    : 'Sem dados da semana passada';
  el.className = `kpi-delta ${w.lastweek_total > 0 ? (up ? 'up' : 'down') : 'kpi-neutral'}`;
}

// ── Gráfico de linha ─────────────────────────────────────────────────────────
function renderChart(monthly, acumulado) {
  document.getElementById('acum-total').textContent = R(acumulado);

  const labels  = monthly.map(m => m.month);
  const values  = monthly.map(m => m.total);
  const ptColor = monthly.map(m => m.is_current ? '#4ade80' : '#38bdf8');

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].pointBackgroundColor = ptColor;
    chart.update('none');
    return;
  }

  const ctx = document.getElementById('monthlyChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#38bdf8',
        backgroundColor: (context) => {
          const { ctx: c, chartArea } = context.chart;
          if (!chartArea) return 'transparent';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, 'rgba(56,189,248,.35)');
          g.addColorStop(1, 'rgba(56,189,248,.02)');
          return g;
        },
        fill: true,
        tension: 0.4,
        borderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: ptColor,
        pointBorderColor: '#0f172a',
        pointBorderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => R(ctx.parsed.y) } }
      },
      scales: {
        x: { grid: { color: '#334155' }, ticks: { color: '#64748b' } },
        y: { grid: { color: '#334155' }, ticks: { color: '#64748b', callback: (v) => R(v) } }
      }
    }
  });
}

// ── Produtos ─────────────────────────────────────────────────────────────────
function renderProducts(products) {
  const maxVal = Math.max(...products.map(p => p.total), 1);
  document.getElementById('products-list').innerHTML = products.map(p => {
    const color = PROD_COLORS[p.product] ?? '#38bdf8';
    const pct   = (p.total / maxVal * 100).toFixed(0);
    return `<div class="prod-row">
      <div class="prod-meta">
        <span class="prod-name">${p.icon} ${p.product}</span>
        <span class="prod-value" style="color:${color}">${R(p.total)}</span>
      </div>
      <div class="prog-bar">
        <div class="prog-fill" style="background:${color};width:${pct}%"></div>
      </div>
    </div>`;
  }).join('');
}

// ── Rankings ─────────────────────────────────────────────────────────────────
function badge(rank) {
  if (rank === 1)  return `<span class="badge b1">1</span>`;
  if (rank === 2)  return `<span class="badge b2">2</span>`;
  if (rank === 3)  return `<span class="badge b3">3</span>`;
  if (rank === 10) return `<span class="badge bz">10</span>`;
  return `<span class="badge bn">${rank}</span>`;
}

function varCell(pct) {
  if (pct > 0) return `<td><span class="var-up">▲ +${pct.toFixed(1)}%</span></td>`;
  if (pct < 0) return `<td><span class="var-down">▼ ${pct.toFixed(1)}%</span></td>`;
  return `<td><span class="var-flat">— 0%</span></td>`;
}

function renderRanking(tbodyId, rows) {
  document.getElementById(tbodyId).innerHTML = rows.map(r => `
    <tr>
      <td>${badge(r.rank)}</td>
      <td title="${r.unit}">${r.unit_name ?? r.unit}</td>
      <td>${R(r.month_total)}</td>
      <td style="color:#94a3b8">${R(r.month_ticket)}</td>
    </tr>`).join('');
}

// ── Render principal ─────────────────────────────────────────────────────────
function render(data) {
  renderBanner(data.banner);
  renderKpis(data.kpis);
  if (data.weekly) renderWeekly(data.weekly);
  renderChart(data.monthly_chart, data.banner.current_total);
  renderProducts(data.products);
  renderRanking('top5-best',  data.top5_best);
  renderRanking('top5-worst', data.top5_worst);
}

// ── Convite de usuário ────────────────────────────────────────────────────────
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
  btn.disabled = true;
  btn.textContent = 'Gerando...';

  try {
    const res  = await fetch('/api/invite', { method: 'POST' });
    const data = await res.json();
    if (!data.link) throw new Error('Sem link');

    document.getElementById('link-box').textContent = data.link;
    document.getElementById('link-info').textContent =
      `⏰ Válido por 7 dias  •  Uso único  •  Expira em ${new Date(data.expiresAt).toLocaleDateString('pt-BR')}`;
    document.getElementById('modal-link-area').style.display = 'block';
    document.getElementById('btn-copiar').textContent = '📋 Copiar link';
    document.getElementById('btn-copiar').classList.remove('copied');
  } catch(e) {
    btn.textContent = 'Erro — tente novamente';
    btn.disabled = false;
  }
}

function copiarLink() {
  const link = document.getElementById('link-box').textContent;
  navigator.clipboard.writeText(link).then(() => {
    const btn = document.getElementById('btn-copiar');
    btn.textContent = '✅ Link copiado!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '📋 Copiar link';
      btn.classList.remove('copied');
    }, 3000);
  });
}

// ── SSE com reconexão automática ─────────────────────────────────────────────
function connect() {
  const es = new EventSource('/api/stream');
  es.onmessage = (e) => { try { render(JSON.parse(e.data)); } catch (_) {} };
  es.onerror   = () => { es.close(); setTimeout(connect, 5000); };
}

connect();
