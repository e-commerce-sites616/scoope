'use strict';
const crypto = require('node:crypto');
const { sendJson } = require('../utils/http');
const { readJson } = require('../middleware/body');
const { clientIp } = require('../middleware/ratelimit');
const { httpError } = require('../utils/errors');
const { limit } = require('./account');
const { EMAIL, sha } = require('../services/auth');
const db = require('../services/db');

// ---- reviews
const display = (u) => { const [f, ...r] = (u?.name || 'Customer').trim().split(/\s+/); return r.length ? `${f} ${r[r.length - 1][0]}.` : f; };
function reviewsFor(slug) {
  const p = db.read('products').find((x) => x.slug === slug && !x.archived);
  if (!p) return null;
  const users = new Map(db.read('users').map((u) => [u.id, u]));
  const rows = db.read('reviews').filter((r) => r.productId === p.id && r.status !== 'hidden').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { productId: p.id, count: rows.length, average: rows.length ? Math.round((rows.reduce((n, r) => n + r.rating, 0) / rows.length) * 10) / 10 : null,
    items: rows.slice(0, 50).map((r) => ({ rating: r.rating, title: r.title || '', body: r.body, author: display(users.get(r.userId)), verified: r.verified, createdAt: r.createdAt })) };
}
function listReviews(ctx) { const r = reviewsFor(ctx.params.slug); if (!r) throw httpError(404, 'product_not_found'); const { productId, ...out } = r; sendJson(ctx.res, 200, out); }
async function addReview(ctx) {
  const p = db.read('products').find((x) => x.slug === ctx.params.slug && !x.archived);
  if (!p) throw httpError(404, 'product_not_found');
  limit(ctx.req, 'review', ctx.user.id, 3600_000, 10);
  const b = await readJson(ctx.req);
  const rating = b.rating, title = String(b.title || '').trim(), body = String(b.body || '').trim();
  const errors = [];
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.push('Choose a rating from 1 to 5.');
  if (title.length > 80) errors.push('Title is too long.');
  if (body.length < 10 || body.length > 1000) errors.push('Write between 10 and 1000 characters.');
  if (errors.length) throw httpError(400, 'validation', errors);
  const verified = db.read('orders').some((o) => o.userId === ctx.user.id && o.paymentStatus === 'paid' && o.lines.some((l) => l.productId === p.id));
  await db.mutate('reviews', (l) => {
    if (l.some((r) => r.productId === p.id && r.userId === ctx.user.id)) throw httpError(409, 'already_reviewed');
    l.push({ id: db.newId('rev'), productId: p.id, userId: ctx.user.id, rating, title, body, verified, status: 'approved', createdAt: new Date().toISOString() });
  });
  const { productId, ...out } = reviewsFor(p.slug);
  sendJson(ctx.res, 201, out);
}

// ---- newsletter (stored locally; no email is sent)
async function subscribe(ctx) {
  limit(ctx.req, 'news', clientIp(ctx.req), 3600_000, 10);
  const b = await readJson(ctx.req), email = String(b.email || '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) throw httpError(400, 'validation', ['Enter a valid email address.']);
  if (b.consent !== true) throw httpError(400, 'consent_required', ['Please tick the box to agree to receive emails.']);
  const token = crypto.randomBytes(18).toString('base64url');
  const status = await db.mutate('subscribers', (l) => {
    const ex = l.find((s) => s.email === email);
    if (ex && ex.status !== 'unsubscribed') return 'already';
    if (ex) { Object.assign(ex, { status: 'subscribed', tokenHash: sha(token), resubscribedAt: new Date().toISOString() }); return 'resubscribed'; }
    l.push({ id: db.newId('sub'), email, status: 'subscribed', consent: true, tokenHash: sha(token), createdAt: new Date().toISOString() }); return 'subscribed';
  });
  sendJson(ctx.res, 200, { status, ...(status !== 'already' ? { unsubscribeUrl: `/unsubscribe/${token}` } : {}), note: 'Subscriptions are stored on this demo site only. No emails are sent.' });
}
async function unsubscribe(ctx) {
  const b = await readJson(ctx.req), h = sha(String(b.token || ''));
  const ok = await db.mutate('subscribers', (l) => { const s = l.find((x) => x.tokenHash === h && x.status === 'subscribed'); if (!s) return false; s.status = 'unsubscribed'; s.unsubscribedAt = new Date().toISOString(); return true; });
  if (!ok) throw httpError(404, 'not_found');
  sendJson(ctx.res, 200, { ok: true });
}

// ---- contact form
async function contact(ctx) {
  limit(ctx.req, 'contact', clientIp(ctx.req), 3600_000, 5);
  const b = await readJson(ctx.req);
  const name = String(b.name || '').trim(), email = String(b.email || '').trim().toLowerCase(), message = String(b.message || '').trim();
  const errors = [];
  if (name.length < 2 || name.length > 80) errors.push('Enter your name.');
  if (!EMAIL.test(email)) errors.push('Enter a valid email address.');
  if (message.length < 10 || message.length > 2000) errors.push('Write a message between 10 and 2000 characters.');
  if (errors.length) throw httpError(400, 'validation', errors);
  await db.insert('messages', 'msg', { name, email, message });
  sendJson(ctx.res, 201, { ok: true, note: 'Demo site: your message is stored locally and no one will reply.' });
}
module.exports = { listReviews, addReview, reviewsFor, subscribe, unsubscribe, contact };
