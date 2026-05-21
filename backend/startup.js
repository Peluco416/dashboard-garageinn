/**
 * Executado antes do servidor iniciar.
 * Cria o usuário admin padrão se não existir nenhum usuário.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// Garante que o diretório de dados existe (importante na nuvem)
const DATA_DIR = process.env.DATA_DIR;
if (DATA_DIR) {
  mkdirSync(DATA_DIR, { recursive: true });
  console.log(`[startup] DATA_DIR: ${DATA_DIR}`);
}

const { listUsers, createUser } = await import('./auth.js');

if (listUsers().length === 0) {
  const adminPass = process.env.ADMIN_PASSWORD ?? 'Admin@2026';
  createUser('admin', adminPass, 'Administrador GarageINN');
  console.log(`[startup] Usuário admin criado. Senha: ${adminPass}`);
  console.log('[startup] Altere a senha após o primeiro login.');
}
