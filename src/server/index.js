'use strict';
const config = require('./config');
const { createServer } = require('./app');

const db = require('./services/db');
const server = createServer();

const orders = require('./services/orders');
db.start().then(() => server.listen(config.port, config.host, () => {
  console.log(`SCOOPÉ ${config.version} listening on http://${config.host}:${config.port} (${config.nodeEnv})`);
  if (!config.persistentStorage) {
    console.warn('Storage: DATA_DIR not set. Using temporary demo storage; data may be lost on redeploy.');
  }
  setInterval(() => orders.expireSweep().catch((e) => console.error('sweep:', e.message)), 60_000).unref();
  if (db.recovered.length) console.warn('Recovered collections on start:', db.recovered.map((r) => `${r.name}<-${r.from}`).join(', '));
})).catch((err) => { console.error('Failed to start data store:', err.message); process.exit(1); });

function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully`);
  // let in-flight JSON writes finish before exiting, so a deploy never truncates a file
  server.close(() => Promise.allSettled([...db.queues.values()]).then(() => process.exit(0)));
  server.closeIdleConnections?.();
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
