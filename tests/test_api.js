import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Point to a temp DB before importing app
const tmpDb = path.join(os.tmpdir(), `api_test_${Date.now()}.db`);
process.env.DB_PATH = tmpDb;

const { app, db, buildPayload } = await import('../backend/app.js');
const { insertSale } = await import('../backend/data_store.js');

before(() => {
  insertSale(db, { date: '2026-05-19', unit: 'BERRINI',  product: 'Carro', value: 2500 });
  insertSale(db, { date: '2026-05-18', unit: 'BERRINI',  product: 'Carro', value: 2000 });
});

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      import('node:http').then(({ default: http }) => {
        http.get(`http://localhost:${port}${path}`, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            server.close();
            resolve({ status: res.statusCode, body: data,
                      type: res.headers['content-type'] });
          });
        }).on('error', (e) => { server.close(); reject(e); });
      });
    });
  });
}

describe('GET /api/dashboard', () => {
  it('returns 200', async () => {
    const r = await httpGet('/api/dashboard');
    assert.equal(r.status, 200);
  });

  it('returns JSON with all required keys', async () => {
    const r    = await httpGet('/api/dashboard');
    const data = JSON.parse(r.body);
    for (const key of ['banner','kpis','monthly_chart','products','top5_best','top5_worst']) {
      assert.ok(key in data, `Missing key: ${key}`);
    }
  });

  it('banner has variation fields', async () => {
    const r      = await httpGet('/api/dashboard');
    const banner = JSON.parse(r.body).banner;
    for (const k of ['current_total','previous_total','variation_pct','variation_value']) {
      assert.ok(k in banner, `Missing banner key: ${k}`);
    }
  });

  it('top5 lists have at most 5 items each', async () => {
    const r    = await httpGet('/api/dashboard');
    const data = JSON.parse(r.body);
    assert.ok(data.top5_best.length  <= 5);
    assert.ok(data.top5_worst.length <= 5);
  });
});

describe('buildPayload', () => {
  it('monthly_chart items have month, total, is_current', () => {
    const payload = buildPayload();
    for (const item of payload.monthly_chart) {
      assert.ok('month'      in item);
      assert.ok('total'      in item);
      assert.ok('is_current' in item);
    }
  });
});
