'use strict';
const { sendJson } = require('../utils/http');
const catalogue = require('../services/catalogue');

const num = (v) => (v === null || v === '' ? undefined : Number(v));

function listProducts(req, res) {
  const sp = new URL(req.url, 'http://x').searchParams;
  const sort = sp.get('sort') || 'popular';
  if (!Object.keys(catalogue.SORTS).includes(sort)) return sendJson(res, 400, { error: 'invalid_sort' });
  const q = {
    q: (sp.get('q') || '').slice(0, 80), category: sp.get('category') || undefined, sort,
    minPrice: num(sp.get('minPrice')), maxPrice: num(sp.get('maxPrice')),
    page: num(sp.get('page')), limit: num(sp.get('limit')),
    available: sp.get('available') === 'true', featured: sp.get('featured') === 'true', bestseller: sp.get('bestseller') === 'true',
  };
  for (const k of ['minPrice', 'maxPrice', 'page', 'limit']) if (q[k] !== undefined && !Number.isFinite(q[k])) return sendJson(res, 400, { error: `invalid_${k}` });
  sendJson(res, 200, catalogue.list(q), req.method === 'HEAD');
}

function getProduct(req, res, slug) {
  const p = catalogue.bySlug(slug);
  if (!p) return sendJson(res, 404, { error: 'product_not_found' });
  sendJson(res, 200, p, req.method === 'HEAD');
}

const listCategories = (req, res) => sendJson(res, 200, { items: catalogue.categories() }, req.method === 'HEAD');

module.exports = { listProducts, getProduct, listCategories };
