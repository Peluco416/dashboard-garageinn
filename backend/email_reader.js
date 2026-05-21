import Imap from 'imap';
import { simpleParser } from 'mailparser';
import 'dotenv/config';

// Palavras-chave do produto no texto do e-mail → nome padronizado
const PRODUCT_KEYWORDS = [
  { keys: ['carro', 'car '],           name: 'Carro'     },
  { keys: ['moto', 'motociclet'],       name: 'Moto'      },
  { keys: ['bicicleta', 'bike', 'bici'],name: 'Bicicleta' },
  { keys: ['selo'],                     name: 'Selos'     },
];

/**
 * Extrai a unidade do assunto do e-mail.
 * Formato: "Garage Inn - SP1 - Pedido nº 6070"
 * Retorna "SP1", "SP2", "Barueri1", etc.
 */
function extractUnit(subject) {
  // "Garage Inn - UNIT - Pedido nº N"
  const m = subject.match(/Garage Inn\s*-\s*(.+?)\s*-\s*Pedido/i);
  return m ? m[1].trim() : null;
}

/**
 * Extrai o produto da linha de produto do e-mail.
 * Ex: "MENSALISTA NAÇÕES UNIDAS 3 - CARRO" → "Carro"
 */
function extractProduct(text) {
  const lower = text.toLowerCase();
  for (const { keys, name } of PRODUCT_KEYWORDS) {
    if (keys.some(k => lower.includes(k))) return name;
  }
  return null;
}

/**
 * Extrai o valor total do e-mail.
 * Procura "Total: R$ X.XXX,XX" ou "R$ X.XXX,XX" mais próximo de "total"
 */
function extractValue(text) {
  // "Total: R$ 505,00" ou "Total R$ 505,00"
  const mTotal = text.match(/total[:\s]+R\$\s*([\d.,]+)/i);
  if (mTotal) {
    return parseFloat(mTotal[1].replace(/\./g, '').replace(',', '.'));
  }
  // Fallback: qualquer valor R$
  const mAny = text.match(/R\$\s*([\d.,]+)/i);
  if (mAny) {
    return parseFloat(mAny[1].replace(/\./g, '').replace(',', '.'));
  }
  return null;
}

/**
 * Extrai a data do e-mail.
 * "Data do pedido: 20/05/2026 21:29" → "2026-05-20"
 */
function extractDate(text) {
  const m = text.match(/Data do pedido[:\s]+(\d{2})\/(\d{2})\/(\d{4})/i);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Fallback: qualquer data DD/MM/YYYY
  const m2 = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  return new Date().toISOString().slice(0, 10);
}

/**
 * Parseia um e-mail de pedido GarageINN.
 * Só processa se "Situação do pedido: Vindi - Pagamento confirmado" estiver no corpo.
 * Retorna { unit, product, value, date } ou null.
 */
export function parseSaleEmail(body, subject = '') {
  // Só processa pagamentos confirmados
  if (!body.toLowerCase().includes('vindi - pagamento confirmado')) return null;

  const unit    = extractUnit(subject || body);
  const product = extractProduct(body);
  const value   = extractValue(body);
  const date    = extractDate(body);

  if (!unit || !product || !value || value <= 0) return null;

  return { unit, product, value, date };
}

/**
 * Inicia o watcher IMAP em background.
 * Filtra e-mails com assunto "Garage Inn" e corpo "Vindi - Pagamento confirmado".
 * Chama onNewSale({ unit, product, value, date }) para cada venda válida.
 */
export function startWatcher(onNewSale, pollIntervalMs = 30000) {
  const host    = process.env.IMAP_HOST           ?? 'titan.hostgator.com.br';
  const port    = Number(process.env.IMAP_PORT    ?? 993);
  const user    = process.env.IMAP_USER           ?? 'loja@garageinn.online';
  const pwd     = process.env.IMAP_PASSWORD       ?? 'L@j3Gin8f2w5';
  const folder  = process.env.IMAP_FOLDER         ?? 'INBOX';
  const subject = process.env.IMAP_SUBJECT_FILTER ?? 'Garage Inn';

  // Valida host — não usar se for um caminho de arquivo (erro de config)
  if (host.startsWith('/') || host.includes('sales.db')) {
    console.log('[email] IMAP_HOST inválido, usando default: titan.hostgator.com.br');
  }
  const safeHost = (host.startsWith('/') || host.includes('.db')) ? 'titan.hostgator.com.br' : host;

  console.log(`[email] Conectando IMAP → ${safeHost}:${port} como ${user}`);
  console.log(`[email] Filtro: assunto="${subject}" + body="Vindi - Pagamento confirmado"`);

  const seen = new Set();
  let timer;
  let stopped = false;

  function poll() {
    if (stopped) return;
    const imap = new Imap({
      user, password: pwd, host: safeHost, port, tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 15000, authTimeout: 15000,
    });

    imap.once('ready', () => {
      imap.openBox(folder, true, (err) => {
        if (err) { imap.end(); return; }
        imap.search([['SUBJECT', subject]], (err, uids) => {
          if (err || !uids?.length) { imap.end(); return; }
          const newUids = uids.filter(uid => !seen.has(String(uid)));
          if (!newUids.length) { imap.end(); return; }

          const f = imap.fetch(newUids, { bodies: '' });
          f.on('message', (msg, seqno) => {
            seen.add(String(newUids[seqno - 1] ?? seqno));
            const chunks = [];
            msg.on('body', s => s.on('data', c => chunks.push(c)));
            msg.once('end', () => {
              simpleParser(Buffer.concat(chunks)).then(parsed => {
                const text = parsed.text ?? parsed.html?.replace(/<[^>]+>/g,' ') ?? '';
                const subj = parsed.subject ?? '';
                const sale = parseSaleEmail(text, subj);
                if (sale) {
                  console.log(`[email] Nova venda: ${subj} → ${JSON.stringify(sale)}`);
                  onNewSale(sale);
                }
              }).catch(() => {});
            });
          });
          f.once('end', () => imap.end());
        });
      });
    });
    imap.once('error', e => console.error('[email] IMAP error:', e.message));
    imap.connect();
  }

  function schedule() {
    if (!stopped) timer = setTimeout(() => { poll(); schedule(); }, pollIntervalMs);
  }
  poll(); schedule();
  return () => { stopped = true; clearTimeout(timer); };
}
