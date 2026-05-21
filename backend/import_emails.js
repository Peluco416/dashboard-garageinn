import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, insertSale } from './data_store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath    = process.env.DB_PATH ?? path.join(__dirname, 'sales.db');
const jsonPath  = path.join(__dirname, 'email_import.json');

const emails = JSON.parse(readFileSync(jsonPath, 'utf8'));
const db     = initDb(dbPath);

// Limpa dados antigos (seed fictício)
db.exec('DELETE FROM sales');
console.log('🗑️  Banco limpo.');

let ok = 0;
for (const { unit, product, value, date } of emails) {
  insertSale(db, { unit, product, value, date });
  ok++;
}

db.close();
console.log(`✅ ${ok} vendas reais importadas de ${emails.length} registros.`);

// Resumo por unidade
const db2 = initDb(dbPath);
const rows = db2.prepare(`
  SELECT unit, COUNT(*) AS pedidos, SUM(value) AS total
  FROM sales GROUP BY unit ORDER BY total DESC
`).all();
console.log('\n📊 Resumo por unidade:');
rows.forEach(r => console.log(`  ${r.unit.padEnd(12)} ${r.pedidos} pedidos  R$ ${r.total.toFixed(2)}`));
db2.close();
