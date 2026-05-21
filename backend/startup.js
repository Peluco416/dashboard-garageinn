/**
 * Executado antes do servidor iniciar.
 * 1. Garante diretório de dados
 * 2. Cria usuário admin se não existir
 * 3. Importa dados históricos se o banco estiver vazio
 */
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Garante diretório de dados (importante no Railway)
const DATA_DIR = process.env.DATA_DIR;
if (DATA_DIR) {
  mkdirSync(DATA_DIR, { recursive: true });
  console.log(`[startup] DATA_DIR: ${DATA_DIR}`);
}

const { listUsers, createUser } = await import('./auth.js');
const { initDb, insertSale } = await import('./data_store.js');

// ── Usuário admin ─────────────────────────────────────────────────────────────
if (listUsers().length === 0) {
  const adminPass = process.env.ADMIN_PASSWORD ?? 'Admin@2026';
  createUser('admin', adminPass, 'Administrador GarageINN');
  console.log(`[startup] Usuário admin criado. Login: admin / Senha: ${adminPass}`);
}

// ── Seed histórico ────────────────────────────────────────────────────────────
const dbPath  = process.env.DB_PATH ?? path.join(DATA_DIR ?? __dirname, 'sales.db');
const db      = initDb(dbPath);
const count   = db.prepare('SELECT COUNT(*) AS n FROM sales').get().n;

if (count === 0) {
  // Tenta importar de email_import.json (dados históricos reais)
  const seedFile = path.join(__dirname, 'email_import.json');
  if (existsSync(seedFile)) {
    const emails = JSON.parse(readFileSync(seedFile, 'utf8'));
    let imported = 0;
    for (const { unit, product, value, date } of emails) {
      try { insertSale(db, { unit, product, value, date }); imported++; } catch(_) {}
    }
    console.log(`[startup] ${imported} vendas históricas importadas de email_import.json`);
  } else {
    console.log('[startup] email_import.json não encontrado — banco iniciando vazio');
  }
} else {
  console.log(`[startup] Banco já tem ${count} registros — seed ignorado`);
}

db.close();
console.log('[startup] Pronto.');
