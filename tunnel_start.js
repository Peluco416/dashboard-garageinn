/**
 * Abre o tunnel externo, mostra o endereço público e abre o navegador.
 */
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';

const ssh = spawn('ssh', [
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ServerAliveInterval=60',
  '-R', '80:localhost:5000',
  'serveo.net'
], { stdio: ['ignore', 'pipe', 'pipe'] });

let done = false;

function onData(data) {
  const text = data.toString();
  const match = text.match(/https:\/\/[a-z0-9\-]+\.serveousercontent\.com/);
  if (match && !done) {
    done = true;
    const url = match[0];

    console.log('');
    console.log(' ============================================');
    console.log('  DASHBOARD DISPONIVEL PARA TODOS:');
    console.log('');
    console.log('  ' + url);
    console.log('');
    console.log('  Para convidar usuarios:');
    console.log('  1. Acesse o dashboard pelo link acima');
    console.log('  2. Clique em "+ Convidar usuario" no topo');
    console.log('  3. Copie e envie o link gerado');
    console.log(' ============================================');
    console.log('');
    console.log('  MANTENHA ESTA JANELA ABERTA.');
    console.log('  Para fechar o dashboard, feche esta janela.');
    console.log('');

    // Abre o navegador automaticamente
    try {
      execSync(`start "" "${url}"`);
    } catch(_) {}
  }
}

ssh.stdout.on('data', onData);
ssh.stderr.on('data', onData);

ssh.on('close', () => process.exit(0));

// Timeout
setTimeout(() => {
  if (!done) {
    console.log('');
    console.log(' Sem acesso externo. Usando acesso local:');
    console.log(' http://192.168.1.9:5000');
    console.log('');
    try { execSync('start "" "http://192.168.1.9:5000"'); } catch(_) {}
  }
}, 15000);
