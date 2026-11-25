'use strict';
const { sendJson } = require('../utils/http');
const { readJson } = require('../middleware/body');
const pricing = require('../services/pricing');
const db = require('../services/db');

async function quote(req, res, user) {
  const body = await readJson(req);
  sendJson(res, 200, pricing.quote({ lines: body.lines, couponCode: body.couponCode, userId: user?.id, redeemPoints: Number.isInteger(body.redeemPoints) ? body.redeemPoints : 0, zoneId: typeof body.zoneId === 'string' ? body.zoneId : undefined }));
}
const builderConfig = (req, res) => sendJson(res, 200, pricing.builderConfig(), req.method === 'HEAD');
const zones = (req, res) => sendJson(res, 200, {
  deliveryEnabled: db.read('settings').deliveryEnabled,
  items: db.read('delivery-zones').filter((z) => z.active).map(({ id, name, fee, areas }) => ({ id, name, fee, areas })),
}, req.method === 'HEAD');

module.exports = { quote, builderConfig, zones };
