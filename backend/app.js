import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, insertSale, getMonthlyTotals, getDailyKpis,
         getUnitRankings, getProductTotals, getBannerData,
         getWeekdayComparison } from './data_store.js';
import { startWatcher } from './email_reader.js';
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

const todayStr     = () => new Date().toISOString().slice(0,10);
const yesterdayStr = () => { const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); };
const currentMonth = () => todayStr().slice(0,7);
const previousMonth= () => { const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7); };

export function buildPayload() {
  const today     = todayStr();
  const yesterday = yesterdayStr();
  const curMonth  = currentMonth();
  const prevMonth = previousMonth();
  const year      = new Date().getFullYear();

  const banner = getBannerData(db, curMonth, prevMonth);
  const mIdx   = Number(curMonth.split('-')[1])  - 1;
  const pIdx   = Number(prevMonth.split('-')[1]) - 1;
  banner.month_label          = `${MONTH_NAMES[mIdx]}/${year}`;
  banner.previous_month_label = MONTH_NAMES[pIdx];

  const kpis = getDailyKpis(db, today, yesterday);

  const lastWeekDate = new Date();
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);
  const lastWeekStr = lastWeekDate.toISOString().slice(0, 10);
  const weekly = getWeekdayComparison(db, today, lastWeekStr);
  const DAYS_PT = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  weekly.weekday_label = DAYS_PT[new Date().getDay()];

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

  return {
    banner, kpis, weekly, monthly_chart, products,
    top5_best:  rankings.slice(0, 5),
    top5_worst: rankings.slice(-5).reverse(),
  };
}

// ── Webhook Vindi (público — chamado pela Vindi ao confirmar pagamento) ──────
app.post('/api/webhook/vindi', (req, res) => {
  try {
    const body = req.body ?? {};

    // A Vindi envia o evento em body.event.type e os dados em body.event.data
    const eventType = body?.event?.type ?? body?.type ?? '';
    const data      = body?.event?.data ?? body?.data ?? body;

    // Só processa pagamentos confirmados
    const isPayment = eventType.includes('charge') || eventType.includes('payment') ||
                      eventType.includes('bill') || JSON.stringify(body).toLowerCase().includes('paid');

    if (!isPayment) {
      return res.json({ ok: true, skipped: 'evento não é pagamento confirmado' });
    }

    // Extrai o nome do plano (produto) e valor
    const planName  = data?.plan?.name ?? data?.product_items?.[0]?.product?.name ?? data?.subscription?.plan?.name ?? '';
    const amount    = data?.amount ?? data?.bill_items?.[0]?.amount ?? data?.charge?.amount ?? 0;
    const dateRaw   = data?.created_at ?? data?.updated_at ?? new Date().toISOString();
    const date      = dateRaw.slice(0, 10);

    // Detecta produto pelo nome do plano
    const lower = planName.toLowerCase();
    let product = 'Carro';
    if (lower.includes('moto'))                              product = 'Moto';
    else if (lower.includes('bicicleta') || lower.includes('bike')) product = 'Bicicleta';
    else if (lower.includes('selo'))                         product = 'Selos';

    // Detecta unidade pelo nome do plano
    let unit = 'SP1';
    const UNIT_MAP_KEYWORDS = {
      'nações unidas': 'SP1', 'nacoes unidas': 'SP1',
      'martiniano':    'SP2',
      'rebouças':      'SP3', 'reboucas': 'SP3',
      'brasilia':      'DF1', 'brasília': 'DF1',
      'aqwa':          'RJ1',
      'alphaville':    'Barueri1', 'barueri': 'Barueri1',
    };
    for (const [kw, code] of Object.entries(UNIT_MAP_KEYWORDS)) {
      if (lower.includes(kw)) { unit = code; break; }
    }

    const value = parseFloat(amount) / 100; // Vindi envia centavos
    if (!value || value <= 0) {
      return res.json({ ok: true, skipped: 'valor zero ou inválido' });
    }

    insertSale(db, { unit, product, value, date });
    notify();

    console.log(`[webhook] Venda registrada: ${unit} | ${product} | R$${value} | ${date}`);
    res.json({ ok: true, unit, product, value, date });
  } catch(e) {
    console.error('[webhook] Erro:', e.message);
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
