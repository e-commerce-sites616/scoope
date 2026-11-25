'use strict';
const http = require('node:http');
const { applySecurityHeaders } = require('./middleware/security');
const { route } = require('./routes');
const { sendJson } = require('./utils/http');
const config = require('./config');

function createServer() {
  const server = http.createServer(async (req, res) => {
    const started = process.hrtime.bigint();
    applySecurityHeaders(res);
    // Log method, path (no query string) and status only: no tokens or personal data.
    res.on('finish', () => {
      if (process.env.NODE_ENV === 'test') return;
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      console.log(`${req.method} ${(req.url || '').split('?')[0]} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
    try {
      await route(req, res);
    } catch (err) {
      if (err && err.status) { if (!res.headersSent) sendJson(res, err.status, { error: err.code || 'bad_request', ...(err.details ? { details: err.details } : {}) }); return; }
      console.error('Unhandled error:', config.isProd ? err.message : err);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal_error' });
      else res.destroy();
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

module.exports = { createServer };
