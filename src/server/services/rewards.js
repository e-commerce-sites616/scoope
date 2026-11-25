'use strict';
// SCOOPÉ Rewards. Balance is always computed from the ledger, never stored.
const db = require('./db');
const { httpError } = require('../utils/errors');

const EARN_PER_NAIRA = 100;        // 1 point per ₦100 paid (before delivery)
const BLOCK_POINTS = 100;          // redeem in blocks of 100 points...
const BLOCK_VALUE = 500;           // ...each worth ₦500
const MAX_SHARE = 0.5;             // never more than half the discounted subtotal

const balance = (userId) => db.read('rewards').filter((r) => r.userId === userId).reduce((n, r) => n + r.points, 0);
const history = (userId) => db.read('rewards').filter((r) => r.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
const earnFor = (amount) => Math.floor(Math.max(0, amount) / EARN_PER_NAIRA);

/** How many points could be applied to this amount, and what they're worth. */
function redemption(userId, requested, base) {
  if (!userId || !requested) return { requested: requested || 0, applied: 0, discount: 0, reason: requested ? 'login_required' : null };
  if (!Number.isInteger(requested) || requested < 0) return { requested, applied: 0, discount: 0, reason: 'invalid' };
  const blocks = Math.floor(Math.min(requested, balance(userId)) / BLOCK_POINTS);
  const cap = Math.floor((base * MAX_SHARE) / BLOCK_VALUE);
  const use = Math.max(0, Math.min(blocks, cap));
  const reason = requested % BLOCK_POINTS ? 'blocks_of_100' : requested > balance(userId) ? 'insufficient' : use < requested / BLOCK_POINTS ? 'capped' : null;
  return { requested, applied: use * BLOCK_POINTS, discount: use * BLOCK_VALUE, reason };
}

// Entries are appended atomically; redeem re-checks the balance inside the write.
const add = (userId, type, points, orderId, note) => db.mutate('rewards', (l) => {
  if (type === 'redeem' && l.filter((r) => r.userId === userId).reduce((n, r) => n + r.points, 0) < Math.abs(points)) throw httpError(409, 'insufficient_points');
  l.push({ id: db.newId('rw'), userId, type, points: type === 'redeem' ? -Math.abs(points) : points, orderId: orderId || null, note: note || '', createdAt: new Date().toISOString() });
});

module.exports = { balance, history, earnFor, redemption, add, BLOCK_POINTS, BLOCK_VALUE, EARN_PER_NAIRA };
