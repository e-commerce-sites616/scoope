'use strict';
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.DEMO_ORDER_PACE_SECONDS = '1';
process.env.DATA_DIR = path.join(os.tmpdir(), `scoope-ord-${process.pid}`);
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/server/services/db');
const rl = require('../src/server/middleware/ratelimit');
const { createServer } = require('../src/server/app');

let server, base;
beforeEach(() => rl.clear());
before(async () => { await db.start(); server = createServer(); await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); await fsp.rm(process.env.DATA_DIR, { recursive: true, force: true }); });

// tiny client with a cookie + csrf jar
function client() {
  const c = { sid: null, csrf: null };
  c.call = async (method, p, body, extra = {}) => {
    const headers = { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...extra };
    if (c.sid) headers.cookie = `sid=${c.sid}`;
    if (c.csrf && !('x-csrf-token' in headers)) headers['x-csrf-token'] = c.csrf;
    const res = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie'); const m = sc && sc.match(/sid=([^;]*)/);
    if (m) c.sid = m[1] || null;
    let json = null; try { json = await res.json(); } catch { /* not json */ }
    if (json?.csrf) c.csrf = json.csrf;
    return { status: res.status, json, headers: res.headers };
  };
  return c;
}
let n = 0;
async function signup(over = {}) { const c = client(); const email = over.email || `user${++n}@example.com`; const r = await c.call('POST', '/api/v1/auth/register', { email, name: 'Ada Obi', password: 'correct-horse-9', ...over }); assert.equal(r.status, 200, JSON.stringify(r.json)); c.email = email; c.id = r.json.user.id; return c; }
const body = (over = {}) => ({ lines: [{ productId: 'prod_vanilla-bean', qty: 2 }], customer: { name: 'Ada Obi', email: 'ada@example.com', phone: '0801 234 5678' }, address: { line1: '12 Test Street', area: 'Yaba', notes: '' }, idempotencyKey: `idem-${Math.random().toString(36).slice(2, 12)}xx`, ...over });
const inv = (slug) => db.read('inventory').find((i) => i.productId === `prod_${slug}`);
const guest = () => client();

test('register, me, logout; cookie is HttpOnly + SameSite; no secrets leak', async () => {
  const c = client();
  const r = await c.call('POST', '/api/v1/auth/register', { email: 'New@Example.com', name: 'Ada Obi', password: 'correct-horse-9' });
  assert.equal(r.status, 200); assert.equal(r.json.user.email, 'new@example.com');
  const sc = r.headers.get('set-cookie'); assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/);
  assert.ok(!JSON.stringify(r.json).match(/scrypt|passwordHash/));
  assert.equal((await c.call('GET', '/api/v1/auth/me')).json.user.name, 'Ada Obi');
  assert.equal((await c.call('POST', '/api/v1/auth/logout', {})).status, 200);
  const old = c.sid; c.sid = old;
  assert.equal((await c.call('GET', '/api/v1/auth/me')).json.user, null, 'logged-out session is dead');
  const stored = db.read('users').find((u) => u.email === 'new@example.com');
  assert.match(stored.passwordHash, /^scrypt\$16384\$[0-9a-f]{32}\$[0-9a-f]{128}$/); assert.ok(!stored.passwordHash.includes('correct-horse'));
});

test('registration validation, duplicate email, wrong password, unknown user', async () => {
  const c = client();
  assert.equal((await c.call('POST', '/api/v1/auth/register', { email: 'nope', name: '', password: 'short' })).status, 400);
  await signup({ email: 'dupe@example.com' });
  assert.equal((await client().call('POST', '/api/v1/auth/register', { email: 'DUPE@example.com', name: 'x', password: 'correct-horse-9' })).status, 409);
  assert.equal((await client().call('POST', '/api/v1/auth/login', { email: 'dupe@example.com', password: 'wrong-password' })).status, 401);
  const u = await client().call('POST', '/api/v1/auth/login', { email: 'ghost@example.com', password: 'wrong-password' });
  assert.equal(u.status, 401); assert.equal(u.json.error, 'invalid_credentials', 'same error as a wrong password');
});

test('login issues a fresh session (no fixation); logout kills it; expired sessions are rejected', async () => {
  const a = await signup({ email: 'fix@example.com' }); const first = a.sid;
  const b = client(); b.sid = first;
  const r = await b.call('POST', '/api/v1/auth/login', { email: 'fix@example.com', password: 'correct-horse-9' });
  assert.equal(r.status, 200); assert.notEqual(b.sid, first);
  await db.mutate('sessions', (l) => { l.forEach((s) => { s.expiresAt = '2020-01-01T00:00:00.000Z'; }); });
  assert.equal((await b.call('GET', '/api/v1/auth/me')).json.user, null);
});

test('login is rate limited per account and IP', async () => {
  await signup({ email: 'rl@example.com' });
  let last; for (let i = 0; i < 8; i++) last = await client().call('POST', '/api/v1/auth/login', { email: 'rl@example.com', password: 'bad-password-1' });
  assert.equal(last.status, 429); assert.ok(last.headers.get('retry-after'));
  assert.equal((await client().call('POST', '/api/v1/auth/login', { email: 'rl@example.com', password: 'correct-horse-9' })).status, 429, 'even the right password is held during lockout');
});

test('CSRF: a session-bearing write without the token is refused; bad origin refused; token works', async () => {
  const c = await signup();
  assert.equal((await c.call('PATCH', '/api/v1/account/profile', { name: 'X' }, { 'x-csrf-token': '' })).status, 403);
  assert.equal((await c.call('PATCH', '/api/v1/account/profile', { name: 'X' }, { 'x-csrf-token': 'wrong' })).status, 403);
  assert.equal((await c.call('PATCH', '/api/v1/account/profile', { name: 'X' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await c.call('PATCH', '/api/v1/account/profile', { name: 'Bola Eze', phone: '08012345678' })).status, 200);
  assert.equal((await client().call('GET', '/api/v1/account')).status, 401);
});

test('password change needs the current password and signs out other devices', async () => {
  const a = await signup(); const other = client(); await other.call('POST', '/api/v1/auth/login', { email: a.email, password: 'correct-horse-9' });
  assert.equal((await a.call('POST', '/api/v1/account/password', { current: 'wrong', next: 'brand-new-pass-1' })).status, 403);
  assert.equal((await a.call('POST', '/api/v1/account/password', { current: 'correct-horse-9', next: 'short' })).status, 400);
  assert.equal((await a.call('POST', '/api/v1/account/password', { current: 'correct-horse-9', next: 'brand-new-pass-1' })).status, 200);
  assert.equal((await a.call('GET', '/api/v1/auth/me')).json.user.email, a.email, 'this device stays signed in');
  assert.equal((await other.call('GET', '/api/v1/auth/me')).json.user, null, 'other device signed out');
  assert.equal((await client().call('POST', '/api/v1/auth/login', { email: a.email, password: 'brand-new-pass-1' })).status, 200);
});

test('guest checkout: server computes the total; client totals are ignored; stock is reserved', async () => {
  const before = inv('vanilla-bean'); const g = guest();
  const r = await g.call('POST', '/api/v1/orders', body({ total: 1, subtotal: 1, deliveryFee: 0, lines: [{ productId: 'prod_vanilla-bean', qty: 2, unit: 1, price: 1 }] }));
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.order.total, 5600 + 2500); assert.equal(r.json.order.deliveryFee, 2500);
  assert.match(r.json.reference, /^SCP-[A-Z2-9]{6}$/); assert.ok(r.json.token.length >= 32);
  assert.equal(inv('vanilla-bean').reserved, before.reserved + 2);
  assert.equal(inv('vanilla-bean').onHand, before.onHand, 'not committed until paid');
  const raw = JSON.stringify(db.read('orders')); assert.ok(!raw.includes(r.json.token), 'token itself is never stored, only its hash');
});

test('checkout rejects bad input, unserved areas, minimum order and unavailable items', async () => {
  const g = guest(); const post = (b) => g.call('POST', '/api/v1/orders', b);
  assert.equal((await post(body({ customer: { name: '', email: 'x', phone: 'abc' } }))).status, 400);
  assert.equal((await post(body({ idempotencyKey: 'x' }))).status, 400);
  assert.equal((await post(body({ address: { line1: '12 Test Street', area: 'Mars' } }))).json.error, 'area_not_served');
  assert.equal((await post(body({ lines: [{ productId: 'prod_vanilla-bean', qty: 1 }] }))).json.error, 'below_minimum');
  assert.equal((await post(body({ lines: [{ productId: 'prod_celebration-collection', qty: 1 }] }))).json.error, 'cart_invalid');
  assert.equal((await post(body({ lines: [{ productId: 'prod_vanilla-bean', qty: -3 }] }))).json.error, 'cart_invalid');
  assert.equal((await post(body({ lines: [] }))).status, 422);
  await db.mutate('settings', (s) => { s.deliveryEnabled = false; });
  assert.equal((await post(body())).json.error, 'delivery_unavailable');
  await db.mutate('settings', (s) => { s.deliveryEnabled = true; });
});

test('duplicate submissions (same idempotency key) create one order and reserve stock once', async () => {
  const b = body(); const before = inv('belgian-chocolate').reserved; b.lines = [{ productId: 'prod_belgian-chocolate', qty: 1 }, { productId: 'prod_vanilla-bean', qty: 1 }];
  const rs = await Promise.all([1, 2, 3].map(() => guest().call('POST', '/api/v1/orders', b)));
  assert.equal(rs.filter((r) => r.status === 201).length, 1); assert.equal(rs.filter((r) => r.json.duplicate).length, 2);
  assert.equal(inv('belgian-chocolate').reserved, before + 1);
  assert.equal(db.read('orders').filter((o) => o.idempotencyKey === b.idempotencyKey).length, 1);
});

test('overselling is impossible: concurrent orders for the last units, only one wins', async () => {
  await db.mutate('inventory', (l) => { const r = l.find((i) => i.productId === 'prod_caramel-crunch'); r.onHand = 5; r.reserved = 0; });
  const mk = () => body({ lines: [{ productId: 'prod_caramel-crunch', qty: 4 }], idempotencyKey: `race-${Math.random().toString(36).slice(2, 12)}` });
  const rs = await Promise.all([guest().call('POST', '/api/v1/orders', mk()), guest().call('POST', '/api/v1/orders', mk())]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409]);
  assert.equal(inv('caramel-crunch').reserved, 4);
});

test('payment: failure keeps the order payable; success commits stock; paying twice does nothing', async () => {
  const g = guest(); const o = await g.call('POST', '/api/v1/orders', body({ lines: [{ productId: 'prod_double-scoop', qty: 1 }] }));
  const key = o.json.token; const b0 = inv('double-scoop');
  const f = await g.call('POST', `/api/v1/orders/${key}/pay`, { scenario: 'fail' });
  assert.equal(f.status, 402); assert.equal(f.json.order.paymentStatus, 'failed'); assert.equal(f.json.order.canPay, true); assert.equal(f.json.attemptsLeft, 4);
  const s = await g.call('POST', `/api/v1/orders/${key}/pay`, { scenario: 'success' });
  assert.equal(s.status, 200); assert.equal(s.json.order.paymentStatus, 'paid'); assert.equal(s.json.order.status, 'payment_confirmed');
  assert.equal(inv('double-scoop').onHand, b0.onHand - 1); assert.equal(inv('double-scoop').reserved, b0.reserved - 1);
  await g.call('POST', `/api/v1/orders/${key}/pay`, { scenario: 'success' });
  assert.equal(inv('double-scoop').onHand, b0.onHand - 1, 'no double decrement');
  const pays = db.read('payments').filter((p) => p.orderId === db.read('orders').find((x) => x.reference === o.json.reference).id);
  assert.deepEqual(pays.map((p) => p.status), ['failed', 'succeeded']); assert.ok(pays.every((p) => /^DEMO-/.test(p.reference) && p.provider === 'demo'));
});

test('payment attempts are capped', async () => {
  const g = guest(); const o = await g.call('POST', '/api/v1/orders', body());
  for (let i = 0; i < 5; i++) await g.call('POST', `/api/v1/orders/${o.json.token}/pay`, { scenario: 'fail' });
  assert.equal((await g.call('POST', `/api/v1/orders/${o.json.token}/pay`, { scenario: 'success' })).status, 409);
});

test('tracking is by secret token only: guessing, references and other users get 404', async () => {
  const g = guest(); const o = await g.call('POST', '/api/v1/orders', body());
  assert.equal((await g.call('GET', `/api/v1/orders/${o.json.token}`)).status, 200);
  const t = o.json.token; const wrong = t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A');
  assert.equal((await g.call('GET', `/api/v1/orders/${wrong}`)).status, 404);
  assert.equal((await g.call('GET', `/api/v1/orders/${o.json.reference}`)).status, 404, 'a reference alone is not enough');
  assert.equal((await g.call('GET', '/api/v1/orders/1')).status, 404);
  const view = (await g.call('GET', `/api/v1/orders/${o.json.token}`)).json;
  assert.ok(!JSON.stringify(view).match(/trackingHash|userId|idempotency/)); assert.match(view.customer.email, /^a\*\*\*@/);
});

test('owners can open their orders by reference; other accounts cannot (no IDOR)', async () => {
  const a = await signup(), b = await signup();
  const o = await a.call('POST', '/api/v1/orders', body({ customer: { name: 'Ada Obi', email: a.email, phone: '08011111111' } }));
  assert.equal((await a.call('GET', `/api/v1/orders/${o.json.reference}`)).status, 200);
  assert.equal((await b.call('GET', `/api/v1/orders/${o.json.reference}`)).status, 404);
  assert.equal((await guest().call('GET', `/api/v1/orders/${o.json.reference}`)).status, 404);
  assert.deepEqual((await a.call('GET', '/api/v1/account/orders')).json.items.map((x) => x.reference), [o.json.reference]);
  assert.equal((await b.call('GET', '/api/v1/account/orders')).json.items.length, 0);
});

test('cancel: unpaid releases the reservation; paid records a refund and restores stock', async () => {
  const g = guest(); const b0 = inv('vanilla-bean');
  const o1 = await g.call('POST', '/api/v1/orders', body()); assert.equal(inv('vanilla-bean').reserved, b0.reserved + 2);
  assert.equal((await g.call('POST', `/api/v1/orders/${o1.json.token}/cancel`, {})).json.order.status, 'cancelled');
  assert.equal(inv('vanilla-bean').reserved, b0.reserved);
  const o2 = await g.call('POST', '/api/v1/orders', body()); await g.call('POST', `/api/v1/orders/${o2.json.token}/pay`, { scenario: 'success' });
  assert.equal(inv('vanilla-bean').onHand, b0.onHand - 2);
  const c = await g.call('POST', `/api/v1/orders/${o2.json.token}/cancel`, {});
  assert.equal(c.json.order.refunded, true); assert.equal(inv('vanilla-bean').onHand, b0.onHand);
  assert.ok(db.read('payments').some((p) => p.kind === 'refund' && p.status === 'refunded'));
  assert.equal((await g.call('POST', `/api/v1/orders/${o2.json.token}/cancel`, {})).status, 409, 'cannot cancel twice');
});

test('unpaid orders expire and release stock', async () => {
  const g = guest(); const b0 = inv('vanilla-bean'); const o = await g.call('POST', '/api/v1/orders', body());
  await db.mutate('orders', (l) => { l.find((x) => x.reference === o.json.reference).reservedUntil = new Date(Date.now() - 1000).toISOString(); });
  const v = await g.call('GET', `/api/v1/orders/${o.json.token}`);
  assert.equal(v.json.status, 'cancelled'); assert.equal(v.json.cancelReason, 'expired'); assert.equal(inv('vanilla-bean').reserved, b0.reserved);
  assert.equal((await g.call('POST', `/api/v1/orders/${o.json.token}/pay`, { scenario: 'success' })).status, 409);
});

test('paid orders advance through the simulated lifecycle', async () => {
  const g = guest(); const o = await g.call('POST', '/api/v1/orders', body()); await g.call('POST', `/api/v1/orders/${o.json.token}/pay`, { scenario: 'success' });
  await new Promise((r) => setTimeout(r, 2300));
  const v = (await g.call('GET', `/api/v1/orders/${o.json.token}`)).json;
  assert.ok(['preparing', 'ready_for_dispatch', 'confirmed'].includes(v.status), v.status);
  assert.ok(v.timeline.filter((t) => t.at).length >= 3);
  await new Promise((r) => setTimeout(r, 4500));
  assert.equal((await g.call('GET', `/api/v1/orders/${o.json.token}`)).json.status, 'delivered');
  assert.equal((await g.call('POST', `/api/v1/orders/${o.json.token}/cancel`, {})).status, 409, 'too late to cancel');
});

test('rewards: earn on payment, redeem in blocks with a cap, reverse on cancel, never overspend', async () => {
  const u = await signup(); const mk = (extra = {}) => body({ customer: { name: 'Ada Obi', email: u.email, phone: '08011111111' }, lines: [{ productId: 'prod_belgian-chocolate', qty: 10 }], ...extra }); // 32,000
  const o = await u.call('POST', '/api/v1/orders', mk()); await u.call('POST', `/api/v1/orders/${o.json.token}/pay`, { scenario: 'success' });
  let d = (await u.call('GET', '/api/v1/account')).json; assert.equal(d.rewards.balance, 320); assert.equal(d.points, 320);
  const q = await u.call('POST', '/api/v1/cart/quote', { lines: [{ productId: 'prod_belgian-chocolate', qty: 10 }], redeemPoints: 300 });
  assert.equal(q.json.points.applied, 300); assert.equal(q.json.points.discount, 1500); assert.equal(q.json.total, 32000 - 1500);
  assert.equal((await u.call('POST', '/api/v1/cart/quote', { lines: [{ productId: 'prod_belgian-chocolate', qty: 10 }], redeemPoints: 150 })).json.points.applied, 100, 'blocks of 100');
  assert.equal((await u.call('POST', '/api/v1/cart/quote', { lines: [{ productId: 'prod_belgian-chocolate', qty: 10 }], redeemPoints: 99999 })).json.points.applied, 300, 'limited to balance');
  assert.equal((await guest().call('POST', '/api/v1/cart/quote', { lines: [{ productId: 'prod_belgian-chocolate', qty: 10 }], redeemPoints: 300 })).json.points.applied, 0, 'guests cannot redeem');
  const o2 = await u.call('POST', '/api/v1/orders', mk({ redeemPoints: 300 })); assert.equal(o2.json.order.pointsDiscount, 1500);
  assert.equal((await u.call('GET', '/api/v1/account')).json.rewards.balance, 20);
  const dbl = await u.call('POST', '/api/v1/orders', mk({ redeemPoints: 300 })); assert.equal(dbl.json.order.pointsDiscount, 0, 'cannot spend points twice');
  await u.call('POST', `/api/v1/orders/${o2.json.token}/cancel`, {});
  assert.equal((await u.call('GET', '/api/v1/account')).json.rewards.balance, 320, 'points returned on cancel');
  await u.call('POST', `/api/v1/orders/${o.json.token}/cancel`, {});
  assert.equal((await u.call('GET', '/api/v1/account')).json.rewards.balance, 0, 'earned points reversed when a paid order is cancelled');
});

test('saved addresses: owner only', async () => {
  const a = await signup(), b = await signup();
  const r = await a.call('POST', '/api/v1/account/addresses', { label: 'Home', line1: '5 Palm Avenue', area: 'Ikoyi' }); assert.equal(r.status, 201);
  assert.equal((await a.call('POST', '/api/v1/account/addresses', { line1: '5 Palm Avenue', area: 'Nowhere' })).status, 400);
  assert.equal((await b.call('DELETE', `/api/v1/account/addresses/${r.json.id}`)).status, 404);
  assert.equal((await a.call('GET', '/api/v1/account')).json.addresses.length, 1);
  assert.equal((await a.call('DELETE', `/api/v1/account/addresses/${r.json.id}`)).status, 200);
});

test('reviews: sign-in required, validated, one per product, verified-purchase flag, no email leak', async () => {
  const u = await signup(); const post = (c, b) => c.call('POST', '/api/v1/products/vanilla-bean/reviews', b);
  assert.equal((await post(guest(), { rating: 5, body: 'Lovely and creamy' })).status, 401);
  assert.equal((await post(u, { rating: 6, body: 'Lovely and creamy' })).status, 400);
  assert.equal((await post(u, { rating: 5, body: 'short' })).status, 400);
  const ok = await post(u, { rating: 4, title: 'Nice', body: '<b>Really</b> lovely and creamy' }); assert.equal(ok.status, 201);
  assert.equal(ok.json.items[0].verified, false); assert.equal(ok.json.count, 1); assert.equal(ok.json.average, 4);
  assert.equal((await post(u, { rating: 5, body: 'Trying to review twice' })).status, 409);
  assert.ok(!JSON.stringify(ok.json).includes(u.email));
  const o = await u.call('POST', '/api/v1/orders', body({ customer: { name: 'Ada Obi', email: u.email, phone: '08011111111' }, lines: [{ productId: 'prod_salted-caramel', qty: 2 }] })); await u.call('POST', `/api/v1/orders/${o.json.token}/pay`, { scenario: 'success' });
  const v = await u.call('POST', '/api/v1/products/salted-caramel/reviews', { rating: 5, body: 'Burnt sugar perfection' }); assert.equal(v.json.items[0].verified, true);
  const list = await guest().call('GET', '/api/v1/products/vanilla-bean/reviews'); assert.equal(list.json.count, 1);
  assert.match(await (await fetch(base + '/product/vanilla-bean')).text(), /"aggregateRating"/);
  assert.equal((await post(await signup(), { rating: 5, body: 'Review of unknown' })).status, 201);
  assert.equal((await u.call('POST', '/api/v1/products/nope/reviews', { rating: 5, body: 'Review of unknown' })).status, 404);
});

test('newsletter: consent required, duplicates handled, unsubscribe works; contact form validated', async () => {
  const g = guest(); const sub = (b) => g.call('POST', '/api/v1/newsletter', b);
  assert.equal((await sub({ email: 'bad', consent: true })).status, 400);
  assert.equal((await sub({ email: 'fan@example.com' })).json.error, 'consent_required');
  const a = await sub({ email: 'Fan@Example.com', consent: true }); assert.equal(a.json.status, 'subscribed');
  assert.equal((await sub({ email: 'fan@example.com', consent: true })).json.status, 'already');
  assert.equal(db.read('subscribers').filter((s) => s.email === 'fan@example.com').length, 1);
  const token = a.json.unsubscribeUrl.split('/').pop();
  assert.equal((await g.call('POST', '/api/v1/newsletter/unsubscribe', { token: 'nope' })).status, 404);
  assert.equal((await g.call('POST', '/api/v1/newsletter/unsubscribe', { token })).status, 200);
  assert.equal((await sub({ email: 'fan@example.com', consent: true })).json.status, 'resubscribed');
  assert.equal((await g.call('POST', '/api/v1/contact', { name: 'A', email: 'x', message: 'hi' })).status, 400);
  assert.equal((await g.call('POST', '/api/v1/contact', { name: 'Ada', email: 'ada@example.com', message: 'A flavour idea for you' })).status, 201);
});

test('pages: app shells, policies, gift, homepage sections and sensitive-page headers', async () => {
  for (const p of ['/checkout', '/account', '/pay/abc', '/track/abc', '/gift', '/our-story', '/contact', '/privacy', '/terms', '/delivery-and-refunds', '/unsubscribe/abc']) { const r = await fetch(base + p); assert.equal(r.status, 200, p); const t = await r.text(); assert.ok(!t.includes('{{'), p); }
  const t = await (await fetch(base + '/track/abc')).text(); assert.match(t, /name="robots" content="noindex"/); assert.match(t, /name="referrer" content="no-referrer"/);
  assert.equal((await fetch(base + '/track/abc')).headers.get('cache-control'), 'no-store');
  const home = await (await fetch(base + '/')).text();
  for (const m of [/class="season on-dark"/, /Bestsellers\./, /data-newsletter/, /class="strip__row"/, /Illustrative quotes/]) assert.match(home, m);
  assert.match(await (await fetch(base + '/gift')).text(), /name="gift" value="prod_the-sweet-box"/);
  assert.match(await (await fetch(base + '/sitemap.xml')).text(), /\/our-story/);
  await db.mutate('settings', (s) => { s.seasonal.expiresAt = '2020-01-01T00:00:00Z'; });
  assert.ok(!(await (await fetch(base + '/')).text()).includes('class="season on-dark"'), 'expired campaign hides itself');
});
