/**
 * Importa e-mails reais lidos via Playwright (stdin JSON).
 * Recebe array de { subject, body } e insere as vendas no banco.
 * Uso interno — chamado pelo script de scraping.
 */
import { initDb, insertSale } from './data_store.js';
import { parseSaleEmail } from './email_reader.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath    = process.env.DB_PATH ?? path.join(__dirname, 'sales.db');

// Recebe JSON de stdin: [{ subject, body, date_received }, ...]
let raw = '';
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  const emails = JSON.parse(raw);
  const db = initDb(dbPath);

  // Limpa dados fictícios de seed
  db.exec('DELETE FROM sales');
  console.log('🗑️  Banco limpo. Importando e-mails reais...\n');

  let ok = 0, skip = 0;
  for (const { subject, body } of emails) {
    const sale = parseSaleEmail(body, subject);
    if (sale) {
      insertSale(db, sale);
      ok++;
    } else {
      skip++;
    }
  }

  db.close();
  console.log(`✅ Importados: ${ok} vendas`);
  console.log(`⏭️  Ignorados:  ${skip} (sem pagamento confirmado ou dados insuficientes)`);
});
