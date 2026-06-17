/**
 * sync_continuo.js — Monitora o webmail continuamente e envia novas vendas
 * para o dashboard em tempo quase real (verifica a cada 3 minutos).
 *
 * Execução: node --use-system-ca backend/sync_continuo.js
 * Inicia junto com o servidor via INICIAR.bat
 */
import puppeteer from 'puppeteer-core';
import 'dotenv/config';
import { parseSaleEmail, parseDeniedEmail } from './email_reader.js';
import { initDb, insertSale, insertDenied } from './data_store.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '..', 'sync_state.json');
const DB_PATH    = process.env.DB_PATH ?? path.join(__dirname, 'sales.db');

const CHROME     = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const RAILWAY    = process.env.RAILWAY_URL  ?? 'https://dashboard-garageinn-production.up.railway.app';
const SYNC_KEY   = process.env.SYNC_KEY     ?? 'garageinn_sync_2026';
const WEBMAIL    = 'https://titan.hostgator.com.br/mail/';
const TITAN_USER = process.env.IMAP_USER     ?? 'loja@garageinn.online';
const TITAN_PASS = process.env.IMAP_PASSWORD ?? 'L@j3Gin8f2w5';
const INTERVALO  = 3 * 60 * 1000; // 3 minutos

function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); }
  catch { return { lastSyncDate: '2026-05-21', seen: [] }; }
}
function saveState(s) { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

function isRecentEmail(timeHint) {
  return /\d+:\d+\s*(am|pm)/i.test(timeHint);
}

async function postToRailway(sales) {
  if (!sales.length) return;
  try {
    const resp = await fetch(`${RAILWAY}/api/sales/insert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-key': SYNC_KEY },
      body: JSON.stringify({ sales }),
    });
    const data = await resp.json();
    console.log(`[sync] ✅ Railway: ${data.inserted} venda(s) registrada(s)`);
  } catch(e) {
    console.error('[sync] ❌ Erro Railway:', e.message);
  }
}

async function postDeniedToRailway(denied) {
  if (!denied.length) return;
  try {
    const resp = await fetch(`${RAILWAY}/api/denied/insert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-key': SYNC_KEY },
      body: JSON.stringify({ denied }),
    });
    const data = await resp.json();
    console.log(`[sync] ⚠️ Railway: ${data.inserted} pagamento(s) negado(s) registrado(s)`);
  } catch(e) {
    console.error('[sync] ❌ Erro Railway (denied):', e.message);
  }
}

async function readEmailBody(page) {
  for (const frame of page.frames()) {
    try {
      const body = await frame.$eval('body', el => el.innerText);
      if (body.includes('Vindi') || body.includes('Total:')) return body;
    } catch {}
  }
  return '';
}

async function checarNovasVendas(page, state) {
  const sales  = [];
  const denied = [];
  try {
    // Recarregar inbox para ver emails novos
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000));

    const emailTexts = await page.evaluate(() => {
      const lines = document.body.innerText.split('\n');
      const emails = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Garage Inn - .+ - Pedido nº \d+$/)) {
          emails.push({ subject: lines[i], timeHint: lines[i - 1] ?? '' });
        }
      }
      return emails;
    });

    const novos = emailTexts.filter(e => {
      const m = e.subject.match(/Pedido nº (\d+)/);
      if (!m) return false;
      if (state.seen.includes(m[1])) return false;
      return process.env.SYNC_ALL === 'true' || isRecentEmail(e.timeHint);
    });

    if (!novos.length) return sales;

    console.log(`[sync] 📬 ${novos.length} e-mail(s) novo(s) encontrado(s)`);

    for (const email of novos) {
      const orderNum = email.subject.match(/Pedido nº (\d+)/)?.[1];
      try {
        await page.evaluate((subject) => {
          const el = [...document.querySelectorAll('*')]
            .find(e => e.innerText?.trim() === subject && e.children.length === 0);
          if (el) el.click();
        }, email.subject);

        await new Promise(r => setTimeout(r, 2000));

        const body = await readEmailBody(page);
        if (!body) continue;

        const sale   = parseSaleEmail(body, email.subject);
        const denied_ = !sale ? parseDeniedEmail(body, email.subject) : null;
        if (sale) {
          console.log(`[sync] 💰 ${email.subject} → ${sale.unit} | ${sale.product} | R$${sale.value}`);
          sales.push(sale);
        } else if (denied_) {
          console.log(`[sync] ❌ ${email.subject} → negado | ${denied_.unit} | ${denied_.customer_cpf ?? 'sem CPF'}`);
          denied.push(denied_);
        }
        if (orderNum) state.seen.push(orderNum);
      } catch(e) {
        if (orderNum) state.seen.push(orderNum);
        console.error(`[sync] Erro ao processar ${email.subject}:`, e.message);
      }
    }
  } catch(e) {
    console.error('[sync] Erro ao verificar e-mails:', e.message);
  }
  return { sales, denied };
}

async function login(page) {
  await page.goto(WEBMAIL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  const url = page.url();
  if (url.includes('/mail/') && !url.includes('/login')) {
    console.log('[sync] Sessão ativa, já logado.');
    return true;
  }

  try {
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });
    await page.type('input[name="email"]', TITAN_USER, { delay: 50 });
    await page.click('button.btn-login, .btn-primary');
    await new Promise(r => setTimeout(r, 2000));
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await page.type('input[type="password"]', TITAN_PASS, { delay: 50 });
    await page.click('button.btn-login, .btn-primary');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 4000));
    console.log('[sync] Login realizado.');
    return true;
  } catch(e) {
    console.error('[sync] Falha no login:', e.message);
    return false;
  }
}

async function main() {
  console.log('[sync] ═══════════════════════════════════════');
  console.log('[sync]  MONITOR CONTÍNUO — GarageINN Dashboard');
  console.log(`[sync]  Verificando a cada ${INTERVALO/60000} minutos`);
  console.log('[sync] ═══════════════════════════════════════');

  const localDb = existsSync(DB_PATH) ? initDb(DB_PATH) : null;

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,720'],
    defaultViewport: { width: 1280, height: 720 },
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36');

  const loggedIn = await login(page);
  if (!loggedIn) {
    await browser.close();
    console.error('[sync] Não foi possível fazer login. Encerrando.');
    process.exit(1);
  }

  // Loop infinito
  while (true) {
    const state = loadState();
    const now   = new Date().toLocaleTimeString('pt-BR');
    console.log(`[sync] 🔍 Verificando... ${now}`);

    try {
      const { sales, denied } = await checarNovasVendas(page, state);

      if (sales.length || denied.length) {
        if (localDb) {
          for (const s of sales)  insertSale(localDb, s);
          for (const d of denied) insertDenied(localDb, d);
        }
        if (sales.length)  await postToRailway(sales);
        if (denied.length) await postDeniedToRailway(denied);
        const allDates = [...sales, ...denied].map(x => x.date).sort();
        const latest = allDates.pop();
        if (latest > state.lastSyncDate) state.lastSyncDate = latest;
        saveState(state);
      } else {
        console.log(`[sync] ✓ Sem novidades. Próxima verificação em ${INTERVALO/60000} min.`);
        saveState(state);
      }
    } catch(e) {
      console.error('[sync] Erro no ciclo:', e.message);
      // Tenta relogar se sessão expirou
      try { await login(page); } catch {}
    }

    await new Promise(r => setTimeout(r, INTERVALO));
  }
}

main().catch(async e => {
  console.error('[sync] Erro fatal:', e.message);
  process.exit(1);
});
