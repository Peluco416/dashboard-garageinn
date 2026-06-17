/**
 * backfill_conversion.js — Reprocessa todos os e-mails históricos para:
 *   1) Extrair customer_cpf de e-mails confirmados → atualizar sales.customer_cpf
 *   2) Extrair e-mails negados → inserir em denied_payments
 *
 * Execução: node --use-system-ca backend/backfill_conversion.js
 */
import puppeteer from 'puppeteer-core';
import 'dotenv/config';
import { parseSaleEmail, parseDeniedEmail } from './email_reader.js';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE    = path.join(__dirname, '..', 'backfill_conv.json');
const CHROME      = process.env.CHROME_PATH;
const TITAN_USER  = process.env.IMAP_USER     ?? 'loja@garageinn.online';
const TITAN_PASS  = process.env.IMAP_PASSWORD ?? 'L@j3Gin8f2w5';
const WEBMAIL     = 'https://titan.hostgator.com.br/mail/';
const RAILWAY     = process.env.RAILWAY_URL   ?? 'https://dashboard-garageinn-production.up.railway.app';
const SYNC_KEY    = process.env.SYNC_KEY      ?? 'garageinn_sync_2026';

async function login(page) {
  await page.goto(WEBMAIL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  if (!page.url().includes('login')) return;
  await page.waitForSelector('input[name="email"]', { timeout: 10000 });
  await page.type('input[name="email"]', TITAN_USER, { delay: 30 });
  await page.click('button.btn-login, .btn-primary');
  await new Promise(r => setTimeout(r, 2000));
  await page.waitForSelector('input[type="password"]', { timeout: 10000 });
  await page.type('input[type="password"]', TITAN_PASS, { delay: 30 });
  await page.click('button.btn-login, .btn-primary');
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));
}

async function readBody(page) {
  await new Promise(r => setTimeout(r, 1400));
  for (const frame of page.frames()) {
    try {
      const b = await frame.$eval('body', el => el.innerText);
      if (b.includes('Vindi') || b.includes('Total:')) return b;
    } catch {}
  }
  return '';
}

async function post(path_, body) {
  const r = await fetch(`${RAILWAY}${path_}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sync-key': SYNC_KEY },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function main() {
  let results = [];
  let processed = new Set();
  if (existsSync(OUT_FILE)) {
    try {
      results = JSON.parse(readFileSync(OUT_FILE, 'utf8'));
      results.forEach(r => processed.add(r.subject));
      console.log(`[backfill-conv] Retomando: ${results.length} já processados.`);
    } catch {}
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--window-size=1280,900'],
    defaultViewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
  await login(page);
  await new Promise(r => setTimeout(r, 2000));

  let total = 0;
  let stableRounds = 0;

  for (let round = 0; round < 800; round++) {
    const visible = await page.evaluate(() =>
      [...document.querySelectorAll('div.text')]
        .map(e => e.innerText?.trim())
        .filter(t => t && /^Garage Inn - .+ - Pedido n[ºo°]?\s*\d+$/.test(t))
    );

    let newFound = false;
    for (const subject of visible) {
      if (processed.has(subject)) continue;
      newFound = true;
      processed.add(subject);
      total++;

      try {
        const clicked = await page.evaluate((s) => {
          const el = [...document.querySelectorAll('div.text')].find(e => e.innerText?.trim() === s);
          if (el) { el.click(); return true; }
          return false;
        }, subject);

        const body  = clicked ? await readBody(page) : '';
        const sale  = body ? parseSaleEmail(body, subject) : null;
        const denied = (!sale && body) ? parseDeniedEmail(body, subject) : null;

        results.push({ subject, sale, denied });
        const tag = sale ? `✅ CPF:${sale.customer_cpf ?? '-'}` : denied ? `❌ negado CPF:${denied.customer_cpf ?? '-'}` : '?';
        console.log(`[${total}] ${subject} → ${tag}`);

        if (results.length % 10 === 0) writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
      } catch(e) {
        results.push({ subject, sale: null, denied: null, error: e.message });
      }
    }

    if (!newFound) { stableRounds++; if (stableRounds >= 6) break; }
    else stableRounds = 0;

    await page.evaluate(() => {
      [...document.querySelectorAll('div')]
        .filter(d => d.scrollHeight > d.clientHeight + 50)
        .forEach(d => { d.scrollTop += 600; });
    });
    await new Promise(r => setTimeout(r, 800));
  }

  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  await browser.close();

  // Enviar para Railway
  const cpfRows = results.filter(r => r.sale?.order_id && r.sale?.customer_cpf)
    .map(r => ({ order_id: r.sale.order_id, customer_cpf: r.sale.customer_cpf }));
  const deniedRows = results.filter(r => r.denied?.order_id)
    .map(r => r.denied);

  console.log(`\n[backfill-conv] ${cpfRows.length} CPFs confirmados, ${deniedRows.length} negados`);

  // Enviar CPFs em lotes de 100
  for (let i = 0; i < cpfRows.length; i += 100) {
    const batch = cpfRows.slice(i, i + 100);
    const r = await post('/api/sales/update-cpf', { rows: batch });
    console.log(`[backfill-conv] CPF lote ${i/100+1}: ${r.updated} atualizados`);
  }

  // Enviar negados em lotes de 100
  for (let i = 0; i < deniedRows.length; i += 100) {
    const batch = deniedRows.slice(i, i + 100);
    const r = await post('/api/denied/insert', { denied: batch });
    console.log(`[backfill-conv] Negados lote ${i/100+1}: ${r.inserted} inseridos`);
  }

  console.log('[backfill-conv] Concluído.');
}

main().catch(e => { console.error('[backfill-conv] Erro fatal:', e.message); process.exit(1); });
