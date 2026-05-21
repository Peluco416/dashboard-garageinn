/**
 * sync_emails.js — Sincroniza e-mails de pedidos do Titan Webmail com o dashboard.
 * Usa Chrome headless para ler os e-mails e envia as vendas para o Railway.
 *
 * Execução: node backend/sync_emails.js
 * Agendar:  via Agendador de Tarefas do Windows
 */
import puppeteer from 'puppeteer-core';
import 'dotenv/config';
import { parseSaleEmail } from './email_reader.js';
import { initDb, insertSale } from './data_store.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '..', 'sync_state.json');
const DB_PATH    = process.env.DB_PATH ?? path.join(__dirname, 'sales.db');

const CHROME     = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const RAILWAY    = process.env.RAILWAY_URL  ?? 'https://dashboard-garageinn-production.up.railway.app';
const SYNC_KEY   = process.env.SYNC_KEY     ?? 'garageinn_sync_2026';
const WEBMAIL    = 'https://titan.hostgator.com.br/mail/';
const TITAN_USER = process.env.IMAP_USER     ?? 'loja@garageinn.online';
const TITAN_PASS = process.env.IMAP_PASSWORD ?? 'L@j3Gin8f2w5';

function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); }
  catch { return { lastSyncDate: '2026-05-20', seen: [] }; }
}

function saveState(s) {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
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
    console.log(`[sync] Railway: ${data.inserted ?? 0} venda(s) inserida(s)`);
  } catch(e) {
    console.error('[sync] Erro ao enviar para Railway:', e.message);
  }
}

async function readEmailBody(page) {
  const frames = page.frames();
  for (const frame of frames) {
    try {
      const body = await frame.$eval('body', el => el.innerText);
      if (body.includes('Vindi') || body.includes('Total:')) return body;
    } catch {}
  }
  return '';
}

async function isLoggedIn(page) {
  return page.url().includes('/mail/') && await page.$('[class*="inbox"], [class*="email-list"]').then(el => !!el).catch(() => false);
}

async function login(page) {
  await page.goto(WEBMAIL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  if (await isLoggedIn(page)) { console.log('[sync] Já logado'); return true; }

  try {
    // Step 1: enter email
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });
    await page.type('input[name="email"]', TITAN_USER, { delay: 50 });
    await page.click('button.btn-login, button[class*="btn-login"], .btn-primary');
    await new Promise(r => setTimeout(r, 2000));

    // Step 2: enter password (appears after email step)
    await page.waitForSelector('input[type="password"], input[name="password"]', { timeout: 10000 });
    await page.type('input[type="password"], input[name="password"]', TITAN_PASS, { delay: 50 });
    await page.click('button.btn-login, button[class*="btn-login"], .btn-primary');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));

    console.log('[sync] Login realizado em:', page.url());
    return page.url().includes('/mail/');
  } catch(e) {
    console.error('[sync] Login falhou:', e.message);
    return false;
  }
}

function isRecentEmail(timeHint) {
  // Titan shows time (e.g. "3:09 am") for today, and "mai 20" for older dates
  // If timeHint contains "am" or "pm" it's from today
  return /\d+:\d+\s*(am|pm)/i.test(timeHint);
}

async function scrapeNewEmails(page, state) {
  const sales = [];

  // Get all Garage Inn email rows visible in inbox
  const emailTexts = await page.evaluate(() => {
    const body = document.body.innerText;
    const lines = body.split('\n');
    const emails = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^Garage Inn - .+ - Pedido nº \d+$/)) {
        const timeHint = lines[i - 1] ?? '';
        emails.push({ subject: lines[i], timeHint });
      }
    }
    return emails;
  });

  console.log(`[sync] E-mails encontrados na caixa: ${emailTexts.length}`);

  // Only process emails that are recent (from today) AND not already seen
  const newEmails = emailTexts.filter(e => {
    const m = e.subject.match(/Pedido nº (\d+)/);
    if (!m) return false;
    if (state.seen.includes(m[1])) return false;
    // Only process emails from today (shown with time) unless forceAll is set
    return process.env.SYNC_ALL === 'true' || isRecentEmail(e.timeHint);
  });

  console.log(`[sync] Novos e-mails para processar: ${newEmails.length}`);
  if (!newEmails.length) return sales;

  // Click on each new email to read full body
  for (const email of newEmails) {
    try {
      const orderNumMatch = email.subject.match(/Pedido nº (\d+)/);
      const orderNum = orderNumMatch?.[1];

      // Click the email row
      await page.evaluate((subject) => {
        const elements = [...document.querySelectorAll('*')];
        const el = elements.find(e => e.innerText?.trim() === subject && e.children.length === 0);
        if (el) el.click();
      }, email.subject);

      await new Promise(r => setTimeout(r, 2000));

      const body = await readEmailBody(page);
      if (!body) { console.log(`[sync] Sem body para: ${email.subject}`); continue; }

      const sale = parseSaleEmail(body, email.subject);
      if (sale) {
        console.log(`[sync] Venda detectada: ${email.subject} → ${JSON.stringify(sale)}`);
        sales.push(sale);
        if (orderNum) state.seen.push(orderNum);
      } else {
        // Not a confirmed payment — still mark as seen to avoid rechecking
        if (orderNum) state.seen.push(orderNum);
        console.log(`[sync] Sem pagamento confirmado: ${email.subject}`);
      }
    } catch(e) {
      console.error(`[sync] Erro ao processar ${email.subject}:`, e.message);
    }
  }

  return sales;
}

async function main() {
  console.log('[sync] ===== Sincronização iniciada =====');
  const state = loadState();

  // Insert into local DB too
  const localDb = existsSync(DB_PATH) ? initDb(DB_PATH) : null;

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,720',
    ],
    defaultViewport: { width: 1280, height: 720 },
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36');

    const loggedIn = await login(page);
    if (!loggedIn) { console.error('[sync] Não conseguiu fazer login'); return; }

    await new Promise(r => setTimeout(r, 5000)); // wait for inbox to load

    const newSales = await scrapeNewEmails(page, state);

    if (newSales.length) {
      // Insert into local DB
      if (localDb) {
        for (const s of newSales) insertSale(localDb, s);
        console.log(`[sync] ${newSales.length} venda(s) inserida(s) no banco local`);
      }

      // Post to Railway
      await postToRailway(newSales);

      // Update state
      const latestDate = newSales.map(s => s.date).sort().pop();
      if (latestDate > state.lastSyncDate) state.lastSyncDate = latestDate;
    } else {
      console.log('[sync] Nenhuma venda nova encontrada');
    }

    saveState(state);
  } finally {
    await browser.close();
  }
  console.log('[sync] ===== Sincronização concluída =====');
}

main().catch(e => { console.error('[sync] Erro fatal:', e); process.exit(1); });
