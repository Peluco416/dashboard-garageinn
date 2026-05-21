/**
 * Script one-shot: conecta ao IMAP, busca TODOS os e-mails de pagamento
 * confirmado Vindi, exibe o conteúdo real e insere as vendas no banco.
 *
 * Uso: node backend/fetch_emails.js
 */
import 'dotenv/config';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { initDb, insertSale } from './data_store.js';
import { parseSaleEmail } from './email_reader.js';

const host    = process.env.IMAP_HOST           ?? 'titan.hostgator.com.br';
const port    = Number(process.env.IMAP_PORT    ?? 993);
const user    = process.env.IMAP_USER           ?? '';
const pwd     = process.env.IMAP_PASSWORD       ?? '';
const folder  = process.env.IMAP_FOLDER         ?? 'INBOX';
const subject = process.env.IMAP_SUBJECT_FILTER ?? 'Vindi - Pagamento confirmado';
const dbPath  = process.env.DB_PATH             ?? 'backend/sales.db';

const db = initDb(dbPath);
let inserted = 0;
let failed   = 0;

function fetchAll() {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user, password: pwd, host, port, tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 20000, authTimeout: 20000,
    });

    imap.once('ready', () => {
      imap.openBox(folder, true, (err) => {
        if (err) { imap.end(); return reject(err); }

        // Busca TODOS os e-mails com o assunto (sem filtro de data)
        imap.search([['SUBJECT', subject]], (err, uids) => {
          if (err) { imap.end(); return reject(err); }
          if (!uids?.length) {
            console.log(`\nNenhum e-mail encontrado com assunto: "${subject}"`);
            imap.end(); return resolve();
          }

          console.log(`\n📬 ${uids.length} e-mail(s) encontrado(s). Processando...\n`);
          console.log('='.repeat(70));

          const f = imap.fetch(uids, { bodies: '', struct: true });
          let idx = 0;

          f.on('message', (msg) => {
            idx++;
            const num = idx;
            const chunks = [];

            msg.on('body', stream => stream.on('data', c => chunks.push(c)));
            msg.once('end', () => {
              simpleParser(Buffer.concat(chunks))
                .then(parsed => {
                  const subject_line = parsed.subject ?? '(sem assunto)';
                  const from         = parsed.from?.text ?? '(remetente desconhecido)';
                  const date_recv    = parsed.date?.toLocaleDateString('pt-BR') ?? '?';
                  const bodyText     = parsed.text ?? '';
                  const bodyHtml     = parsed.html ?? '';

                  console.log(`\n📧 E-mail #${num}`);
                  console.log(`   De:      ${from}`);
                  console.log(`   Assunto: ${subject_line}`);
                  console.log(`   Data:    ${date_recv}`);
                  console.log('\n   --- Corpo (texto) ---');
                  console.log((bodyText || '(sem texto puro)').slice(0, 800));
                  if (!bodyText && bodyHtml) {
                    // Extrai texto do HTML removendo tags
                    const plain = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    console.log('   (extraído do HTML):');
                    console.log(plain.slice(0, 800));
                  }
                  console.log('\n   --- Parse ---');

                  const content = bodyText || bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
                  const sale = parseSaleEmail(content);

                  if (sale) {
                    console.log(`   ✅ Venda parseada: Unidade=${sale.unit} | Produto=${sale.product} | Valor=R$${sale.value} | Data=${sale.date}`);
                    try {
                      insertSale(db, sale);
                      inserted++;
                    } catch (e) {
                      console.log(`   ⚠️  Erro ao inserir: ${e.message}`);
                    }
                  } else {
                    console.log('   ❌ Não foi possível parsear (verifique o formato acima)');
                    failed++;
                  }
                  console.log('='.repeat(70));
                })
                .catch(e => console.error(`   Erro ao parsear e-mail #${num}:`, e.message));
            });
          });

          f.once('error', e => { console.error('Fetch error:', e); imap.end(); });
          f.once('end',   () => { imap.end(); resolve(); });
        });
      });
    });

    imap.once('error', e => reject(e));
    imap.connect();
  });
}

console.log(`Conectando a ${host}:${port} como ${user}...`);

fetchAll()
  .then(() => {
    console.log(`\n📊 Resultado:`);
    console.log(`   ✅ Vendas inseridas: ${inserted}`);
    console.log(`   ❌ Não parseados:    ${failed}`);
    if (failed > 0) {
      console.log('\n💡 Dica: Copie o corpo de um e-mail acima e ajuste o parser em backend/email_reader.js');
    }
    db.close();
    process.exit(0);
  })
  .catch(e => {
    console.error('\n❌ Erro de conexão IMAP:', e.message);
    console.log('\nVerifique no .env:');
    console.log('  IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASSWORD');
    db.close();
    process.exit(1);
  });
