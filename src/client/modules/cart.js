import { readLines, writeLines, MAX_QTY } from './bag.js';
import { api } from './api.js';
import { hydrateArt } from './art.js';
import { initImages } from './images.js';

const money = (n) => '₦' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
const mem = (k) => ({ get: () => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* private mode */ } } });
const couponStore = mem('scoope.coupon.v1'), zoneStore = mem('scoope.zone.v1');
const REASONS = { sold_out: 'Sold out. Remove it to continue.', insufficient_stock: 'Not enough in stock.', not_found: 'No longer available.', flavour_sold_out: 'One of the flavours is sold out.' };
const COUPON_MSG = { invalid: 'That code is not valid.', expired: 'That code has expired.', used_up: 'That code has been fully used.', min_order: 'Your order is below the minimum for that code.' };

const views = new Set();
let zones = null;

async function getQuote(lines) {
  const body = { lines: lines.map(({ id, type, productId, size, variant, qty, config }) => ({ id, type, productId, size, variant, qty, config })), couponCode: couponStore.get() || undefined, zoneId: zoneStore.get() || undefined };
  return api('POST', '/api/v1/cart/quote', body);
}
const patch = (id, fn) => writeLines(readLines().map((l) => (l.id === id ? fn(l) : l)).filter(Boolean));

function lineItem(stored, q) {
  const li = el('li', `cline${q.status !== 'ok' ? ' cline--bad' : ''}`);
  if (q.type === 'product' && q.slug) {
    const a = el('a', 'cline__art'); a.href = `/product/${q.slug}`; a.setAttribute('aria-label', q.name);
    const art = el('div', 'art'); Object.assign(art.dataset, { art: '', slug: q.slug, cat: q.category, view: 'light' });
    const img = el('img'); img.dataset.asset = `product-${q.slug}`; img.alt = ''; img.width = 200; img.height = 250;
    art.append(img); a.append(art); li.append(a);
  } else li.append(el('div', 'cline__art cline__art--build'));
  const body = el('div', 'cline__body');
  const title = el('p', 'cline__name'); 
  if (q.slug) { const a = el('a', '', q.name); a.href = `/product/${q.slug}`; title.append(a); } else title.textContent = q.name || 'Item';
  body.append(title);
  if (q.type === 'build' && q.summary) {
    const s = q.summary;
    body.append(el('p', 'cline__opts', [s.base, s.scoops.map((x) => `${x.qty}× ${x.name}`).join(', '), ...s.toppings, ...s.sauces, ...s.extras].filter(Boolean).join(' · ')));
    const edit = el('a', 'link cline__edit', 'Edit'); edit.href = `/build?edit=${encodeURIComponent(stored.id)}`; body.append(edit);
  } else if (q.sizeLabel || q.variantLabel) body.append(el('p', 'cline__opts', [q.sizeLabel, q.variantLabel].filter(Boolean).join(' · ')));
  if (q.status !== 'ok') {
    const m = el('p', 'cline__msg', REASONS[q.reason] || 'This item cannot be ordered right now.');
    body.append(m);
    if (q.reason === 'insufficient_stock' && q.maxQty) { const b = el('button', 'link', `Set to ${q.maxQty}`); b.type = 'button'; b.onclick = () => patch(stored.id, (l) => ({ ...l, qty: q.maxQty })); body.append(b); }
  } else if (stored.seen != null && stored.seen !== q.unit) {
    const m = el('p', 'cline__msg', `Price updated: was ${money(stored.seen)}, now ${money(q.unit)}. `);
    const b = el('button', 'link', 'OK'); b.type = 'button'; b.onclick = () => patch(stored.id, (l) => ({ ...l, seen: q.unit })); m.append(b); body.append(m);
  }
  const row = el('div', 'cline__row');
  const qty = el('div', 'qty qty--sm'); qty.setAttribute('role', 'group'); qty.setAttribute('aria-label', `Quantity for ${q.name || 'item'}`);
  const minus = el('button', '', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Decrease quantity'); minus.disabled = stored.qty <= 1; minus.onclick = () => patch(stored.id, (l) => ({ ...l, qty: l.qty - 1 }));
  const plus = el('button', '', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'Increase quantity'); plus.disabled = stored.qty >= MAX_QTY; plus.onclick = () => patch(stored.id, (l) => ({ ...l, qty: l.qty + 1 }));
  const out = el('output', '', String(stored.qty)); qty.append(minus, out, plus);
  const rm = el('button', 'link cline__rm', 'Remove'); rm.type = 'button'; rm.onclick = () => patch(stored.id, () => null);
  row.append(qty, rm, el('p', 'cline__price', q.status === 'ok' ? money(q.lineTotal) : ''));
  body.append(row); li.append(body);
  return li;
}

function summary(root, quote, compact) {
  const box = el('div', 'csum');
  const add = (label, value, cls = '') => { const r = el('div', `csum__row ${cls}`); r.append(el('span', '', label), el('span', '', value)); box.append(r); };
  add('Subtotal', money(quote.subtotal));
  if (quote.discount > 0) add(`Discount (${quote.coupon.code})`, `−${money(quote.discount)}`);
  if (quote.delivery?.available) add(`Delivery (${quote.delivery.zoneName})`, money(quote.delivery.fee));
  else add('Delivery', compact ? 'Calculated at checkout' : 'Choose an area below');
  add('Total', money(quote.total), 'csum__total');
  if (quote.belowMinimum) box.append(el('p', 'cline__msg', `The minimum order is ${money(quote.minimumOrder)}.`));
  if (!quote.deliveryEnabled) box.append(el('p', 'cline__msg', 'Delivery is paused right now.'));
  return box;
}

async function render(root, compact) {
  const lines = readLines();
  root.setAttribute('aria-busy', 'true');
  if (!lines.length) {
    const e = el('div', 'cempty'); e.append(el('p', 'cempty__title', 'Your bag is empty.'), el('p', '', 'A scoop or two would fix that.'));
    const a = el('a', 'btn', 'Browse the flavours'); a.href = '/shop'; e.append(a);
    root.replaceChildren(e); root.setAttribute('aria-busy', 'false'); return;
  }
  let quote;
  try { quote = await getQuote(lines); }
  catch {
    const e = el('div', 'cempty'); e.append(el('p', 'cempty__title', "We couldn't price your bag."), el('p', '', 'Check your connection and try again.'));
    const b = el('button', 'btn', 'Try again'); b.type = 'button'; b.onclick = () => render(root, compact); e.append(b);
    root.replaceChildren(e); root.setAttribute('aria-busy', 'false'); return;
  }
  // Remember the unit price shown the first time we see a line, to detect later changes.
  const unseen = lines.filter((l, i) => l.seen == null && quote.lines[i]?.status === 'ok');
  if (unseen.length) { const next = readLines().map((l) => { const i = lines.findIndex((x) => x.id === l.id); return l.seen == null && i >= 0 && quote.lines[i]?.status === 'ok' ? { ...l, seen: quote.lines[i].unit } : l; }); try { localStorage.setItem('scoope.cart.v1', JSON.stringify(next)); } catch { /* ignore */ } lines.forEach((l, i) => { if (l.seen == null && quote.lines[i]?.status === 'ok') l.seen = quote.lines[i].unit; }); }

  const list = el('ul', 'clines');
  lines.forEach((l, i) => list.append(lineItem(l, quote.lines[i])));
  const side = el('div', 'cside');
  side.append(summary(root, quote, compact));
  const blocked = quote.hasProblems || quote.belowMinimum || quote.subtotal === 0;

  if (!compact) {
    const cf = el('form', 'cform'); cf.noValidate = true;
    const lab = el('label', 'field'); lab.append(el('span', 'field__label', 'Discount code'));
    const inp = el('input'); inp.type = 'text'; inp.name = 'coupon'; inp.maxLength = 30; inp.autocomplete = 'off'; inp.value = couponStore.get(); lab.append(inp);
    const go = el('button', 'btn btn--small', 'Apply'); go.type = 'submit';
    cf.append(lab, go);
    cf.onsubmit = (e) => { e.preventDefault(); couponStore.set(inp.value.trim().toUpperCase()); refreshAll(); };
    side.append(cf);
    if (quote.coupon && !quote.coupon.valid) side.append(el('p', 'cline__msg', COUPON_MSG[quote.coupon.reason] || 'That code cannot be used.'));
    else if (quote.coupon?.valid) side.append(el('p', 'cform__ok', `Code ${quote.coupon.code} applied.`));

    if (!zones) { try { zones = (await (await fetch('/api/v1/delivery-zones')).json()).items; } catch { zones = []; } }
    const zl = el('label', 'field'); zl.append(el('span', 'field__label', 'Delivery area'));
    const sel = el('select'); sel.append(new Option('Choose an area', ''));
    for (const z of zones) sel.append(new Option(`${z.name}: ${z.areas.join(', ')} (${money(z.fee)})`, z.id));
    sel.value = zoneStore.get(); sel.onchange = () => { zoneStore.set(sel.value); refreshAll(); };
    zl.append(sel); side.append(zl);
    if (quote.delivery && !quote.delivery.available) side.append(el('p', 'cline__msg', 'Delivery is not available to that area right now.'));
  }
  const checkout = el('a', `btn csum__go${blocked ? ' is-disabled' : ''}`, 'Checkout');
  checkout.href = blocked ? '#' : '/checkout';
  if (blocked) { checkout.setAttribute('aria-disabled', 'true'); checkout.onclick = (e) => e.preventDefault(); }
  side.append(checkout);
  if (compact) { const v = el('a', 'link csum__view', 'View full bag'); v.href = '/cart'; side.append(v); }
  side.append(el('p', 'csum__demo', 'Demonstration store. No real payment is taken.'));

  root.replaceChildren(list, side);
  hydrateArt(root); initImages(root);
  root.setAttribute('aria-busy', 'false');
}

function refreshAll() { views.forEach((v) => render(v.root, v.compact)); }
function mount(root, compact) { views.add({ root, compact }); return render(root, compact); }

function initDrawer() {
  const drawer = document.querySelector('[data-drawer]');
  if (!drawer) return;
  const panel = drawer.querySelector('.drawer__panel'), body = drawer.querySelector('[data-drawer-body]');
  let opener = null, timer = 0;
  mount(body, true);
  const focusables = () => [...panel.querySelectorAll('a[href], button:not([disabled]), input, select, [tabindex="0"]')].filter((e) => e.offsetParent !== null);
  function open() {
    clearTimeout(timer); opener = document.activeElement;
    drawer.hidden = false; document.documentElement.classList.add('drawer-open');
    requestAnimationFrame(() => { drawer.classList.add('is-open'); panel.focus(); });
    render(body, true);
  }
  function close() {
    drawer.classList.remove('is-open'); document.documentElement.classList.remove('drawer-open');
    timer = setTimeout(() => { drawer.hidden = true; }, 320);
    if (opener && opener.focus) opener.focus();
  }
  document.querySelector('a.bag')?.addEventListener('click', (e) => {
    if (document.body.dataset.page === 'cart' || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault(); open();
  });
  drawer.querySelectorAll('[data-drawer-close]').forEach((b) => b.addEventListener('click', close));
  drawer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener('scoope:added', () => { if (document.body.dataset.page !== 'cart') open(); });
}

export function initCart() {
  window.addEventListener('scoope:cart', () => refreshAll());
  window.addEventListener('storage', (e) => { if (e.key === 'scoope.cart.v1') refreshAll(); });
  initDrawer();
  const page = document.querySelector('[data-cart-page]');
  if (page) mount(page, false);
}
