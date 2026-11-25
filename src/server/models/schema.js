'use strict';
// Minimal schema validator: { field: { type, required, min, max, enum, pattern, items } }
const TYPES = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  int: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  array: Array.isArray,
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
};

function validate(schema, rec, label = 'record') {
  const errors = [];
  if (!TYPES.object(rec)) return [`${label} must be an object`];
  for (const [k, r] of Object.entries(schema)) {
    const v = rec[k];
    if (v === undefined || v === null) { if (r.required) errors.push(`${k} is required`); continue; }
    if (!TYPES[r.type](v)) { errors.push(`${k} must be ${r.type}`); continue; }
    if (r.min !== undefined && (typeof v === 'string' || Array.isArray(v) ? v.length : v) < r.min) errors.push(`${k} is below minimum ${r.min}`);
    if (r.max !== undefined && (typeof v === 'string' || Array.isArray(v) ? v.length : v) > r.max) errors.push(`${k} is above maximum ${r.max}`);
    if (r.enum && !r.enum.includes(v)) errors.push(`${k} must be one of ${r.enum.join(', ')}`);
    if (r.pattern && !r.pattern.test(v)) errors.push(`${k} has an invalid format`);
  }
  return errors;
}

const id = { type: 'string', required: true, min: 3, max: 80 };
const SCHEMAS = {
  users: { id, email: { type: 'string', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }, name: { type: 'string', required: true, min: 1, max: 80 }, passwordHash: { type: 'string', required: true } },
  sessions: { id, userId: { type: 'string', required: true }, csrf: { type: 'string', required: true }, expiresAt: { type: 'string', required: true } },
  orders: { id, reference: { type: 'string', required: true }, status: { type: 'string', required: true }, paymentStatus: { type: 'string', required: true }, total: { type: 'int', required: true, min: 0 }, lines: { type: 'array', required: true } },
  payments: { id, orderId: { type: 'string', required: true }, amount: { type: 'int', required: true }, status: { type: 'string', required: true } },
  reviews: { id, productId: { type: 'string', required: true }, userId: { type: 'string', required: true }, rating: { type: 'int', required: true, min: 1, max: 5 }, body: { type: 'string', required: true } },
  addresses: { id, userId: { type: 'string', required: true }, line1: { type: 'string', required: true }, zoneId: { type: 'string', required: true } },
  rewards: { id, userId: { type: 'string', required: true }, points: { type: 'int', required: true }, type: { type: 'string', required: true, enum: ['earn', 'redeem', 'reversal'] } },
  messages: { id },
  subscribers: { id },
  categories: { id, slug: { type: 'string', required: true, pattern: /^[a-z0-9-]+$/ }, name: { type: 'string', required: true, min: 1, max: 80 } },
  products: {
    id,
    slug: { type: 'string', required: true, pattern: /^[a-z0-9-]{1,80}$/ },
    name: { type: 'string', required: true, min: 1, max: 120 },
    description: { type: 'string', required: true, max: 2000 },
    category: { type: 'string', required: true },
    price: { type: 'int', required: true, min: 0, max: 10_000_000 },
    images: { type: 'array', required: true },
    sizes: { type: 'array', required: true },
    variants: { type: 'array', required: true },
    ingredients: { type: 'array', required: true },
    allergens: { type: 'array', required: true },
    flavourNotes: { type: 'array', required: true },
    available: { type: 'boolean', required: true },
    featured: { type: 'boolean', required: true },
    bestseller: { type: 'boolean', required: true },
    archived: { type: 'boolean', required: true },
    popularity: { type: 'int', required: true, min: 0 },
  },
  inventory: {
    id,
    productId: { type: 'string', required: true },
    onHand: { type: 'int', required: true, min: 0 },
    reserved: { type: 'int', required: true, min: 0 },
    lowStockThreshold: { type: 'int', required: true, min: 0 },
  },
  coupons: {
    id,
    code: { type: 'string', required: true, pattern: /^[A-Z0-9_-]{3,30}$/ },
    type: { type: 'string', required: true, enum: ['percent', 'fixed'] },
    value: { type: 'int', required: true, min: 1 },
    active: { type: 'boolean', required: true },
  },
  'delivery-zones': {
    id,
    name: { type: 'string', required: true },
    fee: { type: 'int', required: true, min: 0 },
    areas: { type: 'array', required: true },
    active: { type: 'boolean', required: true },
  },
  settings: {
    storeName: { type: 'string', required: true, min: 1 },
    currency: { type: 'string', required: true, enum: ['NGN'] },
    deliveryEnabled: { type: 'boolean', required: true },
    builder: { type: 'object', required: true },
  },
};
// Collections stored as a single object rather than an array.
const OBJECT_COLLECTIONS = new Set(['settings']);

module.exports = { validate, SCHEMAS, OBJECT_COLLECTIONS };
