import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = process.env.DATA_DIR ?? (process.env.NODE_ENV === 'production' ? '/data' : __dirname);

const DEFAULT_DB = path.join(DATA_DIR, 'sales.db');

export function initDb(dbPath = DEFAULT_DB) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT NOT NULL,
      unit       TEXT NOT NULL,
      product    TEXT NOT NULL,
      value      REAL NOT NULL,
      order_id   TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_date ON sales(date);
    CREATE INDEX IF NOT EXISTS idx_unit ON sales(unit);
  `);
  // Migração: adiciona order_id e índice único em bancos já existentes
  const cols = db.prepare("PRAGMA table_info(sales)").all();
  if (!cols.some(c => c.name === 'order_id')) {
    db.exec('ALTER TABLE sales ADD COLUMN order_id TEXT');
  }
  if (!cols.some(c => c.name === 'plan_name')) {
    db.exec('ALTER TABLE sales ADD COLUMN plan_name TEXT');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_order_id ON sales(order_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_plan_name ON sales(plan_name)');
  return db;
}

export function insertSale(db, { date, unit, product, value, order_id, plan_name }) {
  db.prepare('INSERT OR IGNORE INTO sales (date, unit, product, value, order_id, plan_name) VALUES (?, ?, ?, ?, ?, ?)')
    .run(date, unit, product, value, order_id ?? null, plan_name ?? null);
}

export function getMonthlyTotals(db, year) {
  return db.prepare(`
    SELECT strftime('%Y-%m', date) AS month, SUM(value) AS total
    FROM sales
    WHERE strftime('%Y', date) = ?
    GROUP BY month
    ORDER BY month
  `).all(String(year));
}

export function getDailyKpis(db, today, yesterday) {
  const stats = (date) => {
    const r = db.prepare(
      'SELECT SUM(value) AS total, COUNT(*) AS cnt FROM sales WHERE date = ?'
    ).get(date);
    const total  = r.total ?? 0;
    const cnt    = r.cnt   ?? 0;
    return { total, count: cnt, ticket: cnt > 0 ? total / cnt : 0 };
  };
  const t = stats(today);
  const y = stats(yesterday);
  return {
    today_total:      +t.total.toFixed(2),
    today_count:      t.count,
    today_ticket:     +t.ticket.toFixed(2),
    yesterday_total:  +y.total.toFixed(2),
    yesterday_count:  y.count,
    yesterday_ticket: +y.ticket.toFixed(2),
  };
}

export function getWeeklyPeriodComparison(db, today) {
  // today = 'YYYY-MM-DD'
  const d = new Date(today + 'T12:00:00');
  const dow = d.getDay(); // 0=Dom, 1=Seg, ..., 6=Sáb

  const addDays = (date, n) => {
    const r = new Date(date);
    r.setDate(r.getDate() + n);
    return r.toISOString().slice(0, 10);
  };

  // Domingo desta semana
  const curStart = addDays(today, -dow);
  const curEnd   = today;

  // Mesmo período na semana anterior
  const prevStart = addDays(curStart, -7);
  const prevEnd   = addDays(curEnd, -7);

  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN date BETWEEN ? AND ? THEN value END), 0) AS cur_total,
      COALESCE(COUNT(CASE WHEN date BETWEEN ? AND ? THEN 1 END),   0) AS cur_count,
      COALESCE(SUM(CASE WHEN date BETWEEN ? AND ? THEN value END), 0) AS prev_total,
      COALESCE(COUNT(CASE WHEN date BETWEEN ? AND ? THEN 1 END),   0) AS prev_count
    FROM sales
  `).get(curStart, curEnd, curStart, curEnd, prevStart, prevEnd, prevStart, prevEnd);

  const curT  = row.cur_total  ?? 0;
  const prevT = row.prev_total ?? 0;
  const curC  = row.cur_count  ?? 0;
  const prevC = row.prev_count ?? 0;
  const varPct = prevT > 0 ? +((curT - prevT) / prevT * 100).toFixed(1) : 0;

  const fmtBR = (s) => { const [y,m,d2] = s.split('-'); return `${d2}/${m}`; };
  const DAYS  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  return {
    current_total:   +curT.toFixed(2),
    current_count:   curC,
    current_ticket:  curC > 0 ? +(curT / curC).toFixed(2) : 0,
    prev_total:      +prevT.toFixed(2),
    prev_count:      prevC,
    prev_ticket:     prevC > 0 ? +(prevT / prevC).toFixed(2) : 0,
    variation_pct:   varPct,
    variation_value: +(curT - prevT).toFixed(2),
    current_start:   curStart,
    current_end:     curEnd,
    prev_start:      prevStart,
    prev_end:        prevEnd,
    period_label:    `Dom ${fmtBR(curStart)} → ${DAYS[dow]} ${fmtBR(curEnd)}`,
    prev_label:      `Dom ${fmtBR(prevStart)} → ${DAYS[dow]} ${fmtBR(prevEnd)}`,
    days_count:      dow + 1,
  };
}

export function getUnitRankings(db, month, today, yesterday) {
  const rows = db.prepare(`
    SELECT
      unit,
      SUM(value)                                        AS month_total,
      COUNT(*)                                          AS month_count,
      SUM(CASE WHEN date = ? THEN value ELSE 0 END)    AS today_total,
      SUM(CASE WHEN date = ? THEN value ELSE 0 END)    AS yesterday_total
    FROM sales
    WHERE strftime('%Y-%m', date) = ?
    GROUP BY unit
    ORDER BY month_total DESC
  `).all(today, yesterday, month);

  return rows.map((r, i) => {
    const t   = r.today_total     ?? 0;
    const y   = r.yesterday_total ?? 0;
    const cnt = r.month_count     ?? 0;
    const varPct = y > 0 ? +((t - y) / y * 100).toFixed(1) : 0;
    return {
      rank:            i + 1,
      unit:            r.unit,
      month_total:     +r.month_total.toFixed(2),
      month_count:     cnt,
      month_ticket:    cnt > 0 ? +(r.month_total / cnt).toFixed(2) : 0,
      today_total:     +t.toFixed(2),
      yesterday_total: +y.toFixed(2),
      variation_pct:   varPct,
    };
  });
}

export function getUnitRankingsAllTime(db) {
  const rows = db.prepare(`
    SELECT
      unit,
      SUM(value) AS total_value,
      COUNT(*)   AS total_count
    FROM sales
    GROUP BY unit
    ORDER BY total_value DESC
  `).all();

  return rows.map((r, i) => ({
    rank:        i + 1,
    unit:        r.unit,
    total_value: +r.total_value.toFixed(2),
    total_count: r.total_count,
    total_ticket: r.total_count > 0 ? +(r.total_value / r.total_count).toFixed(2) : 0,
  }));
}

// Ranking por mensalista (campo "MENSALISTA ..." extraido do produto do e-mail)
// agrupando todas as vendas com o mesmo nome de plano, em todo o período.
export function getPlanRankingsAllTime(db) {
  const rows = db.prepare(`
    SELECT
      plan_name,
      SUM(value) AS total_value,
      COUNT(*)   AS total_count
    FROM sales
    WHERE plan_name IS NOT NULL
    GROUP BY plan_name
    ORDER BY total_value DESC
  `).all();

  return rows.map((r, i) => ({
    rank:        i + 1,
    plan_name:   r.plan_name,
    total_value: +r.total_value.toFixed(2),
    total_count: r.total_count,
    total_ticket: r.total_count > 0 ? +(r.total_value / r.total_count).toFixed(2) : 0,
  }));
}

// Mesmo ranking por mensalista, restrito ao mês informado ('YYYY-MM')
export function getPlanRankingsMonth(db, month) {
  const rows = db.prepare(`
    SELECT
      plan_name,
      SUM(value) AS total_value,
      COUNT(*)   AS total_count
    FROM sales
    WHERE plan_name IS NOT NULL AND strftime('%Y-%m', date) = ?
    GROUP BY plan_name
    ORDER BY total_value DESC
  `).all(month);

  return rows.map((r, i) => ({
    rank:        i + 1,
    plan_name:   r.plan_name,
    total_value: +r.total_value.toFixed(2),
    total_count: r.total_count,
    total_ticket: r.total_count > 0 ? +(r.total_value / r.total_count).toFixed(2) : 0,
  }));
}

export function getProductTotals(db, month) {
  return db.prepare(`
    SELECT product, SUM(value) AS total
    FROM sales
    WHERE strftime('%Y-%m', date) = ?
    GROUP BY product
    ORDER BY total DESC
  `).all(month);
}

export function getBannerData(db, currentMonth, previousMonth) {
  const sum = (m) => {
    const r = db.prepare(
      "SELECT SUM(value) AS total FROM sales WHERE strftime('%Y-%m', date) = ?"
    ).get(m);
    return r?.total ?? 0;
  };
  const cur  = sum(currentMonth);
  const prev = sum(previousMonth);
  const varPct = prev > 0 ? +((cur - prev) / prev * 100).toFixed(1) : 0;
  return {
    current_total:   +cur.toFixed(2),
    previous_total:  +prev.toFixed(2),
    variation_pct:   varPct,
    variation_value: +(cur - prev).toFixed(2),
  };
}
