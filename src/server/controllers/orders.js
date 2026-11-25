'use strict';
const { sendJson } = require('../utils/http');
const { readJson } = require('../middleware/body');
const { clientIp } = require('../middleware/ratelimit');
const { httpError } = require('../utils/errors');
const { limit } = require('./account');
const orders = require('../services/orders');

async function place(ctx) {
  limit(ctx.req, 'order', clientIp(ctx.req), 3600_000, 12);
  const b = await readJson(ctx.req);
  const r = await orders.create(b, ctx.user);
  if (r.duplicate) return sendJson(ctx.res, 200, { duplicate: true, reference: r.order.reference, message: 'This order was already placed.' });
  sendJson(ctx.res, 201, { reference: r.order.reference, token: r.token, payUrl: `/pay/${r.token}`, order: orders.view(r.order) });
}
async function lookup(ctx) {
  const o = await orders.find(ctx.params.key, ctx.user);
  if (!o) throw httpError(404, 'order_not_found');
  sendJson(ctx.res, 200, orders.view(o));
}
async function pay(ctx) {
  limit(ctx.req, 'pay', clientIp(ctx.req), 3600_000, 40);
  const b = await readJson(ctx.req);
  const r = await orders.pay(ctx.params.key, ctx.user, b.scenario);
  sendJson(ctx.res, r.failed ? 402 : 200, { order: orders.view(r.order), paid: !r.failed, failed: Boolean(r.failed), message: r.message || null, attemptsLeft: r.failed ? Math.max(0, 5 - r.attempts) : null });
}
async function cancel(ctx) {
  await readJson(ctx.req);
  sendJson(ctx.res, 200, { order: orders.view(await orders.cancel(ctx.params.key, ctx.user)) });
}
module.exports = { place, lookup, pay, cancel };
