'use strict';
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = require('node:path').join(require('node:os').tmpdir(), `scoope-srv-${process.pid}`);
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/server/app');
const db = require('../src/server/services/db');

let server, base;
before(async () => {
  await db.start();
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); await require('node:fs/promises').rm(process.env.DATA_DIR, { recursive: true, force: true }); });

test('health endpoint reports ok without leaking paths or secrets', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.ok(['temporary-demo', 'configured-data-dir'].includes(body.storage.mode));
  const text = JSON.stringify(body);
  assert.ok(!text.includes('/home') && !/password|secret/i.test(text));
});

test('homepage renders with partials resolved and security headers set', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /A little moment of indulgence/);
  assert.ok(!html.includes('{{'), 'unresolved template tags');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('static files are served with correct types', async () => {
  const css = await fetch(`${base}/styles/main.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
  const js = await fetch(`${base}/modules/main.js`);
  assert.match(js.headers.get('content-type'), /javascript/);
});

test('HTML partials and server files are never served statically', async () => {
  for (const p of ['/components/header.html', '/styles/../../server/index.js', '/styles/%2e%2e/%2e%2e/server/index.js', '/assets/%00.json']) {
    const res = await fetch(`${base}${p}`);
    assert.equal(res.status, 404, p);
  }
});

test('unknown routes return the custom 404 page', async () => {
  const res = await fetch(`${base}/nope`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /couldn't find that page/);
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
});

test('trailing slashes are tolerated', async () => {
  assert.equal((await fetch(`${base}/shop/`)).status, 200);
});

test('non-GET methods are rejected', async () => {
  assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/api/health`, { method: 'DELETE' })).status, 405);
});
