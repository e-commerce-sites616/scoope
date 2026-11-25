'use strict';
const config = require('../config');
const { sendJson } = require('../utils/http');
const db = require('../services/db');

// Reports health only. No paths, secrets or customer data.
function health(req, res) {
  sendJson(res, 200, {
    status: 'ok',
    service: 'scoope',
    version: config.version,
    environment: config.nodeEnv,
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString(),
    store: db.status(),
    storage: {
      mode: config.persistentStorage ? 'configured-data-dir' : 'temporary-demo',
      note: config.persistentStorage
        ? 'DATA_DIR is set. Data survives restarts only if it points at a persistent disk.'
        : 'No DATA_DIR set: data may be lost on redeploy or restart.',
    },
  }, req.method === 'HEAD');
}

module.exports = { health };
