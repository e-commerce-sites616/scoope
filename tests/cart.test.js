'use strict';
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = path.join(os.tmpdir(), `scoope-cart-${process.pid}`);
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/server/services/db');
const pricing = require('../src/server/services/pricing');
const { createServer } = require('../src/server/app');

let server, base;
const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const q = (lines, extra = {}) => pricing.quote({ lines, ...extra });
const P = (slug) => `prod_${slug}`;
const build = (over = {}) => ({ type: 'build', qty: 1, config: { base: 'cup', scoops: [{ flavour: 'vanilla-bean', qty: 1 }], toppings: [], sauces: [], extras: [], ...over } });

before(async () => {
  await db.start();
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); await fsp.rm(process.env.DATA_DIR, { recursive: true, force: true }); });

test('prices come from the catalogue: variant and size deltas apply', () => {
  const r = q([{ productId: P('vanilla-bean'), variant: 'cone', qty: 2 }, { productId: P('vanilla-family-tub'), size: '1l', qty: 1 }]);
  assert.equal(r.lines[0].unit, 3300); assert.equal(r.lines[0].lineTotal, 6600);
  assert.equal(r.lines[1].unit, 15000);
  assert.equal(r.subtotal, 21600);
});

test('client-supplied prices and totals are ignored', () => {
  const r = q([{ productId: P('belgian-chocolate'), qty: 1, unit: 1, price: 1, lineTotal: 1 }], { subtotal: 1, total: 1 });
  assert.equal(r.lines[0].unit, 3200);
  assert.equal(r.total, 3200);
});

test('invalid quantities are rejected, not clamped', () => {
  for (const qty of [0, -1, 21, 1.5, '2', null, NaN]) {
    const r = q([{ productId: P('vanilla-bean'), qty }]);
    assert.equal(r.lines[0].status, 'invalid', `qty=${qty}`);
    assert.equal(r.subtotal, 0);
  }
});

test('unknown product, bad size and bad variant are rejected', () => {
  assert.equal(q([{ productId: 'prod_nope', qty: 1 }]).lines[0].reason, 'not_found');
  assert.equal(q([{ productId: P('vanilla-family-tub'), size: '9l', qty: 1 }]).lines[0].reason, 'invalid_size');
  assert.equal(q([{ productId: P('vanilla-bean'), variant: 'hax', qty: 1 }]).lines[0].reason, 'invalid_variant');
  assert.equal(q([{ productId: { $ne: 1 }, qty: 1 }]).lines[0].reason, 'not_found');
});

test('sold-out and over-stock lines are flagged and excluded from the total', async () => {
  const out = q([{ productId: P('celebration-collection'), qty: 1 }]);
  assert.equal(out.lines[0].status, 'unavailable'); assert.equal(out.lines[0].reason, 'sold_out'); assert.equal(out.subtotal, 0);
  const few = q([{ productId: P('pistachio-indulgence'), qty: 7 }]);
  assert.equal(few.lines[0].reason, 'insufficient_stock'); assert.equal(few.lines[0].maxQty, 6);
});

test('price changes in the catalogue are reflected immediately', async () => {
  await db.update('products', P('salted-caramel'), { price: 4000 });
  assert.equal(q([{ productId: P('salted-caramel'), qty: 1 }]).lines[0].unit, 4000);
});

test('custom sundae: priced from settings, config sanitised to ids', () => {
  const r = q([build({ base: 'waffle-cone', scoops: [{ flavour: 'vanilla-bean', qty: 2 }, { flavour: 'belgian-chocolate', qty: 1 }], toppings: ['sprinkles', 'chopped-nuts'], sauces: ['caramel'], extras: ['brownie-bites'] })]);
  const l = r.lines[0];
  assert.equal(l.status, 'ok');
  assert.equal(l.unit, 500 + 3 * 2800 + 300 + 500 + 400 + 700);
  assert.deepEqual(l.summary.toppings, ['Sprinkles', 'Chopped nuts']);
});

test('custom sundae validation: limits, unknown ids, duplicates, sold-out flavour', async () => {
  const reason = (over) => q([build(over)]).lines[0].reason;
  assert.equal(reason({ base: 'bucket' }), 'invalid_base');
  assert.equal(reason({ scoops: [{ flavour: 'vanilla-bean', qty: 5 }] }), 'too_many_scoops');
  assert.equal(reason({ scoops: [] }), 'invalid_scoops');
  assert.equal(reason({ scoops: [{ flavour: 'vanilla-bean', qty: 0 }] }), 'invalid_scoops');
  assert.equal(reason({ scoops: [{ flavour: 'triple-scoop', qty: 1 }] }), 'invalid_scoops');
  assert.equal(reason({ scoops: [{ flavour: 'vanilla-bean', qty: 1 }, { flavour: 'vanilla-bean', qty: 1 }] }), 'duplicate_flavour');
  assert.equal(reason({ toppings: ['gold-leaf'] }), 'invalid_toppings');
  assert.equal(reason({ toppings: ['sprinkles', 'sprinkles'] }), 'invalid_toppings');
  assert.equal(reason({ toppings: ['sprinkles', 'chopped-nuts', 'whipped-cream', 'chocolate-chips', 'crushed-biscuits'] }), 'invalid_toppings');
  assert.equal(reason({ sauces: ['chocolate', 'caramel', 'berry'] }), 'invalid_sauces');
  assert.equal(reason({ extras: 'brownie-bites' }), 'invalid_extras');
  await db.mutate('inventory', (l) => { l.find((i) => i.productId === P('pistachio-dream')).onHand = 0; });
  assert.equal(q([build({ scoops: [{ flavour: 'pistachio-dream', qty: 1 }] })]).lines[0].reason, 'flavour_sold_out');
});

test('coupons: percent, minimum, unknown, case-insensitive', () => {
  const lines = [{ productId: P('belgian-chocolate'), qty: 2 }];
  const ok = q(lines, { couponCode: ' welcome10 ' });
  assert.equal(ok.coupon.valid, true); assert.equal(ok.discount, 640); assert.equal(ok.total, 6400 - 640);
  assert.equal(q(lines, { couponCode: 'NOPE' }).coupon.reason, 'invalid');
  assert.equal(q([{ productId: P('vanilla-bean'), qty: 1 }], { couponCode: 'WELCOME10' }).coupon.reason, 'min_order');
  assert.equal(q(lines, { couponCode: { $gt: '' } }).coupon.valid, false);
});

test('coupon expiry and usage limits are enforced', async () => {
  const lines = [{ productId: P('belgian-chocolate'), qty: 2 }];
  await db.update('coupons', 'cpn_welcome10', { expiresAt: '2020-01-01T00:00:00Z' });
  assert.equal(q(lines, { couponCode: 'WELCOME10' }).coupon.reason, 'expired');
  await db.update('coupons', 'cpn_welcome10', { expiresAt: null, used: 500 });
  assert.equal(q(lines, { couponCode: 'WELCOME10' }).coupon.reason, 'used_up');
  await db.update('coupons', 'cpn_welcome10', { used: 0 });
});

test('delivery fee comes from the zone; disabled delivery and unknown zones are unavailable', async () => {
  const lines = [{ productId: P('belgian-chocolate'), qty: 1 }];
  assert.equal(q(lines, { zoneId: 'zone_b' }).total, 3200 + 2500);
  assert.equal(q(lines, { zoneId: 'zone_zz' }).delivery.available, false);
  assert.equal(q(lines).delivery, null);
  await db.mutate('settings', (s) => { s.deliveryEnabled = false; });
  assert.equal(q(lines, { zoneId: 'zone_a' }).delivery.available, false);
  await db.mutate('settings', (s) => { s.deliveryEnabled = true; });
});

test('minimum order is flagged', () => {
  assert.equal(q([{ productId: P('vanilla-bean'), qty: 1 }]).belowMinimum, true, '2800 < 3000 minimum');
  assert.equal(q([{ productId: P('belgian-chocolate'), qty: 1 }]).belowMinimum, false);
  assert.equal(q([]).belowMinimum, false, 'empty cart is not flagged');
});

test('API: valid quote, validation errors, content-type, size and origin checks', async () => {
  const ok = await post('/api/v1/cart/quote', { lines: [{ productId: P('vanilla-bean'), qty: 1 }] });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).subtotal, 2800);
  assert.equal((await post('/api/v1/cart/quote', { lines: 'x' })).status, 400);
  assert.equal((await post('/api/v1/cart/quote', '{bad json')).status, 400);
  assert.equal((await post('/api/v1/cart/quote', '[1,2]')).status, 400);
  assert.equal((await post('/api/v1/cart/quote', { lines: [] }, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await post('/api/v1/cart/quote', { lines: Array(31).fill({ productId: P('vanilla-bean'), qty: 1 }) })).status, 400);
  assert.equal((await post('/api/v1/cart/quote', { lines: [], pad: 'x'.repeat(40000) })).status, 413);
  assert.equal((await post('/api/v1/cart/quote', { lines: [] }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('/api/v1/cart/quote', { lines: [] }, { origin: base })).status, 200);
  assert.equal((await fetch(base + '/api/v1/cart/quote')).status, 405);
});

test('API: builder config and delivery zones are public and hide nothing sensitive', async () => {
  const cfg = await (await fetch(base + '/api/v1/builder-config')).json();
  assert.equal(cfg.maxScoops, 4); assert.equal(cfg.flavours.length, 6); assert.ok(cfg.bases.length === 3);
  const z = await (await fetch(base + '/api/v1/delivery-zones')).json();
  assert.deepEqual(z.items.map((x) => x.fee), [1500, 2500, 3500]);
});

test('static: HTTP Range requests work for video (206, 416) and are advertised', async () => {
  const url = base + '/assets/videos/flavour-wheel-360.mp4';
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(head.headers.get('accept-ranges'), 'bytes');
  const size = Number(head.headers.get('content-length'));
  const part = await fetch(url, { headers: { range: 'bytes=0-1023' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 0-1023/${size}`);
  assert.equal((await part.arrayBuffer()).byteLength, 1024);
  const tail = await fetch(url, { headers: { range: 'bytes=-100' } });
  assert.equal(tail.status, 206); assert.equal((await tail.arrayBuffer()).byteLength, 100);
  assert.equal((await fetch(url, { headers: { range: `bytes=${size + 10}-` } })).status, 416);
  assert.equal((await fetch(url, { headers: { range: 'bytes=abc' } })).status, 416);
});

test('manifest: every verified asset exists on disk', async () => {
  const m = JSON.parse(await fsp.readFile(path.join(__dirname, '../public/assets/manifest/assets.json'), 'utf8'));
  for (const a of [...m.images, ...m.videos].filter((x) => x.verified)) {
    for (const u of [a.url, a.mobileUrl, a.poster].filter(Boolean)) await fsp.access(path.join(__dirname, '../public', u));
  }
});
