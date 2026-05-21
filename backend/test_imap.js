import 'dotenv/config';
import Imap from 'imap';

const user = process.env.IMAP_USER     ?? 'loja@garageinn.online';
const pwd  = process.env.IMAP_PASSWORD ?? '';

const configs = [
  { host: 'imap.titan.email',          port: 993, tls: true  },
  { host: 'titan.hostgator.com.br',    port: 993, tls: true  },
  { host: 'mail.garageinn.online',     port: 993, tls: true  },
  { host: 'imap.hostgator.com.br',     port: 993, tls: true  },
  { host: 'imap.titan.email',          port: 143, tls: false },
  { host: 'mail.garageinn.online',     port: 143, tls: false },
];

async function testOne(cfg) {
  return new Promise(resolve => {
    const label = `${cfg.host}:${cfg.port} (TLS=${cfg.tls})`;
    const imap  = new Imap({
      user, password: pwd,
      host: cfg.host, port: cfg.port,
      tls: cfg.tls,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 8000, authTimeout: 8000,
    });
    imap.once('ready', () => {
      console.log(`  ✅ OK  → ${label}`);
      imap.end();
      resolve({ ok: true, ...cfg });
    });
    imap.once('error', e => {
      console.log(`  ❌     → ${label}  [${e.message}]`);
      resolve({ ok: false, ...cfg });
    });
    imap.connect();
  });
}

console.log(`\nTestando conexões IMAP para ${user}...\n`);
for (const cfg of configs) {
  const r = await testOne(cfg);
  if (r.ok) {
    console.log(`\n✅ Use no .env:\n  IMAP_HOST=${r.host}\n  IMAP_PORT=${r.port}\n`);
    process.exit(0);
  }
}
console.log('\n❌ Nenhuma configuração funcionou. Verifique se IMAP está habilitado no painel do HostGator.');
process.exit(1);
