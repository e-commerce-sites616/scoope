'use strict';
const { sendJson } = require('../utils/http');
const { readJson } = require('../middleware/body');
const { hit, clientIp } = require('../middleware/ratelimit');
const { httpError } = require('../utils/errors');
const auth = require('../services/auth');
const rewards = require('../services/rewards');
const orders = require('../services/orders');
const db = require('../services/db');

const limit = (req, name, key, windowMs, max) => { const r = hit(`${name}:${key}`, windowMs, max); if (!r.ok) throw Object.assign(httpError(429, 'rate_limited'), { retryAfter: r.retryAfter }); };
const me = (u, s) => ({ user: u ? auth.publicUser(u) : null, csrf: s?.csrf || null, points: u ? rewards.balance(u.id) : 0 });

async function start(ctx, user) {
  const { token, session } = await auth.createSession(user.id);      // always a fresh session: no fixation
  auth.setCookie(ctx.res, token);
  sendJson(ctx.res, 200, me(user, session));
}
async function register(ctx) {
  limit(ctx.req, 'register', clientIp(ctx.req), 3600_000, 10);
  const b = await readJson(ctx.req);
  const user = await auth.register({ email: b.email, name: b.name, password: b.password });
  await start(ctx, user);
}
async function login(ctx) {
  const ip = clientIp(ctx.req), b = await readJson(ctx.req), email = auth.normEmail(b.email);
  limit(ctx.req, 'login-ip', ip, 900_000, 30);
  limit(ctx.req, 'login', `${ip}:${email}`, 900_000, 6);
  await start(ctx, await auth.login({ email, password: b.password }));
}
async function logout(ctx) {
  if (ctx.session) await auth.destroySession(ctx.session.id);
  auth.clearCookie(ctx.res);
  sendJson(ctx.res, 200, { ok: true });
}
const whoami = (ctx) => sendJson(ctx.res, 200, me(ctx.user, ctx.session));

async function dashboard(ctx) {
  const u = ctx.user;
  sendJson(ctx.res, 200, {
    ...me(u, ctx.session),
    rewards: { balance: rewards.balance(u.id), history: rewards.history(u.id).map(({ type, points, note, createdAt }) => ({ type, points, note, createdAt })), rules: { earn: `1 point per ₦${rewards.EARN_PER_NAIRA} spent`, redeem: `${rewards.BLOCK_POINTS} points = ₦${rewards.BLOCK_VALUE.toLocaleString('en-NG')} off, up to half your order` } },
    addresses: db.read('addresses').filter((a) => a.userId === u.id).map(({ id, label, line1, area, zoneId }) => ({ id, label, line1, area, zoneId })),
  });
}
async function myOrders(ctx) { sendJson(ctx.res, 200, { items: (await orders.listFor(ctx.user.id)).map((o) => ({ ...orders.view(o), key: o.reference })) }); }

async function profile(ctx) {
  const b = await readJson(ctx.req);
  const name = String(b.name ?? ctx.user.name).trim(), phone = String(b.phone ?? ctx.user.phone ?? '').trim();
  const errors = [];
  if (name.length < 1 || name.length > 80) errors.push('Enter your name.');
  if (phone && !/^[0-9+\-() ]{7,20}$/.test(phone)) errors.push('Enter a valid phone number.');
  if (errors.length) throw httpError(400, 'validation', errors);
  const u = await db.update('users', ctx.user.id, { name, phone });
  sendJson(ctx.res, 200, { user: auth.publicUser(u) });
}
async function password(ctx) {
  limit(ctx.req, 'pw', ctx.user.id, 900_000, 5);
  const b = await readJson(ctx.req);
  if (!(await auth.verifyPassword(String(b.current || ''), ctx.user.passwordHash))) throw httpError(403, 'wrong_password');
  auth.checkPassword(b.next);
  await db.update('users', ctx.user.id, { passwordHash: await auth.hashPassword(b.next) });
  await auth.destroyUserSessions(ctx.user.id, ctx.session.id);      // sign out every other device
  sendJson(ctx.res, 200, { ok: true });
}
async function addAddress(ctx) {
  const b = await readJson(ctx.req);
  const line1 = String(b.line1 || '').trim(), area = String(b.area || '').trim(), label = String(b.label || 'Home').trim().slice(0, 30) || 'Home';
  const zone = db.read('delivery-zones').find((z) => z.active && z.areas.includes(area));
  if (line1.length < 5 || line1.length > 160 || !zone) throw httpError(400, 'validation', ['Enter a street address and choose a delivery area.']);
  if (db.read('addresses').filter((a) => a.userId === ctx.user.id).length >= 10) throw httpError(409, 'address_limit');
  const a = await db.insert('addresses', 'adr', { userId: ctx.user.id, label, line1, area, zoneId: zone.id });
  sendJson(ctx.res, 201, { id: a.id, label, line1, area, zoneId: zone.id });
}
async function delAddress(ctx) {
  const a = db.read('addresses').find((x) => x.id === ctx.params.id && x.userId === ctx.user.id);   // owner-only (no IDOR)
  if (!a) throw httpError(404, 'not_found');
  await db.remove('addresses', a.id);
  sendJson(ctx.res, 200, { ok: true });
}
module.exports = { register, login, logout, whoami, dashboard, myOrders, profile, password, addAddress, delAddress, limit };
