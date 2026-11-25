'use strict';
// Authoritative pricing. The browser sends ONLY identifiers and quantities; every price,
// label and availability decision here comes from the catalogue and settings.
const db = require('./db');
const rewards = require('./rewards');

const MAX_QTY = 20;
const MAX_LINES = 30;
const LIMITS = { maxToppings: 4, maxSauces: 2, maxExtras: 2 };
const isInt = Number.isInteger;
const uniq = (a) => new Set(a).size === a.length;

function freeStock(inv) { return inv ? Math.max(0, inv.onHand - inv.reserved) : 0; }
const bad = (line, reason, extra = {}) => ({ id: line.id ?? null, type: line.type || 'product', status: 'invalid', reason, ...extra });
const idOf = (x) => (typeof x === 'string' && x.length <= 80 ? x : null);

function builderConfig() {
  const b = db.read('settings').builder;
  const inv = new Map(db.read('inventory').map((i) => [i.productId, i]));
  const flavours = db.read('products')
    .filter((p) => p.category === 'classic-scoops' && !p.archived)
    .map((p) => ({ slug: p.slug, name: p.name, notes: p.flavourNotes, available: p.available && freeStock(inv.get(p.id)) > 0 }));
  return { ...LIMITS, maxScoops: b.maxScoops, scoopPrice: b.scoopPrice, bases: b.bases, toppings: b.toppings, sauces: b.sauces, extras: b.extras, flavours };
}

function priceProduct(line, products, inv) {
  const p = products.get(idOf(line.productId));
  if (!p || p.archived) return bad(line, 'not_found');
  if (!isInt(line.qty) || line.qty < 1 || line.qty > MAX_QTY) return bad(line, 'invalid_quantity', { max: MAX_QTY });
  const pick = (list, v) => {
    if (!list.length) return v == null ? [null] : [undefined];
    if (v == null) return [list[0]];
    const hit = list.find((o) => o.id === v);
    return hit ? [hit] : [undefined];
  };
  const [size] = pick(p.sizes.length > 1 ? p.sizes : [], line.size);
  const [variant] = pick(p.variants, line.variant);
  if (size === undefined) return bad(line, 'invalid_size');
  if (variant === undefined) return bad(line, 'invalid_variant');
  const free = freeStock(inv.get(p.id));
  const base = { id: line.id ?? null, type: 'product', productId: p.id, slug: p.slug, name: p.name, category: p.category,
    size: size?.id ?? null, sizeLabel: size?.label ?? null, variant: variant?.id ?? null, variantLabel: variant?.label ?? null, qty: line.qty };
  if (!p.available || free < 1) return { ...base, status: 'unavailable', reason: 'sold_out' };
  if (line.qty > free) return { ...base, status: 'unavailable', reason: 'insufficient_stock', maxQty: free };
  const unit = p.price + (size?.priceDelta || 0) + (variant?.priceDelta || 0);
  return { ...base, status: 'ok', unit, lineTotal: unit * line.qty };
}

function priceBuild(line, cfg) {
  const c = line.config;
  if (!c || typeof c !== 'object') return bad(line, 'invalid_config');
  if (!isInt(line.qty) || line.qty < 1 || line.qty > MAX_QTY) return bad(line, 'invalid_quantity', { max: MAX_QTY });
  const base = cfg.bases.find((b) => b.id === c.base);
  if (!base) return bad(line, 'invalid_base');
  if (!Array.isArray(c.scoops) || c.scoops.length < 1 || c.scoops.length > cfg.maxScoops) return bad(line, 'invalid_scoops');
  const flavours = new Map(cfg.flavours.map((f) => [f.slug, f]));
  let scoopTotal = 0; const scoops = [];
  for (const s of c.scoops) {
    const f = s && flavours.get(s.flavour);
    if (!f || !isInt(s.qty) || s.qty < 1) return bad(line, 'invalid_scoops');
    if (!f.available) return { id: line.id ?? null, type: 'build', status: 'unavailable', reason: 'flavour_sold_out', flavour: f.name };
    scoopTotal += s.qty; scoops.push({ flavour: f.slug, name: f.name, qty: s.qty });
  }
  if (!uniq(c.scoops.map((s) => s.flavour))) return bad(line, 'duplicate_flavour');
  if (scoopTotal > cfg.maxScoops) return bad(line, 'too_many_scoops', { max: cfg.maxScoops });
  const choose = (key, max) => {
    const ids = c[key] ?? [];
    if (!Array.isArray(ids) || ids.length > max || !uniq(ids)) return null;
    const out = ids.map((i) => cfg[key].find((o) => o.id === i));
    return out.includes(undefined) ? null : out;
  };
  const toppings = choose('toppings', cfg.maxToppings), sauces = choose('sauces', cfg.maxSauces), extras = choose('extras', cfg.maxExtras);
  if (!toppings) return bad(line, 'invalid_toppings');
  if (!sauces) return bad(line, 'invalid_sauces');
  if (!extras) return bad(line, 'invalid_extras');
  const sum = (a) => a.reduce((n, o) => n + o.price, 0);
  const unit = base.price + scoopTotal * cfg.scoopPrice + sum(toppings) + sum(sauces) + sum(extras);
  return { id: line.id ?? null, type: 'build', name: 'Custom sundae', status: 'ok', qty: line.qty, unit, lineTotal: unit * line.qty,
    config: { base: base.id, scoops: scoops.map(({ flavour, qty }) => ({ flavour, qty })), toppings: toppings.map((o) => o.id), sauces: sauces.map((o) => o.id), extras: extras.map((o) => o.id) },
    summary: { base: base.label, scoops, toppings: toppings.map((o) => o.label), sauces: sauces.map((o) => o.label), extras: extras.map((o) => o.label) } };
}

function applyCoupon(code, subtotal) {
  if (code == null || code === '') return { discount: 0, coupon: null };
  const c = typeof code === 'string' ? code.trim().toUpperCase() : '';
  const row = /^[A-Z0-9_-]{3,30}$/.test(c) && db.read('coupons').find((x) => x.code === c);
  if (!row || !row.active) return { discount: 0, coupon: { code: c.slice(0, 30), valid: false, reason: 'invalid' } };
  if (row.expiresAt && new Date(row.expiresAt) < new Date()) return { discount: 0, coupon: { code: c, valid: false, reason: 'expired' } };
  if (row.maxUses != null && (row.used || 0) >= row.maxUses) return { discount: 0, coupon: { code: c, valid: false, reason: 'used_up' } };
  if (row.minOrder && subtotal < row.minOrder) return { discount: 0, coupon: { code: c, valid: false, reason: 'min_order', minOrder: row.minOrder } };
  const discount = row.type === 'percent' ? Math.floor((subtotal * row.value) / 100) : Math.min(row.value, subtotal);
  return { discount, coupon: { code: c, valid: true, type: row.type, value: row.value } };
}

/** input: { lines, couponCode?, zoneId? } -> fully priced quote. Never trusts client numbers. */
function quote(input = {}) {
  const raw = Array.isArray(input.lines) ? input.lines : null;
  if (!raw) { const e = new Error('lines must be an array'); e.status = 400; e.code = 'invalid_lines'; throw e; }
  if (raw.length > MAX_LINES) { const e = new Error('too many lines'); e.status = 400; e.code = 'too_many_lines'; throw e; }
  const products = new Map(db.read('products').map((p) => [p.id, p]));
  const inv = new Map(db.read('inventory').map((i) => [i.productId, i]));
  const cfg = builderConfig();
  const lines = raw.map((l) => {
    if (l === null || typeof l !== 'object' || Array.isArray(l)) return bad({}, 'invalid_line');
    const line = { ...l, id: idOf(l.id) };
    return l.type === 'build' ? priceBuild(line, cfg) : priceProduct(line, products, inv);
  });
  const subtotal = lines.filter((l) => l.status === 'ok').reduce((n, l) => n + l.lineTotal, 0);
  const { discount, coupon } = applyCoupon(input.couponCode, subtotal);
  const settings = db.read('settings');
  let delivery = null;
  if (input.zoneId != null) {
    const z = db.read('delivery-zones').find((x) => x.id === input.zoneId && x.active);
    delivery = { zoneId: input.zoneId, available: Boolean(z) && settings.deliveryEnabled, fee: z ? z.fee : null, zoneName: z?.name ?? null };
  }
  const points = rewards.redemption(input.userId, Number.isInteger(input.redeemPoints) ? input.redeemPoints : 0, subtotal - discount);
  const afterDiscount = subtotal - discount - points.discount;
  const fee = delivery?.available ? delivery.fee : 0;
  return {
    currency: 'NGN', lines, subtotal, discount, coupon, points, delivery,
    minimumOrder: settings.minimumOrder, belowMinimum: subtotal > 0 && afterDiscount < settings.minimumOrder,
    deliveryEnabled: settings.deliveryEnabled, total: afterDiscount + fee, hasProblems: lines.some((l) => l.status !== 'ok'),
  };
}

module.exports = { quote, builderConfig, MAX_QTY, MAX_LINES, LIMITS };
