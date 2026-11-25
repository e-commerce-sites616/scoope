'use strict';
const db = require('./db');

function stockOf(inv) {
  const free = inv ? Math.max(0, inv.onHand - inv.reserved) : 0;
  return { inStock: free > 0, lowStock: free > 0 && free <= (inv?.lowStockThreshold ?? 0) };
}

// Public shape: never exposes exact stock counts or internal fields.
function toPublic(p, invByProduct) {
  const s = stockOf(invByProduct.get(p.id));
  const { archived, popularity, ...rest } = p;
  return { ...rest, popularity, inStock: s.inStock, lowStock: s.lowStock, available: p.available && s.inStock };
}

const SORTS = {
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  popular: (a, b) => b.popularity - a.popularity,
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
};

function load() {
  const inv = new Map(db.read('inventory').map((i) => [i.productId, i]));
  return { products: db.read('products').filter((p) => !p.archived), inv };
}

function list(q = {}) {
  const { products, inv } = load();
  let rows = products.map((p) => toPublic(p, inv));
  const term = (q.q || '').trim().toLowerCase();
  if (term) rows = rows.filter((p) => p.name.toLowerCase().includes(term) || p.flavourNotes.some((n) => n.toLowerCase().includes(term)));
  if (q.category) rows = rows.filter((p) => p.category === q.category);
  if (Number.isFinite(q.minPrice)) rows = rows.filter((p) => p.price >= q.minPrice);
  if (Number.isFinite(q.maxPrice)) rows = rows.filter((p) => p.price <= q.maxPrice);
  if (q.available) rows = rows.filter((p) => p.available);
  if (q.featured) rows = rows.filter((p) => p.featured);
  if (q.bestseller) rows = rows.filter((p) => p.bestseller);
  rows.sort(SORTS[q.sort] || SORTS.popular);
  const total = rows.length;
  const limit = Math.min(Math.max(q.limit || 24, 1), 60);
  const page = Math.max(q.page || 1, 1);
  return { total, page, limit, items: rows.slice((page - 1) * limit, page * limit) };
}

function bySlug(slug) {
  const { products, inv } = load();
  const p = products.find((x) => x.slug === slug);
  if (!p) return null;
  const relatedSlugs = p.related.length ? p.related : products.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 3).map((x) => x.slug);
  const related = relatedSlugs.map((s) => products.find((x) => x.slug === s)).filter(Boolean).map((x) => toPublic(x, inv));
  return { ...toPublic(p, inv), related };
}

const categories = () => db.read('categories').sort((a, b) => a.sort - b.sort);

module.exports = { list, bySlug, categories, SORTS };
