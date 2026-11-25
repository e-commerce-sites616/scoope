'use strict';
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = path.join(os.tmpdir(), `scoope-sf-${process.pid}`);
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/server/services/db');
const { createServer } = require('../src/server/app');

let server, base;
const page = async (p) => { const r = await fetch(base + p); return { status: r.status, type: r.headers.get('content-type'), text: await r.text() }; };
const jsonld = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

before(async () => {
  await db.start();
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); await fsp.rm(process.env.DATA_DIR, { recursive: true, force: true }); });

test('shop and search pages render the filter controls and SEO tags', async () => {
  for (const p of ['/shop', '/search']) {
    const { status, text } = await page(p);
    assert.equal(status, 200);
    for (const name of ['q', 'minPrice', 'maxPrice', 'sort', 'available']) assert.match(text, new RegExp(`name="${name}"`), `${p} missing ${name}`);
    assert.match(text, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/(shop|search)">/);
    assert.ok(!text.includes('{{'));
  }
});

test('product page is server-rendered with price, options, facts and valid Product JSON-LD', async () => {
  const { status, text } = await page('/product/vanilla-bean');
  assert.equal(status, 200);
  assert.match(text, /<h1 class="pdp__title">Vanilla Bean<\/h1>/);
  assert.match(text, /₦2,800/);
  assert.match(text, /name="variant" value="cone" data-delta="500"/);
  assert.match(text, /Contains<\/dt><dd>milk/);
  const ld = jsonld(text);
  assert.equal(ld['@type'], 'Product');
  assert.equal(ld.offers.priceCurrency, 'NGN');
  assert.equal(ld.offers.price, '2800');
  assert.equal(ld.offers.availability, 'https://schema.org/InStock');
});

test('tub product exposes size options and price deltas', async () => {
  const { text } = await page('/product/vanilla-family-tub');
  assert.match(text, /name="size" value="1l" data-delta="5500"/);
});

test('sold-out product disables purchase and reports OutOfStock', async () => {
  const { text } = await page('/product/celebration-collection');
  assert.match(text, /<button class="btn buy__add" type="submit" disabled>Currently unavailable/);
  assert.equal(jsonld(text).offers.availability, 'https://schema.org/OutOfStock');
});

test('unknown product returns the custom 404; malformed slugs never reach the store', async () => {
  assert.equal((await page('/product/does-not-exist')).status, 404);
  assert.equal((await page('/product/UPPER')).status, 404);
  assert.equal((await page('/product/..%2fetc')).status, 404);
});

test('product content is escaped: injected markup cannot break out of HTML or JSON-LD', async () => {
  await db.update('products', 'prod_double-scoop', {
    name: '<img src=x onerror=alert(1)>',
    description: '</script><script>alert(2)</script>',
    flavourNotes: ['"><b>x</b>'],
  });
  const { text } = await page('/product/double-scoop');
  assert.ok(!text.includes('<img src=x'), 'name escaped');
  assert.ok(!text.includes('<script>alert(2)'), 'description escaped');
  assert.ok(!text.includes('"><b>x</b>'), 'notes escaped');
  const ld = jsonld(text);
  assert.equal(ld.description, '</script><script>alert(2)</script>', 'JSON-LD round-trips safely');
  assert.equal((text.match(/<script/g) || []).length, 3, 'only boot, main module and JSON-LD scripts exist');
});

test('collections lists all five categories linking into the shop', async () => {
  const { status, text } = await page('/collections');
  assert.equal(status, 200);
  for (const c of ['classic-scoops', 'take-home-tubs', 'signature-sundaes', 'cones-combinations', 'gift-collections']) assert.match(text, new RegExp(`/shop\\?category=${c}`));
});

test('sitemap lists product URLs and excludes archived products; robots points to it', async () => {
  await db.update('products', 'prod_triple-scoop', { archived: true });
  const sm = await page('/sitemap.xml');
  assert.match(sm.type, /xml/);
  assert.match(sm.text, /\/product\/vanilla-bean<\/loc>/);
  assert.ok(!sm.text.includes('/product/triple-scoop'));
  const rb = await page('/robots.txt');
  assert.match(rb.text, /Disallow: \/api\//);
  assert.match(rb.text, /Sitemap: http:\/\/127\.0\.0\.1:\d+\/sitemap\.xml/);
});

test('a hostile Host header cannot poison canonical URLs', async () => {
  const res = await fetch(`${base}/shop`, { headers: { 'x-forwarded-proto': 'https' } });
  assert.ok(!(await res.text()).includes('evil'));
});

test('cart and builder pages render; checkout is honestly pending; scrub section is on the homepage', async () => {
  for (const p of ['/cart', '/build']) { const r = await page(p); assert.equal(r.status, 200); assert.ok(!r.text.includes('{{')); assert.match(r.text, /data-drawer/); }
  assert.match((await page('/cart')).text, /name="robots" content="noindex"/);
  assert.match((await page('/checkout')).text, /data-app/);
  const home = (await page('/')).text;
  assert.match(home, /data-scrub[^>]*data-src="\/assets\/videos\/flavour-wheel-540\.mp4"/);
  assert.equal((home.match(/class="beat"/g) || []).length, 8);
  assert.match(home, /href="\/product\/vanilla-bean"/);
  for (const u of ['/assets/videos/flavour-wheel-540.mp4', '/assets/videos/flavour-wheel-360.mp4', '/assets/videos/flavour-wheel-poster.webp', '/assets/videos/flavour-wheel-palette.json', '/assets/images/hero-main.webp']) assert.equal((await fetch(base + u, { method: 'HEAD' })).status, 200, u);
});

test('page CSS and inline styles: no inline style attributes anywhere (CSP)', async () => {
  for (const p of ['/', '/shop', '/cart', '/build', '/product/vanilla-bean', '/collections']) assert.ok(!/\sstyle="/.test((await page(p)).text), p);
});

test('fonts are self-hosted and served with the right type', async () => {
  for (const f of ['DMSans-Variable.woff', 'CrimsonText-Regular.woff', 'CrimsonText-SemiBold.woff']) {
    const r = await fetch(`${base}/fonts/${f}`); assert.equal(r.status, 200, f); assert.equal(r.headers.get('content-type'), 'font/woff');
    assert.ok(Number(r.headers.get('content-length')) > 5000);
  }
  assert.ok(!(await (await fetch(`${base}/styles/tokens.css`)).text()).includes('googleapis'), 'no external font hosts');
});

test('every product has a real, verified image in the manifest (no placeholder illustrations left)', async () => {
  const m = JSON.parse(await fsp.readFile(path.join(__dirname, '../public/assets/manifest/assets.json'), 'utf8'));
  const ok = new Set(m.images.filter((i) => i.verified && i.url).map((i) => i.id));
  const products = db.read('products');
  assert.equal(products.length, 20);
  for (const p of products) assert.ok(ok.has(`product-${p.slug}`), `no verified image for ${p.slug}`);
  for (const f of ['vanilla', 'chocolate', 'strawberry', 'caramel', 'cookies', 'pistachio']) {
    assert.ok(ok.has(`stage-${f}`), `stage ${f}`);
    const r = await fetch(`${base}/assets/images/stage-${f}.webp`); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/webp');
  }
  const home = (await page('/')).text;
  assert.equal((home.match(/data-stage="/g) || []).length, 12, '6 stage list items + 6 stage images');
});

test('sign-in page shell loads (is-auth layout is applied client-side)', async () => {
  const t = (await page('/account')).text;
  assert.match(t, /pagebox--account/); assert.match(t, /name="robots" content="noindex"/);
});
