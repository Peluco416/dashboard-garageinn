import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { initDb, insertSale, getMonthlyTotals, getDailyKpis,
         getUnitRankings, getProductTotals, getBannerData } from '../backend/data_store.js';

function tmpDb() {
  const p = path.join(os.tmpdir(), `test_${Date.now()}.db`);
  const db = initDb(p);
  return { db, cleanup: () => { db.close(); try { fs.unlinkSync(p); } catch (_) {} } };
}

describe('initDb', () => {
  it('creates sales table', () => {
    const { db, cleanup } = tmpDb();
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sales'").get();
    assert.ok(row, 'sales table should exist');
    cleanup();
  });
});

describe('insertSale + getDailyKpis', () => {
  it('inserts and aggregates correctly', () => {
    const { db, cleanup } = tmpDb();
    insertSale(db, { date: '2026-05-19', unit: 'BERRINI',  product: 'Carro', value: 1000 });
    insertSale(db, { date: '2026-05-19', unit: 'CUBO',     product: 'Moto',  value: 2000 });
    insertSale(db, { date: '2026-05-18', unit: 'BERRINI',  product: 'Carro', value: 1500 });
    const kpis = getDailyKpis(db, '2026-05-19', '2026-05-18');
    assert.equal(kpis.today_total,     3000);
    assert.equal(kpis.today_ticket,    1500);
    assert.equal(kpis.yesterday_total, 1500);
    assert.equal(kpis.yesterday_ticket,1500);
    cleanup();
  });
});

describe('getMonthlyTotals', () => {
  it('groups by month and year', () => {
    const { db, cleanup } = tmpDb();
    insertSale(db, { date: '2026-05-10', unit: 'BERRINI', product: 'Carro', value: 1000 });
    insertSale(db, { date: '2026-04-10', unit: 'BERRINI', product: 'Moto',  value: 500  });
    const rows = getMonthlyTotals(db, 2026);
    const months = rows.map(r => r.month);
    assert.ok(months.includes('2026-04'));
    assert.ok(months.includes('2026-05'));
    cleanup();
  });
});

describe('getUnitRankings', () => {
  it('orders by month_total desc and computes variation', () => {
    const { db, cleanup } = tmpDb();
    insertSale(db, { date: '2026-05-19', unit: 'BERRINI', product: 'Carro', value: 5000 });
    insertSale(db, { date: '2026-05-18', unit: 'BERRINI', product: 'Carro', value: 4000 });
    insertSale(db, { date: '2026-05-19', unit: 'CUBO',    product: 'Moto',  value: 3000 });
    const rows = getUnitRankings(db, '2026-05', '2026-05-19', '2026-05-18');
    assert.equal(rows[0].unit,          'BERRINI');
    assert.equal(rows[0].month_total,    9000);
    assert.equal(rows[0].today_total,    5000);
    assert.equal(rows[0].yesterday_total,4000);
    assert.equal(rows[0].variation_pct,  25);
    cleanup();
  });
});

describe('getProductTotals', () => {
  it('sums by product within month', () => {
    const { db, cleanup } = tmpDb();
    insertSale(db, { date: '2026-05-19', unit: 'BERRINI',  product: 'Carro', value: 1000 });
    insertSale(db, { date: '2026-05-19', unit: 'CUBO',     product: 'Carro', value: 500  });
    insertSale(db, { date: '2026-05-19', unit: 'IGUATEMI', product: 'Moto',  value: 800  });
    const rows = getProductTotals(db, '2026-05');
    const byProd = Object.fromEntries(rows.map(r => [r.product, r.total]));
    assert.equal(byProd['Carro'], 1500);
    assert.equal(byProd['Moto'],   800);
    cleanup();
  });
});

describe('getBannerData', () => {
  it('computes variation_pct and variation_value', () => {
    const { db, cleanup } = tmpDb();
    insertSale(db, { date: '2026-05-10', unit: 'BERRINI', product: 'Carro', value: 1000 });
    insertSale(db, { date: '2026-04-10', unit: 'BERRINI', product: 'Carro', value: 800  });
    const r = getBannerData(db, '2026-05', '2026-04');
    assert.equal(r.current_total,   1000);
    assert.equal(r.previous_total,   800);
    assert.equal(r.variation_pct,     25);
    assert.equal(r.variation_value,  200);
    cleanup();
  });
});
