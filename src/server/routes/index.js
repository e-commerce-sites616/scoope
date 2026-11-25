'use strict';
const crypto = require('node:crypto');
const { send, sendJson } = require('../utils/http');
const { renderPage } = require('../services/pages');
const { serveStatic } = require('../middleware/static');
const { checkOrigin } = require('../middleware/body');
const { httpError } = require('../utils/errors');
const auth = require('../services/auth');
const db = require('../services/db');
const { health } = require('../controllers/health');
const cat = require('../controllers/catalogue');
const cart = require('../controllers/cart');
const acct = require('../controllers/account');
const ord = require('../controllers/orders');
const eng = require('../controllers/engage');
const pg = require('../controllers/pages');

const routes = [];
// opts: auth (401 if signed out), db:false (no store needed), html:true (page, not API)
function on(method, path, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, opts });
}
const A = (fn) => (c) => fn(c.req, c.res);

// ---- pages
on('GET', '/', pg.home);
on('GET', '/shop', pg.shop, { db: false });
on('GET', '/search', pg.search, { db: false });
on('GET', '/collections', pg.collections);
on('GET', '/product/:slug', pg.product);
on('GET', '/build', pg.simple('build'), { db: false });
on('GET', '/cart', pg.simple('cart'), { db: false });
on('GET', '/checkout', pg.checkout, { db: false });
on('GET', '/pay/:key', pg.pay, { db: false });
on('GET', '/track/:key', pg.track, { db: false });
on('GET', '/account', pg.account, { db: false });
on('GET', '/gift', pg.gift);
on('GET', '/unsubscribe/:token', pg.unsubscribe, { db: false });
for (const k of ['our-story', 'contact', 'privacy', 'terms', 'delivery-and-refunds']) on('GET', `/${k}`, pg.doc(k), { db: false });
on('GET', '/sitemap.xml', pg.sitemap);
on('GET', '/robots.txt', pg.robots, { db: false });

// ---- API
on('GET', '/api/health', A(health), { db: false });
on('GET', '/api/v1/products', A(cat.listProducts));
on('GET', '/api/v1/products/:slug', (c) => cat.getProduct(c.req, c.res, c.params.slug));
on('GET', '/api/v1/products/:slug/reviews', eng.listReviews);
on('POST', '/api/v1/products/:slug/reviews', eng.addReview, { auth: true });
on('GET', '/api/v1/categories', A(cat.listCategories));
on('GET', '/api/v1/builder-config', A(cart.builderConfig));
on('GET', '/api/v1/delivery-zones', A(cart.zones));
on('POST', '/api/v1/cart/quote', (c) => cart.quote(c.req, c.res, c.user));
// Login/register only create a session (origin-checked); exempting them means a stale cookie can never lock someone out.
on('POST', '/api/v1/auth/register', acct.register, { noCsrf: true });
on('POST', '/api/v1/auth/login', acct.login, { noCsrf: true });
on('POST', '/api/v1/auth/logout', acct.logout);
on('GET', '/api/v1/auth/me', acct.whoami);
on('GET', '/api/v1/account', acct.dashboard, { auth: true });
on('PATCH', '/api/v1/account/profile', acct.profile, { auth: true });
on('POST', '/api/v1/account/password', acct.password, { auth: true });
on('GET', '/api/v1/account/orders', acct.myOrders, { auth: true });
on('POST', '/api/v1/account/addresses', acct.addAddress, { auth: true });
on('DELETE', '/api/v1/account/addresses/:id', acct.delAddress, { auth: true });
on('POST', '/api/v1/orders', ord.place);
on('GET', '/api/v1/orders/:key', ord.lookup);
on('POST', '/api/v1/orders/:key/pay', ord.pay);
on('POST', '/api/v1/orders/:key/cancel', ord.cancel);
on('POST', '/api/v1/newsletter', eng.subscribe);
on('POST', '/api/v1/newsletter/unsubscribe', eng.unsubscribe);
on('POST', '/api/v1/contact', eng.contact);

const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

async function guard(r, ctx) {
  const { req } = ctx;
  if (r.opts.db !== false && !db.ready) throw httpError(503, 'store_not_ready');
  Object.assign(ctx, auth.fromRequest(req));
  if (r.opts.auth && !ctx.user) throw httpError(401, 'login_required');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    checkOrigin(req);
    // Any state change made with a session cookie must carry that session's CSRF token.
    if (ctx.session && !r.opts.noCsrf && !safeEq(req.headers['x-csrf-token'] || '', ctx.session.csrf)) throw httpError(403, 'csrf');
  }
}

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const clean = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  const matched = routes.filter((r) => r.re.test(clean));
  if (matched.length) {
    const hit = matched.find((r) => r.method === req.method || (req.method === 'HEAD' && r.method === 'GET'));
    if (!hit) return sendJson(res, 405, { error: 'method_not_allowed' });
    const m = clean.match(hit.re);
    const params = {};
    try { hit.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); } catch { return sendJson(res, 400, { error: 'bad_path' }); }
    const ctx = { req, res, url, params, user: null, session: null };
    try {
      await guard(hit, ctx);
      return await hit.handler(ctx);
    } catch (err) {
      if (err && err.retryAfter) res.setHeader('Retry-After', String(err.retryAfter));
      throw err;
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (clean.startsWith('/api/')) return sendJson(res, 404, { error: 'not_found' });
  if (await serveStatic(req, res, url.pathname)) return;
  send(res, 404, await renderPage('404', {}), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }, req.method === 'HEAD');
}

module.exports = { route };
