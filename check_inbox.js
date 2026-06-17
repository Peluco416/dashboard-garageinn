import puppeteer from 'puppeteer-core';
import 'dotenv/config';
import { readFileSync } from 'fs';

const CHROME = process.env.CHROME_PATH;
const TITAN_USER = process.env.IMAP_USER ?? 'loja@garageinn.online';
const TITAN_PASS = process.env.IMAP_PASSWORD ?? 'L@j3Gin8f2w5';

const state = JSON.parse(readFileSync('sync_state.json','utf8'));
const seen = new Set(state.seen);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox','--disable-setuid-sandbox','--window-size=1280,900'],
  defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
await page.goto('https://titan.hostgator.com.br/mail/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 4000));
if (page.url().includes('login')) {
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

const lines = await page.evaluate(() => document.body.innerText.split('\n'));
const garageLines = [];
for (let i = 0; i < lines.length; i++) {
  if (/^Garage Inn - .+ - Pedido n[ºo°]?\s*\d+$/.test(lines[i].trim())) {
    garageLines.push({ subject: lines[i].trim(), timeHint: lines[i-1]?.trim() ?? '' });
  }
}

console.log('Total Garage Inn emails visíveis:', garageLines.length);
console.log('\nE-mails NÃO processados ainda:');
const novos = garageLines.filter(e => {
  const m = e.subject.match(/Pedido n[ºo°]?\s*(\d+)/i);
  return m && !seen.has(m[1]);
});
novos.forEach(e => console.log(' ', e.timeHint, '|', e.subject));
if (!novos.length) console.log('  (nenhum novo)');

console.log('\nÚltimos 5 e-mails visíveis:');
garageLines.slice(0,5).forEach(e => console.log(' ', JSON.stringify(e.timeHint), '|', e.subject));

await browser.close();
