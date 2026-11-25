'use strict';
const crypto = require('node:crypto');
const db = require('./db');
const pricing = require('./pricing');
const rewards = require('./rewards');
const { provider } = require('./payments');
const { httpError } = require('../utils/errors');
const { sha, EMAIL } = require('./auth');

const FLOW = ['pending_payment', 'payment_confirmed', 'confirmed', 'preparing', 'ready_for_dispatch', 'out_for_delivery', 'delivered'];
const LABELS = { pending_payment: 'Awaiting payment', payment_confirmed: 'Payment confirmed', confirmed: 'Order confirmed', preparing: 'Preparing', ready_for_dispatch: 'Ready for dispatch', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded' };
const HOLD_MS = 30 * 60 * 1000;                 // unpaid orders keep their stock for 30 minutes
const MAX_PAY_ATTEMPTS = 5;
const pace = () => Math.max(1, Number(process.env.DEMO_ORDER_PACE_SECONDS) || 45) * 1000;

// ---- per-key async lock: serialises concurrent requests for the same order or idempotency key
const locks = new Map();
async function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  locks.set(key, run);
  try { return await run; } finally { if (locks.get(key) === run) locks.delete(key); }
}

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newRef = () => 'SCP-' + Array.from(crypto.randomBytes(6), (b) => ALPHA[b % ALPHA.length]).join('');
const maskEmail = (e) => e.replace(/^(.).*(@.*)$/, '$1***$2');

// ---- stock: reserve at order creation, commit on payment, release on cancel/expiry
const stockLines = (lines) => { const m = new Map(); for (const l of lines) if (l.productId) m.set(l.productId, (m.get(l.productId) || 0) + l.qty); return m; };
const reserve = (lines) => db.mutate('inventory', (inv) => {
  for (const [pid, qty] of stockLines(lines)) {
    const row = inv.find((i) => i.productId === pid);
    if (!row || row.onHand - row.reserved < qty) throw httpError(409, 'insufficient_stock');
    row.reserved += qty;
  }
});
const adjust = (lines, { reserved = 0, onHand = 0 }) => db.mutate('inventory', (inv) => {
  for (const [pid, qty] of stockLines(lines)) { const row = inv.find((i) => i.productId === pid); if (row) { row.reserved = Math.max(0, row.reserved + reserved * qty); row.onHand = Math.max(0, row.onHand + onHand * qty); } }
});

function estimate(zone, from = new Date()) {
  const st = db.read('settings');
  const [oh, om] = (st.operatingHours?.open || '10:00').split(':').map(Number); const [ch, cm] = (st.operatingHours?.close || '21:00').split(':').map(Number);
  const start = new Date(from); const open = new Date(from); open.setHours(oh, om, 0, 0); const close = new Date(from); close.setHours(ch, cm, 0, 0);
  if (start < open) start.setTime(open.getTime()); else if (start > close) { start.setDate(start.getDate() + 1); start.setHours(oh, om, 0, 0); }
  const lo = new Date(start.getTime() + (st.prepMinutes + (zone?.etaMinutes || 30)) * 60000);
  return { from: lo.toISOString(), to: new Date(lo.getTime() + 20 * 60000).toISOString(), outsideHours: from < open || from > close };
}

// ---- views
function view(o, { forOwner = false } = {}) {
  return {
    reference: o.reference, createdAt: o.createdAt, status: o.status, statusLabel: LABELS[o.status], paymentStatus: o.paymentStatus,
    items: o.lines.map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, lineTotal: l.lineTotal, options: l.options || '', slug: l.slug || null })),
    subtotal: o.subtotal, discount: o.discount, pointsDiscount: o.pointsDiscount || 0, couponCode: o.couponCode || null, deliveryFee: o.deliveryFee, total: o.total, currency: 'NGN',
    customer: { name: o.customer.name, email: maskEmail(o.customer.email) },
    delivery: { line1: o.address.line1, area: o.address.area, zone: o.address.zoneName, notes: o.address.notes || '' },
    gift: o.gift || null, estimate: o.estimate, pointsEarned: o.pointsEarned || 0,
    timeline: FLOW.map((s) => ({ status: s, label: LABELS[s], at: (o.timeline.find((t) => t.status === s) || {}).at || null })),
    cancelled: o.status === 'cancelled', refunded: o.paymentStatus === 'refunded', cancelReason: o.cancelReason || null,
    canPay: o.status === 'pending_payment' && new Date(o.reservedUntil) > new Date() && (o.paymentAttempts || 0) < MAX_PAY_ATTEMPTS,
    canCancel: ['pending_payment', 'payment_confirmed', 'confirmed'].includes(o.status), reservedUntil: o.status === 'pending_payment' ? o.reservedUntil : null,
    demoNote: 'Demonstration order. No real payment was taken and nothing will be delivered. Status updates are simulated.',
  };
}

// ---- simulated kitchen & rider: status advances with elapsed time since payment
async function refresh(o) {
  if (o.paymentStatus !== 'paid' || o.status === 'cancelled') return o;
  const steps = Math.min(FLOW.length - 1, 1 + Math.floor((Date.now() - new Date(o.paidAt).getTime()) / pace()));
  if (FLOW.indexOf(o.status) >= steps) return o;
  return db.mutate('orders', (l) => {
    const row = l.find((x) => x.id === o.id);
    for (let i = FLOW.indexOf(row.status) + 1; i <= steps; i++) if (!row.timeline.some((t) => t.status === FLOW[i])) row.timeline.push({ status: FLOW[i], at: new Date(new Date(row.paidAt).getTime() + (i - 1) * pace()).toISOString() });
    row.status = FLOW[steps]; row.updatedAt = new Date().toISOString();
    return structuredClone(row);
  });
}

async function releaseUnpaid(o, reason) {
  const lines = o.lines.filter((l) => l.productId);
  await adjust(lines, { reserved: -1 });
  const redeemed = db.read('rewards').filter((r) => r.orderId === o.id);
  const net = redeemed.reduce((n, r) => n + r.points, 0);
  if (net < 0) await rewards.add(o.userId, 'reversal', -net, o.id, `Points returned: order ${reason}`);
}
async function expireSweep() {
  const now = Date.now();
  const stale = db.read('orders').filter((o) => o.status === 'pending_payment' && new Date(o.reservedUntil).getTime() < now);
  for (const o of stale) await withLock(`order:${o.id}`, async () => {
    const cur = db.get('orders', o.id);
    if (!cur || cur.status !== 'pending_payment') return;
    await releaseUnpaid(cur, 'expired');
    await db.mutate('orders', (l) => { const r = l.find((x) => x.id === o.id); r.status = 'cancelled'; r.cancelReason = 'expired'; r.paymentStatus = 'unpaid'; r.timeline.push({ status: 'cancelled', at: new Date().toISOString() }); });
  });
  return stale.length;
}

// ---- create
const cleanStr = (v, min, max, label, errors) => { const s = String(v ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, ' '); if (s.length < min || s.length > max) errors.push(label); return s; };

async function create(input, user) {
  const errors = [];
  const customer = { name: cleanStr(input.customer?.name, 2, 80, 'Enter your name.', errors), email: String(input.customer?.email || '').trim().toLowerCase(), phone: cleanStr(input.customer?.phone, 7, 20, 'Enter a phone number.', errors) };
  if (!EMAIL.test(customer.email)) errors.push('Enter a valid email address.');
  if (!/^[0-9+\-() ]{7,20}$/.test(customer.phone)) errors.push('Phone number may only contain digits, spaces, + - ( ).');
  const a = input.address || {};
  const address = { line1: cleanStr(a.line1, 5, 160, 'Enter your street address.', errors), area: cleanStr(a.area, 2, 60, 'Choose your area.', errors), notes: cleanStr(a.notes || '', 0, 200, 'Delivery notes are too long.', errors) };
  const key = String(input.idempotencyKey || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) errors.push('Missing checkout reference. Please reload the page.');
  let gift = null;
  if (input.gift) { const e2 = []; const to = cleanStr(input.gift.recipient, 2, 80, 'Enter the recipient name.', e2); const message = cleanStr(input.gift.message || '', 0, 300, 'Gift message is too long.', e2); errors.push(...e2); gift = { recipient: to, message }; }
  if (errors.length) throw httpError(400, 'validation', errors);

  return withLock(`idem:${key}`, async () => {
    const dup = db.read('orders').find((o) => o.idempotencyKey === key && (user ? o.userId === user.id : o.customer.email === customer.email));
    if (dup) return { order: dup, duplicate: true };

    const zone = db.read('delivery-zones').find((z) => z.active && z.areas.includes(address.area));
    if (!zone) throw httpError(422, 'area_not_served', ['We do not deliver to that area.']);
    const q = pricing.quote({ lines: input.lines, couponCode: input.couponCode, zoneId: zone.id, redeemPoints: Number.isInteger(input.redeemPoints) ? input.redeemPoints : 0, userId: user?.id });
    if (!q.subtotal || q.hasProblems) throw httpError(422, 'cart_invalid', ['Some items in your bag are unavailable. Please review your bag.']);
    if (q.belowMinimum) throw httpError(422, 'below_minimum', [`The minimum order is ₦${q.minimumOrder.toLocaleString('en-NG')}.`]);
    if (!q.delivery?.available) throw httpError(422, 'delivery_unavailable', ['Delivery is not available right now.']);

    const settings = db.read('settings');
    const today = new Date().toDateString();
    if (db.read('orders').filter((o) => new Date(o.createdAt).toDateString() === today && o.status !== 'cancelled').length >= settings.dailyOrderLimit) throw httpError(409, 'daily_limit', ['We have reached our order limit for today.']);

    const lines = q.lines.map((l) => ({ type: l.type, productId: l.productId || null, slug: l.slug || null, name: l.name, qty: l.qty, unit: l.unit, lineTotal: l.lineTotal,
      options: l.type === 'build' ? [l.summary.base, l.summary.scoops.map((x) => `${x.qty}x ${x.name}`).join(', '), ...l.summary.toppings, ...l.summary.sauces, ...l.summary.extras].join(', ') : [l.sizeLabel, l.variantLabel].filter(Boolean).join(', '),
      config: l.config || null, size: l.size ?? null, variant: l.variant ?? null }));

    await reserve(lines);
    const token = crypto.randomBytes(24).toString('base64url');
    const id = db.newId('ord');
    let pointsUsed = 0;
    try {
      if (q.points.applied > 0) { await rewards.add(user.id, 'redeem', q.points.applied, id, 'Redeemed at checkout'); pointsUsed = q.points.applied; }
      const now = new Date();
      const order = {
        id, reference: newRef(), trackingHash: sha(token), userId: user?.id || null, idempotencyKey: key,
        status: 'pending_payment', paymentStatus: 'unpaid', paymentAttempts: 0,
        customer, address: { ...address, zoneId: zone.id, zoneName: zone.name }, lines, gift,
        subtotal: q.subtotal, couponCode: q.coupon?.valid ? q.coupon.code : null, couponDiscount: q.discount, pointsRedeemed: pointsUsed, pointsDiscount: q.points.discount,
        discount: q.discount + q.points.discount, deliveryFee: q.delivery.fee, total: q.total, currency: 'NGN',
        estimate: estimate(zone, now), reservedUntil: new Date(now.getTime() + HOLD_MS).toISOString(),
        timeline: [{ status: 'pending_payment', at: now.toISOString() }],
        createdAt: now.toISOString(), updatedAt: now.toISOString(),
      };
      await db.mutate('orders', (l) => { l.push(order); });
      return { order, token, duplicate: false };
    } catch (e) {
      await adjust(lines, { reserved: -1 }).catch(() => {});
      if (pointsUsed) await rewards.add(user.id, 'reversal', pointsUsed, id, 'Order failed').catch(() => {});
      throw e;
    }
  });
}

// ---- lookup: guests by secret token; owners by reference + session. Unknown and forbidden look identical.
async function find(key, user) {
  await expireSweep();
  let o = null;
  if (/^SCP-[A-Z0-9]{6}$/.test(key)) { if (user) o = db.read('orders').find((x) => x.reference === key && x.userId === user.id); }
  else if (/^[A-Za-z0-9_-]{20,64}$/.test(key)) { const h = sha(key); o = db.read('orders').find((x) => x.trackingHash === h); }
  return o ? refresh(o) : null;
}
const listFor = async (userId) => Promise.all(db.read('orders').filter((o) => o.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(refresh));

// ---- pay
async function pay(key, user, scenario) {
  const found = await find(key, user);
  if (!found) throw httpError(404, 'order_not_found');
  return withLock(`order:${found.id}`, async () => {
    const o = db.get('orders', found.id);
    if (o.paymentStatus === 'paid') return { order: await refresh(o), already: true };
    if (o.status !== 'pending_payment') throw httpError(409, 'not_payable');
    if (new Date(o.reservedUntil) < new Date()) { await expireSweep(); throw httpError(409, 'order_expired'); }
    if ((o.paymentAttempts || 0) >= MAX_PAY_ATTEMPTS) throw httpError(409, 'too_many_attempts');
    const res = await provider.charge({ amount: o.total, scenario: scenario === 'fail' ? 'fail' : 'success', orderRef: o.reference });
    await db.insert('payments', 'pay', { orderId: o.id, reference: res.reference, provider: provider.name, amount: o.total, currency: 'NGN', status: res.status, kind: 'charge', message: res.message });
    if (res.status !== 'succeeded') {
      const upd = await db.mutate('orders', (l) => { const r = l.find((x) => x.id === o.id); r.paymentAttempts += 1; r.paymentStatus = 'failed'; return structuredClone(r); });
      return { order: upd, failed: true, message: res.message, attempts: upd.paymentAttempts };
    }
    const lines = o.lines.filter((l) => l.productId);
    await adjust(lines, { reserved: -1, onHand: -1 });                         // commit stock
    if (o.couponCode) await db.mutate('coupons', (l) => { const c = l.find((x) => x.code === o.couponCode); if (c) c.used = (c.used || 0) + 1; });
    const earned = o.userId ? rewards.earnFor(o.subtotal - o.discount) : 0;
    if (earned > 0) await rewards.add(o.userId, 'earn', earned, o.id, `Order ${o.reference}`);
    const paidAt = new Date().toISOString();
    const upd = await db.mutate('orders', (l) => { const r = l.find((x) => x.id === o.id); Object.assign(r, { paymentStatus: 'paid', status: 'payment_confirmed', paidAt, paymentRef: res.reference, pointsEarned: earned, updatedAt: paidAt }); r.timeline.push({ status: 'payment_confirmed', at: paidAt }); return structuredClone(r); });
    return { order: upd, message: res.message };
  });
}

// ---- cancel (only before preparation starts)
async function cancel(key, user) {
  const found = await find(key, user);
  if (!found) throw httpError(404, 'order_not_found');
  return withLock(`order:${found.id}`, async () => {
    const o = await refresh(db.get('orders', found.id));
    if (!['pending_payment', 'payment_confirmed', 'confirmed'].includes(o.status)) throw httpError(409, 'not_cancellable');
    const lines = o.lines.filter((l) => l.productId);
    if (o.paymentStatus === 'paid') {
      await adjust(lines, { onHand: 1 });
      const r = await provider.refund({ amount: o.total });
      await db.insert('payments', 'pay', { orderId: o.id, reference: r.reference, provider: provider.name, amount: o.total, currency: 'NGN', status: 'refunded', kind: 'refund' });
      if (o.couponCode) await db.mutate('coupons', (l) => { const c = l.find((x) => x.code === o.couponCode); if (c && c.used > 0) c.used -= 1; });
      if (o.pointsEarned) await rewards.add(o.userId, 'reversal', -o.pointsEarned, o.id, 'Order cancelled').catch(() => {});
      const net = db.read('rewards').filter((x) => x.orderId === o.id && x.type === 'redeem').reduce((n, x) => n + x.points, 0);
      if (net < 0) await rewards.add(o.userId, 'reversal', -net, o.id, 'Points returned: order cancelled');
    } else await releaseUnpaid(o, 'cancelled');
    const now = new Date().toISOString();
    const upd = await db.mutate('orders', (l) => { const r = l.find((x) => x.id === o.id); r.status = 'cancelled'; r.cancelReason = 'customer'; if (r.paymentStatus === 'paid') r.paymentStatus = 'refunded'; r.timeline.push({ status: 'cancelled', at: now }); return structuredClone(r); });
    return upd;
  });
}

module.exports = { create, find, listFor, pay, cancel, view, expireSweep, estimate, FLOW, HOLD_MS };
