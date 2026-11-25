import { api, me, el, money, field, msgBox, errText } from './api.js';
import { readLines, writeLines } from './bag.js';

const mem = (k) => ({ get: () => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* */ } } });
const coupon = mem('scoope.coupon.v1'), zoneStore = mem('scoope.zone.v1'), giftStore = mem('scoope.gift.v1');
const newKey = () => { try { let k = sessionStorage.getItem('scoope.idem'); if (!k) { k = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40); sessionStorage.setItem('scoope.idem', k); } return k; } catch { return `k${Date.now()}${Math.random().toString(36).slice(2)}`; } };

export async function initCheckout() {
  if (document.body.dataset.page !== 'checkout') return;
  const root = document.querySelector('[data-app]');
  const lines = readLines();
  if (!lines.length) { const e = el('div', 'cempty'); e.append(el('p', 'cempty__title', 'Your bag is empty.'), el('p', '', 'Add something sweet before checking out.')); const a = el('a', 'btn', 'Browse the flavours'); a.href = '/shop'; e.append(a); root.replaceChildren(e); return; }

  const info = await me(); const zones = (await (await fetch('/api/v1/delivery-zones')).json()).items;
  let saved = []; if (info.user) { try { saved = (await api('GET', '/api/v1/account')).addresses; } catch { /* */ } }
  let gift = null; try { gift = JSON.parse(giftStore.get() || 'null'); } catch { /* */ }
  const lineBody = lines.map(({ id, type, productId, size, variant, qty, config }) => ({ id, type, productId, size, variant, qty, config }));
  const state = { redeem: 0, quote: null };

  const form = el('form', 'cform2'); form.noValidate = true;
  const demo = el('p', 'demo-banner', 'Demonstration store: you will be asked to simulate a payment on the next step. No real money is collected.');
  const s1 = el('fieldset', 'fs'); s1.append(el('legend', '', 'Contact'), field('Full name', 'name', { value: info.user?.name || '', autocomplete: 'name', maxlength: 80, required: '' }), field('Email address', 'email', { type: 'email', value: info.user?.email || '', autocomplete: 'email', required: '' }), field('Phone', 'phone', { type: 'tel', value: info.user?.phone || '', autocomplete: 'tel', maxlength: 20, required: '' }));
  const s2 = el('fieldset', 'fs'); s2.append(el('legend', '', 'Delivery'));
  if (saved.length) { const sl = el('label', 'field'); sl.append(el('span', 'field__label', 'Use a saved address')); const ss = document.createElement('select'); ss.append(new Option('Enter a new address', '')); saved.forEach((a) => ss.append(new Option(`${a.label}: ${a.line1}`, a.id))); ss.onchange = () => { const a = saved.find((x) => x.id === ss.value); if (a) { form.elements.line1.value = a.line1; form.elements.area.value = a.area; zoneStore.set(a.zoneId); refresh(); } }; sl.append(ss); s2.append(sl); }
  const areaL = el('label', 'field'); areaL.append(el('span', 'field__label', 'Area')); const area = document.createElement('select'); area.name = 'area'; area.required = true; area.append(new Option('Choose your area', ''));
  for (const z of zones) { const g = document.createElement('optgroup'); g.label = `${z.name}: ${money(z.fee)} delivery`; z.areas.forEach((a) => { const o = new Option(a, a); o.dataset.zone = z.id; g.append(o); }); area.append(g); }
  const pre = zones.find((z) => z.id === zoneStore.get()); if (pre) area.value = pre.areas[0]; areaL.append(area);
  s2.append(areaL, field('Street address', 'line1', { maxlength: 160, autocomplete: 'street-address', required: '' }), field('Delivery notes (optional)', 'notes', { maxlength: 200 }, 'textarea'));
  const s3 = el('fieldset', 'fs'); const gl = el('label', 'check'); const gc = document.createElement('input'); gc.type = 'checkbox'; gc.name = 'isGift'; gc.checked = Boolean(gift); gl.append(gc, el('span', '', 'This order is a gift')); const gfields = el('div', 'gfields'); gfields.hidden = !gift;
  gfields.append(field("Recipient's name", 'recipient', { value: gift?.recipient || '', maxlength: 80 }), field('Gift message', 'message', { value: gift?.message || '', maxlength: 300, rows: 3 }, 'textarea'));
  gc.onchange = () => { gfields.hidden = !gc.checked; }; s3.append(el('legend', '', 'Gift'), gl, gfields);
  const s4 = el('fieldset', 'fs'); s4.append(el('legend', '', 'Discounts'));
  const cl = field('Discount code', 'coupon', { value: coupon.get(), maxlength: 30, autocomplete: 'off' }); s4.append(cl);
  const pts = el('div', 'pts'); s4.append(pts);
  const errs = el('div', 'form__errs'); errs.setAttribute('role', 'alert');
  const submit = el('button', 'btn csum__go', 'Place order'); submit.type = 'submit';
  form.append(demo, s1, s2, s3, s4, errs, submit);
  const side = el('aside', 'cside cside--co'); const sum = el('div', 'csum');
  side.append(el('h2', 'cside__h', 'Order summary'), sum);
  const grid = el('div', 'cogrid'); grid.append(form, side); root.replaceChildren(grid);

  const selZone = () => area.selectedOptions[0]?.dataset.zone || '';
  async function refresh() {
    const z = selZone(); zoneStore.set(z); coupon.set(form.elements.coupon.value.trim().toUpperCase());
    try { state.quote = await api('POST', '/api/v1/cart/quote', { lines: lineBody, couponCode: coupon.get() || undefined, zoneId: z || undefined, redeemPoints: state.redeem || undefined }); } catch { sum.replaceChildren(el('p', 'cline__msg', "We couldn't price your order. Please try again.")); return; }
    const q = state.quote; sum.replaceChildren();
    for (const l of q.lines) { const r = el('div', `csum__row${l.status !== 'ok' ? ' cline--bad' : ''}`); r.append(el('span', '', `${l.qty} × ${l.name || 'Item'}`), el('span', '', l.status === 'ok' ? money(l.lineTotal) : 'Unavailable')); sum.append(r); }
    const add = (a, b, c = '') => { const r = el('div', `csum__row ${c}`); r.append(el('span', '', a), el('span', '', b)); sum.append(r); };
    add('Subtotal', money(q.subtotal));
    if (q.discount) add(`Discount (${q.coupon.code})`, `−${money(q.discount)}`);
    if (q.points.discount) add(`Rewards (${q.points.applied} pts)`, `−${money(q.points.discount)}`);
    add('Delivery', q.delivery?.available ? `${money(q.delivery.fee)} (${q.delivery.zoneName})` : 'Choose your area');
    add('Total', money(q.total), 'csum__total');
    if (q.coupon && !q.coupon.valid) sum.append(el('p', 'cline__msg', 'That discount code cannot be used.'));
    if (q.belowMinimum) sum.append(el('p', 'cline__msg', `The minimum order is ${money(q.minimumOrder)}.`));
    pts.replaceChildren();
    if (info.user && info.points >= 100) {
      const l = el('label', 'check'); const c = document.createElement('input'); c.type = 'checkbox'; c.checked = state.redeem > 0;
      const base = q.subtotal - q.discount; const maxBlocks = Math.min(Math.floor(info.points / 100), Math.floor((base * 0.5) / 500));
      l.append(c, el('span', '', maxBlocks > 0 ? `Use ${maxBlocks * 100} points (${money(maxBlocks * 500)} off)` : 'Points can be used on larger orders')); c.disabled = maxBlocks < 1;
      c.onchange = () => { state.redeem = c.checked ? maxBlocks * 100 : 0; refresh(); }; pts.append(l);
    } else if (info.user) pts.append(el('p', 'pdp__demo', `You have ${info.points} points. Redeem from 100.`)); else { const a = el('a', 'link', 'Sign in'); a.href = '/account?next=/checkout'; pts.append(a, document.createTextNode(' to earn and use reward points.')); }
    submit.disabled = q.hasProblems || q.belowMinimum || !q.delivery?.available || !q.subtotal;
  }
  area.onchange = refresh; form.elements.coupon.addEventListener('change', refresh);

  form.onsubmit = async (e) => {
    e.preventDefault(); errs.textContent = ''; submit.disabled = true; submit.textContent = 'Placing your order...';
    const f = form.elements;
    const payload = { lines: lineBody, couponCode: coupon.get() || undefined, redeemPoints: state.redeem || undefined, idempotencyKey: newKey(),
      customer: { name: f.name.value, email: f.email.value, phone: f.phone.value }, address: { line1: f.line1.value, area: f.area.value, notes: f.notes.value },
      gift: f.isGift.checked ? { recipient: f.recipient.value, message: f.message.value } : undefined };
    try {
      const r = await api('POST', '/api/v1/orders', payload);
      if (r.duplicate) { errs.textContent = 'This order was already placed. If you lost the payment page, sign in and open it from your account.'; submit.textContent = 'Place order'; return; }
      try { sessionStorage.removeItem('scoope.idem'); } catch { /* */ } giftStore.set(''); coupon.set('');
      writeLines([]);
      location.href = r.payUrl;
    } catch (err) {
      errs.textContent = errText(err); submit.textContent = 'Place order'; refresh();
    }
  };
  refresh();
}
