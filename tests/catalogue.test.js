'use strict';
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = path.join(os.tmpdir(), `scoope-api-${process.pid}`);
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/server/services/db');
const { createServer } = require('../src/server/app');

let server, base;
const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };
before(async () => {
  await db.start();
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); await fsp.rm(process.env.DATA_DIR, { recursive: true, force: true }); });

test('lists all 20 products with 5 categories', async () => {
  const { body } = await get('/api/v1/products?limit=60');
  assert.equal(body.total, 20);
  assert.equal((await get('/api/v1/categories')).body.items.length, 5);
});

test('search by name and by flavour note', async () => {
  assert.deepEqual((await get('/api/v1/products?q=pistachio')).body.items.map((p) => p.slug).sort(), ['pistachio-dream', 'pistachio-indulgence']);
  assert.ok((await get('/api/v1/products?q=crunchy')).body.items.length >= 1);
  assert.equal((await get('/api/v1/products?q=zzzz')).body.total, 0);
});

test('category, price and featured filters', async () => {
  assert.equal((await get('/api/v1/products?category=classic-scoops')).body.total, 6);
  const { body } = await get('/api/v1/products?minPrice=3000&maxPrice=3300');
  assert.ok(body.items.every((p) => p.price >= 3000 && p.price <= 3300) && body.total > 0);
  assert.ok((await get('/api/v1/products?featured=true')).body.items.every((p) => p.featured));
});

test('availability filter excludes out-of-stock; stock counts are never exposed', async () => {
  const all = (await get('/api/v1/products?limit=60')).body.items;
  const avail = (await get('/api/v1/products?available=true&limit=60')).body.items;
  assert.ok(!avail.some((p) => p.slug === 'celebration-collection'));
  assert.equal(avail.length, all.length - 1);
  assert.equal(all.find((p) => p.slug === 'pistachio-indulgence').lowStock, true);
  assert.ok(all.every((p) => !('onHand' in p) && !('archived' in p)));
});

test('sorting by price and popularity', async () => {
  const asc = (await get('/api/v1/products?sort=price-asc&limit=60')).body.items.map((p) => p.price);
  assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
  const pop = (await get('/api/v1/products?sort=popular&limit=60')).body.items.map((p) => p.popularity);
  assert.deepEqual(pop, [...pop].sort((a, b) => b - a));
  assert.equal((await get('/api/v1/products?sort=hax')).status, 400);
  assert.equal((await get('/api/v1/products?minPrice=abc')).status, 400);
});

test('product detail includes related items; unknown slug is 404; archived is hidden', async () => {
  const { status, body } = await get('/api/v1/products/vanilla-bean');
  assert.equal(status, 200);
  assert.equal(body.related.length, 3);
  assert.equal((await get('/api/v1/products/nope')).status, 404);
  await db.update('products', 'prod_triple-scoop', { archived: true });
  assert.equal((await get('/api/v1/products/triple-scoop')).status, 404);
  assert.equal((await get('/api/v1/products?limit=60')).body.total, 19);
});

test('health reports the store without exposing paths', async () => {
  const { body } = await get('/api/health');
  assert.equal(body.store.ready, true);
  assert.equal(body.storage.mode, 'configured-data-dir');
  assert.ok(!JSON.stringify(body).includes(os.tmpdir()));
});
