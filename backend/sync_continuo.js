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
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '..', 'sync_state.json');
const LOG_FILE   = path.join(__dirname, '..', 'sync_continuo.log');
const DB_PATH    = process.env.DB_PATH ?? path.join(__dirname, 'sales.db');

const CHROME     = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const RAILWAY    = process.env.RAILWAY_URL  ?? 'https://dashboard-garageinn-production.up.railway.app';
const SYNC_KEY   = process.env.SYNC_KEY     ?? 'garageinn_sync_2026';
const WEBMAIL    = 'https://titan.hostgator.com.br/mail/';
const TITAN_USER = process.env.IMAP_USER     ?? 'loja@garageinn.online';
const TITAN_PASS = process.env.IMAP_PASSWORD ?? 'L@j3Gin8f2w5';
const INTERVALO  = 3 * 60 * 1000; // 3 minutos
const MAX_CYCLES = 20; // ~1h — reinicia o processo periodicamente para evitar sessão/DOM travados

// Loga no console e em arquivo (o processo roda em segundo plano sem console visível)
function log(msg) {
  const line = `[${new Date().toLocaleString('pt-BR')}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, line + '\n'); } catch (_) {}
}

function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); }
  catch { return { lastSyncDate: '2026-05-21', seen: [] }; }
}
function saveState(s) { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

function isRecentEmail(timeHint) {
  return /\d+:\d+\s*(am|pm)/i.test(timeHint);
}

/** Detecta se a sessão do webmail ainda está ativa (não caiu para tela de login). */
async function isLoggedIn(page) {
  const url = page.url();
  if (url.includes('/login') || !url.includes('/mail/')) return false;
  const pwField = await page.$('input[type="password"]').catch(() => null);
  return !pwField;
}

/**
 * Fecha o browser e garante que a árvore de processos do Chrome morre de verdade.
 * browser.close() sozinho já deixou processos orfãos (crashpad/gpu/renderer) presos
 * no Windows em restarts anteriores, que foram se acumulando até derrubar a máquina
 * e travar todas as navegações seguintes em timeout — daí o "taskkill /T /F" extra.
 */
async function killBrowser(browser) {
  try { await browser.close(); } catch (_) {}
  try {
    const pid = browser.process()?.pid;
    if (pid) execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
  } catch (_) {}
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
    log(`[sync] ✅ Railway: ${data.inserted} venda(s) registrada(s)`);
  } catch(e) {
    log(`[sync] ❌ Erro Railway: ${e.message}`);
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
    log(`[sync] ⚠️ Railway: ${data.inserted} pagamento(s) negado(s) registrado(s)`);
  } catch(e) {
    log(`[sync] ❌ Erro Railway (denied): ${e.message}`);
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

    if (!(await isLoggedIn(page))) {
      // Sessão caiu para tela de login: falha alto e deixa o processo reiniciar do zero
      // (relogar na mesma página já se mostrou pouco confiável — melhor um processo novo)
      throw new Error('Sessão do webmail perdida (caiu para tela de login)');
    }

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

    if (!novos.length) return { sales, denied };

    log(`[sync] 📬 ${novos.length} e-mail(s) novo(s) encontrado(s)`);

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
          log(`[sync] 💰 ${email.subject} → ${sale.unit} | ${sale.product} | R$${sale.value}`);
          sales.push(sale);
        } else if (denied_) {
          log(`[sync] ❌ ${email.subject} → negado | ${denied_.unit} | ${denied_.customer_cpf ?? 'sem CPF'}`);
          denied.push(denied_);
        }
        if (orderNum) state.seen.push(orderNum);
      } catch(e) {
        if (orderNum) state.seen.push(orderNum);
        log(`[sync] Erro ao processar ${email.subject}: ${e.message}`);
      }
    }
  } catch(e) {
    if (/Sessão do webmail perdida/.test(e.message)) throw e; // deixa propagar — não é um erro recuperável in-place
    log(`[sync] Erro ao verificar e-mails: ${e.message}`);
  }
  return { sales, denied };
}

async function login(page) {
  await page.goto(WEBMAIL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  const url = page.url();
  if (url.includes('/mail/') && !url.includes('/login')) {
    log('[sync] Sessão ativa, já logado.');
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
    log('[sync] Login realizado.');
    return true;
  } catch(e) {
    log(`[sync] Falha no login: ${e.message}`);
    return false;
  }
}

async function main() {
  log('[sync] ═══════════════════════════════════════');
  log('[sync]  MONITOR CONTÍNUO — GarageINN Dashboard');
  log(`[sync]  Verificando a cada ${INTERVALO/60000} minutos`);
  log('[sync] ═══════════════════════════════════════');

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
    await killBrowser(browser);
    log('[sync] Não foi possível fazer login. Encerrando (processo será reiniciado pelo PM2).');
    process.exit(1);
  }

  // Loop com número de ciclos limitado: a cada ~1h o processo se encerra de propósito
  // e o PM2 sobe uma instância nova (browser + login do zero), evitando sessão/DOM travados
  // por muito tempo — foi exatamente isso que causou vendas de um dia inteiro não sincronizarem.
  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    const state = loadState();
    const now   = new Date().toLocaleTimeString('pt-BR');
    log(`[sync] 🔍 Verificando... ${now} (ciclo ${cycle}/${MAX_CYCLES})`);

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
        log(`[sync] ✓ Sem novidades. Próxima verificação em ${INTERVALO/60000} min.`);
        saveState(state);
      }
    } catch(e) {
      log(`[sync] 🔴 Erro no ciclo (provável sessão perdida): ${e.message}`);
      log('[sync] Encerrando processo para reinício limpo pelo PM2.');
      await killBrowser(browser);
      process.exit(1);
    }

    await new Promise(r => setTimeout(r, INTERVALO));
  }

  log('[sync] Reinício periódico programado — encerrando para renovar sessão/browser.');
  await killBrowser(browser);
  process.exit(0);
}

main().catch(async e => {
  log(`[sync] Erro fatal: ${e.message}`);
  process.exit(1);
});
