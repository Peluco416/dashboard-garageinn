/**
 * backfill_plan_names.js — Reprocessa TODOS os e-mails "Garage Inn - ... - Pedido nº N"
 * do webmail, extrai { order_id, date, unit, product, value, plan_name } via parseSaleEmail,
 * e salva o resultado em backfill_emails.json para posterior casamento com o banco local.
 *
 * Como a lista de e-mails usa scroll virtualizado (itens fora da tela somem do DOM),
 * processamos cada e-mail (clique + leitura) assim que ele aparece, na mesma passada
 * do scroll, em vez de coletar tudo primeiro.
 *
 * Execução: node --use-system-ca backend/backfill_plan_names.js
 */
import puppeteer from 'puppeteer-core';
import 'dotenv/config';
import { parseSaleEmail } from './email_reader.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE  = path.join(__dirname, '..', 'backfill_emails.json');

const CHROME     = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TITAN_USER = process.env.IMAP_USER     ?? 'loja@garageinn.online';
const TITAN_PASS = process.env.IMAP_PASSWORD ?? 'L@j3Gin8f2w5';
const WEBMAIL    = 'https://titan.hostgator.com.br/mail/';

async function login(page) {
  await page.goto(WEBMAIL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  const url = page.url();
  if (url.includes('/mail/') && !url.includes('/login')) return true;

  await page.waitForSelector('input[name="email"]', { timeout: 10000 });
  await page.type('input[name="email"]', TITAN_USER, { delay: 30 });
  await page.click('button.btn-login, .btn-primary');
  await new Promise(r => setTimeout(r, 2000));
  await page.waitForSelector('input[type="password"]', { timeout: 10000 });
  await page.type('input[type="password"]', TITAN_PASS, { delay: 30 });
  await page.click('button.btn-login, .btn-primary');
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));
  return true;
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

function orderNumFromSubject(subject) {
  const m = subject.match(/Pedido n[ºo°]?\s*(\d+)/i);
  return m ? m[1] : null;
}

async function main() {
  let results = [];
  let processed = new Set();
  if (existsSync(OUT_FILE)) {
    try {
      results = JSON.parse(readFileSync(OUT_FILE, 'utf8'));
      results.forEach(r => processed.add(r.subject));
      console.log(`[backfill] Retomando: ${results.length} ja processados.`);
    } catch {}
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
    defaultViewport: { width: 1280, height: 900 },
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36');

  await login(page);
  await new Promise(r => setTimeout(r, 2000));

  let stableRounds = 0;
  let total = 0;

  for (let round = 0; round < 800; round++) {
    // Pega todos os elementos div.text com subject "Garage Inn - ... - Pedido nº N" visiveis agora
    const visible = await page.evaluate(() => {
      return [...document.querySelectorAll('div.text')]
        .map(e => e.innerText?.trim())
        .filter(t => t && /^Garage Inn - .+ - Pedido n[ºo°]?\s*\d+$/.test(t));
    });

    let newFound = false;
    for (const subject of visible) {
      if (processed.has(subject)) continue;
      newFound = true;
      processed.add(subject);
      total++;

      try {
        const clicked = await page.evaluate((subj) => {
          const el = [...document.querySelectorAll('div.text')]
            .find(e => e.innerText?.trim() === subj);
          if (el) { el.click(); return true; }
          return false;
        }, subject);

        if (!clicked) {
          console.log(`[backfill] (${total}) NAO ENCONTRADO: ${subject}`);
          results.push({ subject, sale: null });
          continue;
        }

        await new Promise(r => setTimeout(r, 1300));
        const body = await readEmailBody(page);
        const sale = body ? parseSaleEmail(body, subject) : null;

        results.push({ subject, sale });
        console.log(`[backfill] (${total}) ${subject} → ${sale ? `${sale.order_id} | ${sale.plan_name ?? '-'} | R$${sale.value} | ${sale.date}` : 'sem venda valida'}`);

        if (results.length % 5 === 0) writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
      } catch (e) {
        console.error(`[backfill] Erro em "${subject}":`, e.message);
        results.push({ subject, sale: null, error: e.message });
      }
    }

    if (!newFound) {
      stableRounds++;
      if (stableRounds >= 6) break;
    } else {
      stableRounds = 0;
    }

    // Scroll down dentro da lista de e-mails
    await page.evaluate(() => {
      const scrollables = [...document.querySelectorAll('div')]
        .filter(d => d.scrollHeight > d.clientHeight + 50);
      for (const el of scrollables) el.scrollTop = el.scrollTop + 600;
    });
    await new Promise(r => setTimeout(r, 800));
  }

  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log(`[backfill] Concluido. ${results.length} registros salvos em ${OUT_FILE}`);
  await browser.close();
}

main().catch(e => { console.error('[backfill] Erro fatal:', e.message); process.exit(1); });
