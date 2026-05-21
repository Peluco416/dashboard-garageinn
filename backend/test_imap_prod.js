/**
 * Testa conexão IMAP a partir do servidor Railway.
 * Rode: node backend/test_imap_prod.js
 */
import Imap from 'imap';

const configs = [
  { host: 'titan.hostgator.com.br', port: 993, tls: true },
  { host: 'imap.titan.email',        port: 993, tls: true },
  { host: 'mail.garageinn.online',   port: 993, tls: true },
  { host: 'imap.titan.email',        port: 143, tls: false },
];

const user = 'loja@garageinn.online';
const pwd  = 'L@j3Gin8f2w5';

for (const cfg of configs) {
  await new Promise(resolve => {
    const imap = new Imap({
      user, password: pwd, host: cfg.host, port: cfg.port,
      tls: cfg.tls, tlsOptions: { rejectUnauthorized: false },
      connTimeout: 8000, authTimeout: 8000,
    });
    imap.once('ready', () => {
      console.log(`✅ FUNCIONA: ${cfg.host}:${cfg.port}`);
      imap.end(); resolve();
    });
    imap.once('error', e => {
      console.log(`❌ ERRO: ${cfg.host}:${cfg.port} — ${e.message ?? e.code ?? e.source ?? JSON.stringify(e)}`);
      resolve();
    });
    imap.connect();
  });
}
process.exit(0);
