#!/usr/bin/env node
/**
 * CLI para gerenciar usuários do dashboard.
 *
 * Uso:
 *   node backend/manage_users.js add <usuario> <senha> [Nome Completo]
 *   node backend/manage_users.js remove <usuario>
 *   node backend/manage_users.js list
 */
import { createUser, deleteUser, listUsers, generateInvite, listInvites } from './auth.js';

const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'add': {
    const [username, password, ...nameParts] = args;
    if (!username || !password) {
      console.error('Uso: node backend/manage_users.js add <usuario> <senha> [Nome Completo]');
      process.exit(1);
    }
    const displayName = nameParts.join(' ') || username;
    const r = createUser(username, password, displayName);
    if (r.ok) {
      console.log(`✅ Usuário "${username}" criado com sucesso.`);
      console.log(`   Nome: ${displayName}`);
      console.log(`   Login: ${username} / Senha: ${password}`);
    } else {
      console.error(`❌ Erro: ${r.error}`);
      process.exit(1);
    }
    break;
  }

  case 'remove': {
    const [username] = args;
    if (!username) {
      console.error('Uso: node backend/manage_users.js remove <usuario>');
      process.exit(1);
    }
    const r = deleteUser(username);
    if (r.ok) console.log(`✅ Usuário "${username}" removido.`);
    else { console.error(`❌ Erro: ${r.error}`); process.exit(1); }
    break;
  }

  case 'list': {
    const users = listUsers();
    if (!users.length) { console.log('Nenhum usuário cadastrado.'); break; }
    console.log('\n📋 Usuários do Dashboard:\n');
    users.forEach(u => {
      console.log(`  👤 ${u.displayName} (${u.username})`);
      console.log(`     Criado em: ${new Date(u.createdAt).toLocaleString('pt-BR')}`);
    });
    console.log('');
    break;
  }

  case 'invite': {
    const { token, expiresAt } = generateInvite();
    const port = process.env.PORT ?? 5000;

    // Detect local IP so the link works on other machines in the network
    const { networkInterfaces } = await import('node:os');
    const nets = networkInterfaces();
    let ip = 'localhost';
    for (const iface of Object.values(nets)) {
      for (const net of iface) {
        if (net.family === 'IPv4' && !net.internal) { ip = net.address; break; }
      }
      if (ip !== 'localhost') break;
    }

    const link = `http://${ip}:${port}/cadastro?token=${token}`;
    console.log('\n✅ Link de convite gerado!\n');
    console.log(`🔗 ${link}`);
    console.log(`\n⏰ Válido até: ${new Date(expiresAt).toLocaleString('pt-BR')}`);
    console.log('\n💡 Envie este link para o novo usuário pelo WhatsApp, e-mail, etc.');
    console.log('   Funciona para qualquer pessoa na mesma rede Wi-Fi.');
    console.log('   O link expira em 7 dias e só pode ser usado uma vez.\n');
    break;
  }

  case 'invites': {
    const invs = listInvites();
    if (!invs.length) { console.log('Nenhum convite gerado.'); break; }
    console.log('\n📋 Convites:\n');
    invs.forEach(i => {
      const status = i.used ? `✅ Usado por ${i.usedBy}` : new Date(i.expiresAt) < new Date() ? '❌ Expirado' : '⏳ Pendente';
      console.log(`  ${i.tokenPreview}  ${status}  (expira ${new Date(i.expiresAt).toLocaleDateString('pt-BR')})`);
    });
    console.log('');
    break;
  }

  default:
    console.log(`
Gerenciador de Usuários — GarageINN Dashboard

Comandos:
  invite                                  Gera link de cadastro para novo usuário
  invites                                 Lista todos os convites gerados
  add <usuario> <senha> [Nome Completo]   Cria usuário diretamente (sem convite)
  remove <usuario>                        Remove usuário
  list                                    Lista todos os usuários

Exemplos:
  node backend/manage_users.js invite
  node backend/manage_users.js invites
  node backend/manage_users.js list
  node backend/manage_users.js remove joao
    `);
}
