/**
 * Gera um link de convite acessível de qualquer lugar.
 * Uso: node gerar-convite.js
 */
import { spawn } from 'node:child_process';
import { generateInvite } from './backend/auth.js';

console.log('\n⏳ Conectando ao servidor de acesso externo...\n');

const ssh = spawn('ssh', [
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ServerAliveInterval=60',
  '-R', '80:localhost:5000',
  'serveo.net'
], { stdio: ['ignore', 'pipe', 'pipe'] });

let urlFound = false;

function handleOutput(data) {
  const text = data.toString();
  const match = text.match(/https:\/\/[a-z0-9\-]+\.serveousercontent\.com/);
  if (match && !urlFound) {
    urlFound = true;
    const publicUrl = match[0];
    const { token, expiresAt } = generateInvite();
    const link = `${publicUrl}/cadastro?token=${token}`;
    const expires = new Date(expiresAt).toLocaleDateString('pt-BR');

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║         LINK DE CADASTRO — ENVIE PARA O NOVO USUÁRIO        ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║                                                              ║');
    console.log(`  ${link}`);
    console.log('║                                                              ║');
    console.log(`║  ⏰ Válido até ${expires}  •  Uso único                    ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\n✅ Copie o link acima e envie por WhatsApp ou e-mail.');
    console.log('   Mantenha esta janela aberta enquanto a pessoa faz o cadastro.\n');
  }
}

ssh.stdout.on('data', handleOutput);
ssh.stderr.on('data', handleOutput);

ssh.on('close', () => {
  if (!urlFound) console.log('\n❌ Não foi possível conectar. Verifique a conexão com a internet.\n');
  process.exit(0);
});

// Timeout if URL not found in 20s
setTimeout(() => {
  if (!urlFound) {
    console.log('\n❌ Tempo esgotado. Verifique se o servidor está rodando (node backend/app.js) e tente novamente.\n');
    ssh.kill();
    process.exit(1);
  }
}, 20000);
