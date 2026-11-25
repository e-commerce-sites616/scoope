'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const db = require('./db');
const config = require('../config');
const { httpError } = require('../utils/errors');

const scrypt = promisify(crypto.scrypt);
const SESSION_MS = 7 * 24 * 3600 * 1000;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString('hex')}$${key.toString('hex')}`;
}
async function verifyPassword(pw, stored) {
  const [alg, n, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const key = await scrypt(pw, Buffer.from(salt, 'hex'), 64, { N: Number(n), r: 8, p: 1 });
  const want = Buffer.from(hash, 'hex');
  return key.length === want.length && crypto.timingSafeEqual(key, want);
}
// Burn the same time for unknown emails so login timing doesn't reveal which accounts exist.
let dummy;
const dummyHash = () => (dummy ||= hashPassword('not-a-real-password'));

const normEmail = (e) => String(e || '').trim().toLowerCase();
function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 128) throw httpError(400, 'invalid_password', ['Password must be 8 to 128 characters.']);
}
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, phone: u.phone || '', createdAt: u.createdAt });

async function register({ email, name, password }) {
  email = normEmail(email); name = String(name || '').trim();
  const errors = [];
  if (!EMAIL.test(email)) errors.push('Enter a valid email address.');
  if (name.length < 1 || name.length > 80) errors.push('Enter your name.');
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) errors.push('Password must be 8 to 128 characters.');
  if (errors.length) throw httpError(400, 'validation', errors);
  const passwordHash = await hashPassword(password);
  try {
    return await db.mutate('users', (list) => {
      if (list.some((u) => u.email === email)) throw httpError(409, 'email_taken');
      const row = { id: db.newId('usr'), email, name, passwordHash, role: 'customer', phone: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      list.push(row); return row;
    });
  } catch (e) { throw e; }
}

async function login({ email, password }) {
  email = normEmail(email);
  const user = db.read('users').find((u) => u.email === email);
  const ok = user ? await verifyPassword(String(password || ''), user.passwordHash) : (await verifyPassword(String(password || ''), await dummyHash()), false);
  if (!ok) throw httpError(401, 'invalid_credentials');
  return user;
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const row = { id: sha(token), userId, csrf: crypto.randomBytes(24).toString('base64url'), expiresAt: new Date(Date.now() + SESSION_MS).toISOString(), createdAt: new Date().toISOString() };
  await db.mutate('sessions', (l) => { const now = Date.now(); for (let i = l.length - 1; i >= 0; i--) if (new Date(l[i].expiresAt).getTime() < now) l.splice(i, 1); l.push(row); });
  return { token, session: row };
}
const destroySession = (id) => db.mutate('sessions', (l) => { const i = l.findIndex((s) => s.id === id); if (i >= 0) l.splice(i, 1); });
const destroyUserSessions = (userId, exceptId) => db.mutate('sessions', (l) => { for (let i = l.length - 1; i >= 0; i--) if (l[i].userId === userId && l[i].id !== exceptId) l.splice(i, 1); });

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
  return out;
}
function fromRequest(req) {
  const token = parseCookies(req).sid;
  if (!token || token.length > 100 || !db.ready) return { user: null, session: null };
  const session = db.read('sessions').find((s) => s.id === sha(token));
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return { user: null, session: null };
  const user = db.read('users').find((u) => u.id === session.userId);
  return user ? { user, session } : { user: null, session: null };
}
const cookie = (token, maxAgeSec) => `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${config.isProd ? '; Secure' : ''}`;
const setCookie = (res, token) => res.setHeader('Set-Cookie', cookie(token, SESSION_MS / 1000));
const clearCookie = (res) => res.setHeader('Set-Cookie', cookie('', 0));

module.exports = { register, login, createSession, destroySession, destroyUserSessions, fromRequest, setCookie, clearCookie, hashPassword, verifyPassword, publicUser, normEmail, checkPassword, EMAIL, sha };
