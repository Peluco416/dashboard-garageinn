import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = process.env.DATA_DIR ?? __dirname;

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
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_date ON sales(date);
    CREATE INDEX IF NOT EXISTS idx_unit ON sales(unit);
  `);
  return db;
}

export function insertSale(db, { date, unit, product, value }) {
  db.prepare('INSERT INTO sales (date, unit, product, value) VALUES (?, ?, ?, ?)')
    .run(date, unit, product, value);
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

export function getWeekdayComparison(db, today, sameWeekdayLastWeek) {
  const stats = (date) => {
    const r = db.prepare(
      'SELECT SUM(value) AS total, COUNT(*) AS cnt FROM sales WHERE date = ?'
    ).get(date);
    const total = r.total ?? 0;
    const cnt   = r.cnt   ?? 0;
    return { total: +total.toFixed(2), count: cnt, ticket: cnt > 0 ? +(total/cnt).toFixed(2) : 0 };
  };
  const t = stats(today);
  const l = stats(sameWeekdayLastWeek);
  const varPct = l.total > 0 ? +((t.total - l.total) / l.total * 100).toFixed(1) : 0;
  return {
    today_total:       t.total,
    today_ticket:      t.ticket,
    lastweek_total:    l.total,
    lastweek_ticket:   l.ticket,
    lastweek_date:     sameWeekdayLastWeek,
    variation_pct:     varPct,
    variation_value:   +(t.total - l.total).toFixed(2),
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
      rank:          i + 1,
      unit:          r.unit,
      month_total:   +r.month_total.toFixed(2),
      month_ticket:  cnt > 0 ? +(r.month_total / cnt).toFixed(2) : 0,
      today_total:   +t.toFixed(2),
      yesterday_total: +y.toFixed(2),
      variation_pct: varPct,
    };
  });
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
