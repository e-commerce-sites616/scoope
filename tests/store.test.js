'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/server/services/store');
const { buildSeeds } = require('../src/server/models/seed');

const tmp = () => fsp.mkdtemp(path.join(os.tmpdir(), 'scoope-'));
const fresh = async () => { const dir = await tmp(); const s = new Store(dir); await s.init(buildSeeds()); return { s, dir }; };

test('init seeds every collection and writes files', async () => {
  const { s, dir } = await fresh();
  assert.equal(s.read('products').length, 20);
  assert.equal(s.read('categories').length, 5);
  assert.equal(s.read('delivery-zones').map((z) => z.fee).join(), '1500,2500,3500');
  assert.ok((await fsp.readdir(dir)).includes('products.json'));
});

test('reads are copies: mutating a result does not change the store', async () => {
  const { s } = await fresh();
  s.read('products')[0].price = 1;
  assert.notEqual(s.read('products')[0].price, 1);
});

test('insert, update, remove round-trip and persist across restart', async () => {
  const { s, dir } = await fresh();
  const row = await s.insert('subscribers', 'sub', { email: 'a@b.co' });
  assert.match(row.id, /^sub_[0-9a-f]{18}$/);
  await s.update('subscribers', row.id, { email: 'c@d.co', id: 'hack' });
  assert.equal(s.get('subscribers', row.id).email, 'c@d.co');
  const s2 = new Store(dir); await s2.init(buildSeeds());
  assert.equal(s2.get('subscribers', row.id).email, 'c@d.co');
  assert.equal(await s2.remove('subscribers', row.id), true);
  assert.equal(s2.get('subscribers', row.id), null);
});

test('schema validation rejects bad data and leaves the store untouched', async () => {
  const { s } = await fresh();
  const before = s.read('products').length;
  await assert.rejects(s.insert('products', 'prod', { slug: 'Bad Slug', name: 'x', price: -5 }), { code: 'VALIDATION' });
  await assert.rejects(s.mutate('products', (l) => { l[0].price = 12.5; }), { code: 'VALIDATION' });
  assert.equal(s.read('products').length, before);
  assert.notEqual(s.read('products')[0].price, 12.5);
});

test('duplicate ids are rejected', async () => {
  const { s } = await fresh();
  await assert.rejects(s.mutate('subscribers', (l) => { l.push({ id: 'dup_1' }, { id: 'dup_1' }); }), { code: 'VALIDATION' });
});

test('100 concurrent writes are all kept and the file stays valid JSON', async () => {
  const { s, dir } = await fresh();
  await Promise.all(Array.from({ length: 100 }, (_, i) => s.insert('subscribers', 'sub', { email: `u${i}@x.co` })));
  assert.equal(s.read('subscribers').length, 100);
  assert.equal(JSON.parse(await fsp.readFile(path.join(dir, 'subscribers.json'), 'utf8')).length, 100);
  assert.ok(!(await fsp.readdir(dir)).some((f) => f.endsWith('.tmp')), 'no temp files left behind');
});

test('a failed write does not poison the queue', async () => {
  const { s } = await fresh();
  await assert.rejects(s.mutate('subscribers', () => { throw new Error('boom'); }));
  await s.insert('subscribers', 'sub', { email: 'ok@x.co' });
  assert.equal(s.read('subscribers').length, 1);
});

test('corrupted file is quarantined and recovered from backup', async () => {
  const { s, dir } = await fresh();
  await s.insert('subscribers', 'sub', { email: 'keep@x.co' });
  await s.insert('subscribers', 'sub', { email: 'second@x.co' }); // second write snapshots a backup
  await fsp.writeFile(path.join(dir, 'subscribers.json'), '{ not json');
  const s2 = new Store(dir); await s2.init(buildSeeds());
  assert.ok(s2.recovered.some((r) => r.name === 'subscribers'));
  assert.ok((await fsp.readdir(dir)).some((f) => f.startsWith('subscribers.corrupt-')), 'bad file kept for inspection');
  assert.ok(Array.isArray(s2.read('subscribers')));
});

test('corrupted file with no backup falls back to seed', async () => {
  const dir = await tmp();
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'products.json'), 'garbage');
  const s = new Store(dir); await s.init(buildSeeds());
  assert.equal(s.read('products').length, 20);
  assert.deepEqual(s.recovered[0], { name: 'products', from: 'seed' });
});

test('unknown collection names are refused (no path injection)', async () => {
  const { s } = await fresh();
  assert.throws(() => s.read('../../etc/passwd'));
});

test('seed data is internally consistent', () => {
  const seed = buildSeeds();
  const slugs = new Set(seed.categories.map((c) => c.slug));
  assert.ok(seed.products.every((p) => slugs.has(p.category)));
  const ids = new Set(seed.products.map((p) => p.id));
  assert.ok(seed.inventory.every((i) => ids.has(i.productId)));
  assert.equal(new Set(seed.products.map((p) => p.slug)).size, 20);
});
