import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, insertSale, insertDenied, getMonthlyTotals, getDailyKpis,
         getUnitRankings, getPlanRankingsAllTime, getPlanRankingsMonth,
         getProductTotals, getBannerData,
         getWeeklyPeriodComparison, backfillPlanNames, backfillCustomerCpf,
         getConversionStats } from './data_store.js';
import { startWatcher } from './email_reader.js';
import { localDateStr, addDaysStr } from './date_utils.js';
import { createUser, verifyUser, deleteUser, listUsers, requireAuth,
         generateInvite, validateInvite, registerWithInvite, listInvites } from './auth.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND   = path.join(__dirname, '..', 'frontend');
const DB_PATH    = process.env.DB_PATH ?? path.join(__dirname, 'sales.db');

// Mapeamento código e-mail → nome real da unidade
const UNIT_NAMES = {
  'SP1':      'NAÇÕES UNIDAS 3',
  'SP2':      'MARTINIANO',
  'SP3':      'TERRENO REBOUÇAS',
  'DF1':      'BRASILIA',
  'RJ1':      'AQWA',
  'Barueri1': 'ICON ALPHAVILLE',
  'PB1':      'PATO BRANCO',
};

export const app = express();
export const db  = initDb(DB_PATH);

// ── Middlewares ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET ?? 'garageinn_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }, // 8 horas
}));

// SSE subscribers
const subscribers = new Set();

function notify() {
  const payload = JSON.stringify(buildPayload());
  for (const res of subscribers) {
    try { res.write(`data: ${payload}\n\n`); }
    catch (_) { subscribers.delete(res); }
  }
}

function onNewSale(sale) {
  insertSale(db, sale);
  notify();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTH_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const PROD_ICONS  = { Carro:'🚗', Moto:'🏍', Bicicleta:'🚲', Selos:'📮' };

const todayStr     = () => localDateStr();
const yesterdayStr = () => addDaysStr(todayStr(), -1);
const currentMonth = () => todayStr().slice(0,7);
const previousMonth= () => {
  const [y, m] = todayStr().split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0,7);
};

export function buildPayload() {
  const today     = todayStr();
  const yesterday = yesterdayStr();
  const curMonth  = currentMonth();
  const prevMonth = previousMonth();
  const year      = Number(today.slice(0,4));

  const banner = getBannerData(db, curMonth, prevMonth);
  const mIdx   = Number(curMonth.split('-')[1])  - 1;
  const pIdx   = Number(prevMonth.split('-')[1]) - 1;
  banner.month_label          = `${MONTH_NAMES[mIdx]}/${year}`;
  banner.previous_month_label = MONTH_NAMES[pIdx];

  const kpis = getDailyKpis(db, today, yesterday);

  const weekly = getWeeklyPeriodComparison(db, today);

  const monthly_chart = getMonthlyTotals(db, year).map(r => ({
    month:      MONTH_SHORT[Number(r.month.split('-')[1]) - 1],
    total:      r.total,
    is_current: r.month === curMonth,
  }));

  const productsRaw = getProductTotals(db, curMonth);
  const prodSum     = productsRaw.reduce((s,p) => s+p.total, 0) || 1;
  const products    = productsRaw.map(p => ({
    product: p.product,
    total:   p.total,
    pct:     +(p.total/prodSum*100).toFixed(1),
    icon:    PROD_ICONS[p.product] ?? '📦',
  }));

  const rankings = getUnitRankings(db, curMonth, today, yesterday)
    .map(r => ({ ...r, unit_name: UNIT_NAMES[r.unit] ?? r.unit }));

  // Totais mensais agregados (count e ticket médio do mês)
  banner.current_count  = rankings.reduce((s, r) => s + (r.month_count || 0), 0);
  banner.current_ticket = banner.current_count > 0
    ? +(banner.current_total / banner.current_count).toFixed(2) : 0;

  // Ranking por mensalista (campo "MENSALISTA ..." do produto), todo o período
  const planRankingsAllTime = getPlanRankingsAllTime(db)
    .map(r => ({ ...r, unit_name: r.plan_name }));

  // Ranking por mensalista, mês vigente
  const planRankingsMonth = getPlanRankingsMonth(db, curMonth)
    .map(r => ({ ...r, unit_name: r.plan_name }));

  const conversion_total = getConversionStats(db, null);
  const conversion_month = getConversionStats(db, curMonth);

  return {
    banner, kpis, weekly, monthly_chart, products,
    top5_best:        planRankingsAllTime.slice(0, 5),
    top5_worst:       planRankingsAllTime.slice(-5).reverse(),
    top5_best_month:  planRankingsMonth.slice(0, 5),
    top5_worst_month: planRankingsMonth.slice(-5).reverse(),
    conversion_total,
    conversion_month,
  };
}

// ── Endpoints de sincronização (públicos, protegidos por chave) ──────────────
app.delete('/api/sales/delete', (req, res) => {
  try {
    const key = req.headers['x-sync-key'] ?? req.body?.key;
    if (key !== (process.env.SYNC_KEY ?? 'garageinn_sync_2026'))
      return res.status(401).json({ error: 'Chave inválida' });

    const { unit, product, value, date } = req.body ?? {};
    if (!unit || !product || !value || !date)
      return res.status(400).json({ error: 'unit, product, value e date são obrigatórios' });

    const result = db.prepare(
      'DELETE FROM sales WHERE rowid = (SELECT rowid FROM sales WHERE unit=? AND product=? AND value=? AND date=? LIMIT 1)'
    ).run(unit, product, parseFloat(value), date);

    if (result.changes) notify();
    res.json({ ok: true, deleted: result.changes });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/sales/delete-by-id', (req, res) => {
  try {
    const key = req.headers['x-sync-key'] ?? req.body?.key;
    if (key !== (process.env.SYNC_KEY ?? 'garageinn_sync_2026'))
      return res.status(401).json({ error: 'Chave inválida' });

    const { id } = req.body ?? {};
    if (!id) return res.status(400).json({ error: 'id é obrigatório' });

    const result = db.prepare('DELETE FROM sales WHERE id = ?').run(id);
    if (result.changes) notify();
    res.json({ ok: true, deleted: result.changes });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/sales/insert', (req, res) => {
  try {
    const key  = req.headers['x-sync-key'] ?? req.body?.key;
    const expected = process.env.SYNC_KEY ?? 'garageinn_sync_2026';
    if (key !== expected) return res.status(401).json({ error: 'Chave inválida' });

    const sales = Array.isArray(req.body?.sales) ? req.body.sales : [req.body];
    const inserted = [];
    for (const s of sales) {
      const { unit, product, value, date, order_id, plan_name, customer_cpf } = s;
      if (!unit || !product || !value || !date || !order_id) continue;
      insertSale(db, { unit, product, value: parseFloat(value), date, order_id, plan_name, customer_cpf });
      inserted.push({ unit, product, value, date, order_id, plan_name, customer_cpf });
    }
    if (inserted.length) notify();
    res.json({ ok: true, inserted: inserted.length, sales: inserted });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Backfill de customer_cpf em vendas já existentes
app.post('/api/sales/update-cpf', (req, res) => {
  try {
    const key = req.headers['x-sync-key'] ?? req.body?.key;
    if (key !== (process.env.SYNC_KEY ?? 'garageinn_sync_2026'))
      return res.status(401).json({ error: 'Chave inválida' });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const updated = backfillCustomerCpf(db, rows);
    if (updated > 0) notify();
    res.json({ ok: true, updated });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Pagamentos negados — armazena para cálculo de taxa de conversão
app.post('/api/denied/insert', (req, res) => {
  try {
    const key = req.headers['x-sync-key'] ?? req.body?.key;
    if (key !== (process.env.SYNC_KEY ?? 'garageinn_sync_2026'))
      return res.status(401).json({ error: 'Chave inválida' });

    const denied = Array.isArray(req.body?.denied) ? req.body.denied : [req.body];
    let inserted = 0;
    for (const d of denied) {
      if (!d.order_id) continue;
      insertDenied(db, d);
      inserted++;
    }
    if (inserted > 0) notify();
    res.json({ ok: true, inserted });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Backfill: preenche plan_name em vendas antigas a partir de e-mails reprocessados
app.post('/api/sales/backfill-plan-names', (req, res) => {
  try {
    const key = req.headers['x-sync-key'] ?? req.body?.key;
    if (key !== (process.env.SYNC_KEY ?? 'garageinn_sync_2026'))
      return res.status(401).json({ error: 'Chave inválida' });

    const sales = Array.isArray(req.body?.sales) ? req.body.sales : [];
    const result = backfillPlanNames(db, sales);
    if (result.total > 0) notify();
    res.json({ ok: true, ...result });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Rotas públicas (login + cadastro por convite) ─────────────────────────────
app.get('/login', (_req, res) => res.sendFile(path.join(FRONTEND, 'login.html')));

app.get('/cadastro', (_req, res) => res.sendFile(path.join(FRONTEND, 'register.html')));

// Valida token antes de mostrar o formulário de cadastro
app.get('/api/invite/:token', (req, res) => {
  const r = validateInvite(req.params.token);
  res.status(r.ok ? 200 : 400).json(r);
});

// Cadastro via convite
app.post('/api/register', (req, res) => {
  const { token, username, password, displayName } = req.body ?? {};
  if (!token || !username || !password)
    return res.status(400).json({ error: 'token, username e password são obrigatórios' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
  const r = registerWithInvite(token, username, password, displayName);
  res.status(r.ok ? 201 : 400).json(r);
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
  const result = verifyUser(username, password);
  if (!result.ok) return res.status(401).json({ error: result.error });
  req.session.user = result.user;
  res.json({ ok: true, user: result.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── Rotas protegidas ──────────────────────────────────────────────────────────
app.use(requireAuth);
app.use(express.static(FRONTEND));

app.get('/api/me', (req, res) => res.json({ user: req.session.user }));

// Lista vendas de uma data especifica (debug)
app.get('/api/sales/by-date', (req, res) => {
  if (req.session.user?.username !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: 'date é obrigatório' });
  const rows = db.prepare('SELECT id, date, unit, product, value, order_id, created_at FROM sales WHERE date = ? ORDER BY id').all(date);
  res.json({ rows });
});

// Lista grupos de vendas duplicadas (mesma data/unidade/produto/valor/order_id)
app.get('/api/sales/duplicates', (req, res) => {
  if (req.session.user?.username !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  const rows = db.prepare(`
    SELECT date, unit, product, value, order_id, COUNT(*) AS cnt
    FROM sales
    GROUP BY date, unit, product, value, order_id
    HAVING COUNT(*) > 1
    ORDER BY date DESC
  `).all();
  res.json({ duplicates: rows });
});

app.get('/api/dashboard', (_req, res) => res.json(buildPayload()));

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`data: ${JSON.stringify(buildPayload())}\n\n`);
  subscribers.add(res);
  const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch (_) {} }, 25000);
  req.on('close', () => { clearInterval(hb); subscribers.delete(res); });
});

// ── Gestão de usuários (apenas admin via API local) ──────────────────────────
app.get('/api/users', (_req, res) => res.json(listUsers()));

// Gerar link de convite
app.post('/api/invite', (req, res) => {
  const { token, expiresAt } = generateInvite();
  const host = `${req.protocol}://${req.get('host')}`;
  res.json({ link: `${host}/cadastro?token=${token}`, expiresAt });
});

// Listar convites
app.get('/api/invites', (_req, res) => res.json(listInvites()));

app.post('/api/users', (req, res) => {
  const { username, password, displayName } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'username e password são obrigatórios' });
  const r = createUser(username, password, displayName);
  if (!r.ok) return res.status(409).json({ error: r.error });
  res.status(201).json({ ok: true, message: `Usuário "${username}" criado` });
});

app.delete('/api/users/:username', (req, res) => {
  const r = deleteUser(req.params.username);
  if (!r.ok) return res.status(404).json({ error: r.error });
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = Number(process.env.PORT ?? 5000);
  startWatcher(onNewSale);
  app.listen(PORT, () => {
    console.log(`\nDashboard: http://localhost:${PORT}`);
    console.log(`Login:     http://localhost:${PORT}/login\n`);
  });
}
