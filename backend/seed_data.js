import { initDb, insertSale } from './data_store.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UNITS    = ['ACYR','ATRIUM II','BERRINI','COMOLATTI','CUBO',
                  'IGUATEMI','JF100','JK28','MYKONOS','PARAISO'];
const PRODUCTS = ['Carro','Moto','Bicicleta','Selos'];
const PROD_W   = [0.35, 0.28, 0.22, 0.15];

// Meta mensal por unidade — Mai/2026 (mês atual)
const MAY_TARGET = {
  BERRINI:98200, IGUATEMI:87500, CUBO:73900, 'JK28':62100,
  PARAISO:54300, MYKONOS:43200, 'ATRIUM II':35700, 'JF100':25400,
  ACYR:18900, COMOLATTI:14200,
};

// Totais históricos Jan–Abr
const HISTORY = {
  '2026-01': 620000, '2026-02': 710000,
  '2026-03': 790000, '2026-04': 830000,
};

// Valores hoje (19/05) — somam 42.180
const TODAY_VALS = {
  BERRINI:8050, IGUATEMI:7200, CUBO:6080, 'JK28':5100,
  PARAISO:4470, MYKONOS:3540, 'ATRIUM II':2950, 'JF100':2100,
  ACYR:1560, COMOLATTI:1130,
};

// Valores ontem (18/05) — somam 35.860
const YESTERDAY_VALS = {
  BERRINI:6920, IGUATEMI:6170, CUBO:5430, 'JK28':4820,
  PARAISO:4040, MYKONOS:3800, 'ATRIUM II':3310, 'JF100':2560,
  ACYR:2100, COMOLATTI:1710,
};
// Ajuste fino para bater 35.860
const yestSum = Object.values(YESTERDAY_VALS).reduce((a,b) => a+b, 0);
const yestScale = 35860 / yestSum;
for (const k of Object.keys(YESTERDAY_VALS)) YESTERDAY_VALS[k] = YESTERDAY_VALS[k] * yestScale;

// PRNG determinístico simples (LCG)
let seed = 42;
function rand() { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; }
function randRange(lo, hi) { return lo + rand() * (hi - lo); }
function pickProduct() {
  const r = rand();
  let acc = 0;
  for (let i = 0; i < PRODUCTS.length; i++) {
    acc += PROD_W[i];
    if (r < acc) return PRODUCTS[i];
  }
  return PRODUCTS[PRODUCTS.length - 1];
}

function genSales(db, date, unit, target, lo = 400, hi = 2800) {
  let rem = target;
  while (rem > hi) {
    const v = +randRange(lo, Math.min(hi, rem * 0.6)).toFixed(2);
    insertSale(db, { date, unit, product: pickProduct(), value: v });
    rem -= v;
  }
  if (rem > 10) insertSale(db, { date, unit, product: pickProduct(), value: +rem.toFixed(2) });
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function runSeed(dbPath = path.join(__dirname, 'sales.db')) {
  const db = initDb(dbPath);

  // Jan–Abr: distribuição uniforme
  for (const [month, total] of Object.entries(HISTORY)) {
    const [y, m] = month.split('-').map(Number);
    const days   = daysInMonth(y, m);
    const daily  = total / days / UNITS.length;
    for (let d = 1; d <= days; d++) {
      const date = `${month}-${String(d).padStart(2,'0')}`;
      for (const unit of UNITS) {
        genSales(db, date, unit, daily * randRange(0.6, 1.4));
      }
    }
  }

  // Mai dias 1–17 (proporcional às metas mensais)
  for (let d = 1; d <= 17; d++) {
    const date = `2026-05-${String(d).padStart(2,'0')}`;
    for (const unit of UNITS) {
      genSales(db, date, unit, MAY_TARGET[unit] / 19 * randRange(0.7, 1.3));
    }
  }

  // Ontem (18/05)
  for (const [unit, val] of Object.entries(YESTERDAY_VALS)) {
    genSales(db, '2026-05-18', unit, val);
  }

  // Hoje (19/05)
  for (const [unit, val] of Object.entries(TODAY_VALS)) {
    genSales(db, '2026-05-19', unit, val);
  }

  db.close();
  console.log(`Seed OK → ${dbPath}`);
}

runSeed();
