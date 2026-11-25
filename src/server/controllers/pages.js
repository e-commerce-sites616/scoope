'use strict';
const { send } = require('../utils/http');
const { renderPage, esc } = require('../services/pages');
const { origin, head } = require('../services/seo');
const catalogue = require('../services/catalogue');
const db = require('../services/db');
const { reviewsFor } = require('./engage');
const content = require('../services/content');

const HTML = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' };
const money = (n) => '₦' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const out = async (ctx, status, tpl, vars) => send(ctx.res, status, await renderPage(tpl, { siteUrl: origin(ctx.req), ...vars }), ctx.noStore ? { ...HTML, 'Cache-Control': 'no-store' } : HTML, ctx.req.method === 'HEAD');

const artBox = (p, view = 'light', cls = '') =>
  `<div class="art ${cls}" data-art data-slug="${esc(p.slug)}" data-cat="${esc(p.category)}" data-view="${view}" role="img" aria-label="${esc(p.images[0]?.alt || p.name)}">` +
  `<img data-asset="${esc(p.images[0]?.assetId || '')}" alt="" width="800" height="1000" loading="lazy" decoding="async"></div>`;

function badge(p) {
  if (!p.available) return '<span class="tag tag--out">Sold out</span>';
  if (p.lowStock) return '<span class="tag tag--low">Few left</span>';
  if (p.bestseller) return '<span class="tag">Bestseller</span>';
  return '';
}

function cardHtml(p, cls = '') {
  return `<a class="card ${cls}" href="/product/${esc(p.slug)}">${artBox(p)}` +
    `<div class="card__body"><h3>${esc(p.name)}</h3><p class="card__notes">${esc(p.flavourNotes.slice(0, 3).join(', '))}</p>` +
    `<p class="card__price">${p.variants.length || p.sizes.length > 1 ? 'From ' : ''}${money(p.price)} ${badge(p)}</p></div></a>`;
}

async function shopShell(ctx, heading, mode) {
  const base = origin(ctx.req);
  const title = mode === 'search' ? 'Search | SCOOPÉ' : 'Shop all flavours | SCOOPÉ';
  const description = mode === 'search' ? 'Search the SCOOPÉ menu by flavour or product.' : 'Browse SCOOPÉ scoops, take-home tubs, signature sundaes, cones and gift collections.';
  await out(ctx, 200, 'shop', {
    seo: head({ title, description, path: mode === 'search' ? '/search' : '/shop', base }),
    heading, mode,
  });
}
const shop = (ctx) => shopShell(ctx, 'Shop', 'shop');
const search = (ctx) => shopShell(ctx, 'Search', 'search');

async function collections(ctx) {
  const base = origin(ctx.req);
  const cats = catalogue.categories();
  const all = catalogue.list({ limit: 60, sort: 'popular' }).items;
  const tones = ['light', 'wine', 'biscuit', 'dark', 'light'];
  const views = ['light', 'detail', 'light', 'dark', 'light'];
  const panels = cats.map((c, i) => {
    const items = all.filter((p) => p.category === c.slug);
    const lead = items[0];
    if (!lead) return '';
    return `<section class="coll coll--${tones[i % 5]}${i % 2 ? ' coll--flip' : ''}" aria-labelledby="c-${esc(c.slug)}">` +
      `<div class="wrap coll__grid"><div class="coll__text"><h2 id="c-${esc(c.slug)}" class="coll__title">${esc(c.name)}</h2>` +
      `<p>${esc(c.description)}</p><p class="coll__count">${items.length} ${items.length === 1 ? 'item' : 'items'}, from ${money(Math.min(...items.map((p) => p.price)))}</p>` +
      `<a class="btn ${tones[i % 5] === 'light' || tones[i % 5] === 'biscuit' ? '' : 'btn--light'}" href="/shop?category=${esc(c.slug)}">Shop ${esc(c.name.toLowerCase())}</a></div>` +
      `${artBox(lead, views[i % 5], 'art--feature')}</div></section>`;
  }).join('\n');
  await out(ctx, 200, 'collections', {
    seo: head({ title: 'Collections | SCOOPÉ', description: 'Explore SCOOPÉ collections: classic scoops, take-home tubs, signature sundaes, cones and gift boxes.', path: '/collections', base }),
    panels,
  });
}

async function product(ctx) {
  const p = catalogue.bySlug(ctx.params.slug);
  if (!p) return out(ctx, 404, '404', {});
  const base = origin(ctx.req);
  const rv = reviewsFor(p.slug);
  const cat = db.read('categories').find((c) => c.slug === p.category);
  const radios = (name, list, label) => list.length === 0 ? '' :
    `<fieldset class="opt"><legend>${label}</legend>${list.map((o, i) =>
      `<label class="opt__item"><input type="radio" name="${name}" value="${esc(o.id)}" data-delta="${o.priceDelta}"${i === 0 ? ' checked' : ''}><span>${esc(o.label)}${o.priceDelta ? ` <small>+${money(o.priceDelta)}</small>` : ''}</span></label>`).join('')}</fieldset>`;
  const sizeList = p.sizes.length > 1 ? p.sizes : [];
  const desc = p.description.length > 155 ? p.description.slice(0, 152) + '...' : p.description;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.description, sku: p.slug,
    category: cat ? cat.name : p.category, brand: { '@type': 'Brand', name: 'SCOOPÉ' },
    offers: { '@type': 'Offer', url: `${base}/product/${p.slug}`, priceCurrency: 'NGN', price: String(p.price), availability: p.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' },
  };
  if (rv && rv.count) jsonld.aggregateRating = { '@type': 'AggregateRating', ratingValue: String(rv.average), reviewCount: String(rv.count) };
  const buy = `<form class="buy" data-buy data-id="${esc(p.id)}" data-slug="${esc(p.slug)}" data-base="${p.price}" novalidate>` +
    radios('size', sizeList, 'Size') + radios('variant', p.variants, 'Choose how you have it') +
    `<div class="buy__row"><div class="qty" role="group" aria-label="Quantity"><button type="button" data-qty="-1" aria-label="Decrease quantity">&minus;</button><output data-qty-out aria-live="polite">1</output><button type="button" data-qty="1" aria-label="Increase quantity">+</button></div>` +
    `<button class="btn buy__add" type="submit"${p.available ? '' : ' disabled'}>${p.available ? 'Add to bag' : 'Currently unavailable'}</button></div>` +
    `<p class="buy__msg" data-buy-msg role="status"></p></form>`;
  const related = p.related.length ? `<section class="related wrap" aria-labelledby="rel"><h2 id="rel" class="related__title">You may also like</h2><div class="grid grid--related">${p.related.map((r) => cardHtml(r)).join('')}</div></section>` : '';
  await out(ctx, 200, 'product', {
    seo: head({ title: `${p.name} | SCOOPÉ`, description: desc, path: `/product/${p.slug}`, base, type: 'product', jsonld }),
    name: p.name,
    body: `<nav class="crumbs" aria-label="Breadcrumb"><a href="/shop">Shop</a><span aria-hidden="true">/</span><a href="/shop?category=${esc(p.category)}">${esc(cat ? cat.name : p.category)}</a></nav>` +
      `<div class="pdp__grid"><div class="gallery" data-gallery>${artBox(p, 'light', 'gallery__main')}` +
      `<div class="gallery__thumbs" role="group" aria-label="Product views">` +
      [['light', 'Light'], ['dark', 'Dark'], ['detail', 'Close-up']].map(([v, l], i) => `<button type="button" class="thumb" data-view="${v}" aria-pressed="${i === 0}" aria-label="${l} view"><span class="thumb__dot thumb__dot--${v}"></span></button>`).join('') +
      `</div></div><div class="pdp__info"><h1 class="pdp__title">${esc(p.name)}</h1>` +
      `<p class="pdp__price" data-price>${money(p.price)}</p>${p.lowStock && p.available ? '<p class="tag tag--low">Only a few left</p>' : ''}` +
      `<p class="pdp__desc">${esc(p.description)}</p>${buy}` +
      `<dl class="facts">${p.flavourNotes.length ? `<div><dt>Flavour notes</dt><dd>${esc(p.flavourNotes.join(', '))}</dd></div>` : ''}` +
      `<div><dt>Ingredients</dt><dd>${esc(p.ingredients.join(', '))}</dd></div><div><dt>Contains</dt><dd>${esc(p.allergens.join(', '))}</dd></div></dl>` +
      `<p class="pdp__demo">Demonstration product information for a fictional brand. Not verified or certified.</p></div></div>` +
      `<section class="reviews" data-reviews data-slug="${esc(p.slug)}" aria-labelledby="rv-title"><h2 id="rv-title" class="related__title">Reviews</h2><div data-reviews-body><p class="bagpage__loading">Loading reviews...</p></div></section>`,
    related,
  });
}

function sitemap(ctx) {
  const { req, res } = ctx;
  const base = origin(req);
  const urls = ['/', '/shop', '/collections', '/build', '/gift', '/our-story', '/contact', '/privacy', '/terms', '/delivery-and-refunds', ...catalogue.list({ limit: 60 }).items.map((p) => `/product/${p.slug}`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(base + u)}</loc></url>`).join('\n')}\n</urlset>\n`;
  send(res, 200, xml, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache' }, req.method === 'HEAD');
}

function robots(ctx) {
  const { req, res } = ctx;
  const txt = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /cart\nDisallow: /checkout\nDisallow: /account\nDisallow: /pay/\nDisallow: /track/\n\nSitemap: ${origin(req)}/sitemap.xml\n`;
  send(res, 200, txt, { 'Content-Type': 'text/plain; charset=utf-8' }, req.method === 'HEAD');
}


// ---------- generic shells for client-rendered app pages ----------
const NOINDEX = '<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer">';
async function shell(ctx, { title, description, page, path, main, noindex = false, status = 200 }) {
  const base = origin(ctx.req);
  await out(ctx, status, 'shell', { seo: head({ title, description: description || title, path, base }), robots: noindex ? NOINDEX : '', page, main });
}
const app = (extra = '') => `<div data-app>${'<p class="bagpage__loading">Loading...</p>'}</div><noscript><p>This page needs JavaScript to work.</p></noscript>${extra}`;
const checkout = (ctx) => shell(ctx, { title: 'Checkout | SCOOPÉ', page: 'checkout', path: '/checkout', noindex: true, main: `<h1 class="shop__title bagpage__title">Checkout</h1>${app()}` });
const pay = (ctx) => { ctx.noStore = true; return shell(ctx, { title: 'Pay | SCOOPÉ', page: 'pay', path: '/pay', noindex: true, main: `<h1 class="shop__title bagpage__title">Payment</h1>${app()}` }); };
const track = (ctx) => { ctx.noStore = true; return shell(ctx, { title: 'Your order | SCOOPÉ', page: 'track', path: '/track', noindex: true, main: app() }); };
const account = (ctx) => shell(ctx, { title: 'Account | SCOOPÉ', page: 'account', path: '/account', noindex: true, main: `<h1 class="shop__title bagpage__title">Account</h1>${app()}` });
const unsubscribe = (ctx) => shell(ctx, { title: 'Unsubscribe | SCOOPÉ', page: 'unsubscribe', path: '/unsubscribe', noindex: true, main: `<h1 class="shop__title bagpage__title">Unsubscribe</h1>${app()}` });

async function gift(ctx) {
  const items = catalogue.list({ category: 'gift-collections', limit: 20, sort: 'price-asc' }).items;
  const opts = items.map((p, i) => `<label class="giftopt"><input type="radio" name="gift" value="${esc(p.id)}" data-slug="${esc(p.slug)}"${i === 0 && p.available ? ' checked' : ''}${p.available ? '' : ' disabled'}>` +
    `<span class="giftopt__card">${artBox(p, i % 2 ? 'detail' : 'light')}<span class="giftopt__t"><b>${esc(p.name)}</b><small>${esc(p.description)}</small><em>${money(p.price)}${p.available ? '' : ' (sold out)'}</em></span></span></label>`).join('');
  await shell(ctx, { title: 'Gift a Scoop | SCOOPÉ', description: 'Send someone a SCOOPÉ gift collection with a personal message.', page: 'gift', path: '/gift',
    main: `<h1 class="shop__title bagpage__title">Gift a Scoop</h1><form class="giftform" data-gift novalidate><fieldset class="giftform__opts"><legend>1. Choose a gift</legend><div class="giftopts">${opts}</div></fieldset>` +
      `<fieldset class="giftform__who"><legend>2. Who is it for?</legend><label class="field"><span class="field__label">Recipient's name</span><input name="recipient" maxlength="80" autocomplete="off" required></label>` +
      `<label class="field"><span class="field__label">Your message (optional)</span><textarea name="message" maxlength="300" rows="4"></textarea></label>` +
      `<p class="buy__msg" data-gift-msg role="status"></p><button class="btn" type="submit">Add gift to bag</button><p class="pdp__demo">You will add the delivery address at checkout. Demonstration store: nothing is really delivered.</p></fieldset></form>` });
}

const doc = (key) => (ctx) => {
  const d = content[key];
  return shell(ctx, { title: `${d.title} | SCOOPÉ`, description: d.description, page: 'doc', path: `/${key}`, main: d.render({ settings: db.ready ? db.read('settings') : {} }) });
};

// ---------- homepage ----------
async function home(ctx) {
  const base = origin(ctx.req);
  const cats = catalogue.categories(), all = catalogue.list({ limit: 60, sort: 'popular' }).items;
  const strip = cats.map((c, i) => { const lead = all.find((p) => p.category === c.slug); return lead ? `<a class="strip__item" href="/shop?category=${esc(c.slug)}">${artBox(lead, i % 2 ? 'detail' : 'light')}<span class="strip__name">${esc(c.name)}</span></a>` : ''; }).join('');
  const st = db.read('settings').seasonal;
  const live = st && st.visible && (!st.expiresAt || new Date(st.expiresAt) > new Date());
  const items = live ? st.productSlugs.map((s) => all.find((p) => p.slug === s)).filter(Boolean) : [];
  const seasonal = items.length ? `<section class="season on-dark" data-reveal aria-labelledby="season-title"><div class="wrap"><p class="eyebrow">${esc(st.label)}</p><h2 id="season-title" class="season__title">${esc(st.headline)}</h2><p class="season__blurb">${esc(st.blurb)}</p><div class="grid grid--season">${items.map((p) => cardHtml(p)).join('')}</div></div></section>` : '';
  const best = all.filter((p) => p.bestseller).slice(0, 4);
  await out(ctx, 200, 'index', {
    seo: head({ title: 'SCOOPÉ | A little moment of indulgence', description: 'Discover flavours worth slowing down for. SCOOPÉ is a fictional premium ice cream brand: classic scoops, take-home tubs, sundaes and gifts.', path: '/', base, jsonld: { '@context': 'https://schema.org', '@type': 'Organization', name: 'SCOOPÉ', url: base, slogan: 'A little moment of indulgence.', description: 'Fictional demonstration brand.' } }),
    collections: strip, seasonal, bestsellers: best.map((p) => cardHtml(p)).join(''),
  });
}

const simple = (name) => (ctx) => out(ctx, 200, name, {});

module.exports = { home, shop, search, collections, product, sitemap, robots, checkout, pay, track, account, gift, doc, unsubscribe, simple };
