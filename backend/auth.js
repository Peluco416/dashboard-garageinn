/**
 * Gerenciamento de usuários, autenticação e convites do dashboard.
 * Usuários em backend/users.json, convites em backend/invites.json.
 * Senhas armazenadas como hash SHA-256 + salt.
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR     = process.env.DATA_DIR ?? __dirname;
const USERS_FILE   = path.join(DATA_DIR, 'users.json');
const INVITES_FILE = path.join(DATA_DIR, 'invites.json');

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadUsers()   { return existsSync(USERS_FILE)   ? JSON.parse(readFileSync(USERS_FILE,   'utf8')) : {}; }
function loadInvites() { return existsSync(INVITES_FILE) ? JSON.parse(readFileSync(INVITES_FILE, 'utf8')) : {}; }
function saveUsers(u)  { writeFileSync(USERS_FILE,   JSON.stringify(u, null, 2), 'utf8'); }
function saveInvites(i){ writeFileSync(INVITES_FILE, JSON.stringify(i, null, 2), 'utf8'); }

function hashPassword(password, salt) {
  return createHash('sha256').update(salt + password).digest('hex');
}

// ── Usuários ──────────────────────────────────────────────────────────────────

/** Cria um novo usuário. Retorna { ok, error }. */
export function createUser(username, password, displayName = '') {
  const users = loadUsers();
  const key   = username.toLowerCase().trim();
  if (!key)     return { ok: false, error: 'Nome de usuário inválido' };
  if (users[key]) return { ok: false, error: 'Usuário já existe' };
  const salt = randomBytes(16).toString('hex');
  users[key] = { username: key, displayName: displayName || username,
                 salt, hash: hashPassword(password, salt), createdAt: new Date().toISOString() };
  saveUsers(users);
  return { ok: true };
}

/** Verifica credenciais. Retorna { ok, user } ou { ok: false, error }. */
export function verifyUser(username, password) {
  const users = loadUsers();
  const key   = username.toLowerCase().trim();
  const u     = users[key];
  if (!u) return { ok: false, error: 'Usuário não encontrado' };
  if (hashPassword(password, u.salt) !== u.hash) return { ok: false, error: 'Senha incorreta' };
  return { ok: true, user: { username: u.username, displayName: u.displayName } };
}

/** Remove um usuário. Retorna { ok, error }. */
export function deleteUser(username) {
  const users = loadUsers();
  const key   = username.toLowerCase().trim();
  if (!users[key]) return { ok: false, error: 'Usuário não encontrado' };
  delete users[key];
  saveUsers(users);
  return { ok: true };
}

/** Lista todos os usuários (sem senhas). */
export function listUsers() {
  const users = loadUsers();
  return Object.values(users).map(u => ({
    username:    u.username,
    displayName: u.displayName,
    createdAt:   u.createdAt,
  }));
}

// ── Convites ──────────────────────────────────────────────────────────────────

/** Gera um link de convite único. Expira em 7 dias. Retorna { token, expiresAt }. */
export function generateInvite() {
  const invites   = loadInvites();
  const token     = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  invites[token]  = { token, createdAt: new Date().toISOString(), expiresAt, used: false, usedBy: null };
  saveInvites(invites);
  return { token, expiresAt };
}

/** Valida um token de convite. Retorna { ok, error? }. */
export function validateInvite(token) {
  const invites = loadInvites();
  const inv     = invites[token];
  if (!inv)                          return { ok: false, error: 'Convite inválido' };
  if (inv.used)                      return { ok: false, error: 'Convite já utilizado' };
  if (new Date(inv.expiresAt) < new Date()) return { ok: false, error: 'Convite expirado' };
  return { ok: true };
}

/** Registra usuário via convite. Retorna { ok, error? }. */
export function registerWithInvite(token, username, password, displayName) {
  const check = validateInvite(token);
  if (!check.ok) return check;

  const result = createUser(username, password, displayName);
  if (!result.ok) return result;

  // Marca convite como usado
  const invites  = loadInvites();
  invites[token].used   = true;
  invites[token].usedBy = username.toLowerCase().trim();
  invites[token].usedAt = new Date().toISOString();
  saveInvites(invites);

  return { ok: true };
}

/** Lista convites (sem token completo por segurança). */
export function listInvites() {
  const invites = loadInvites();
  return Object.values(invites).map(i => ({
    tokenPreview: i.token.slice(0, 8) + '...',
    createdAt:    i.createdAt,
    expiresAt:    i.expiresAt,
    used:         i.used,
    usedBy:       i.usedBy,
  }));
}

// ── Middleware ────────────────────────────────────────────────────────────────

/** Redireciona para /login se não autenticado. */
export function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Não autenticado' });
  res.redirect('/login');
}
