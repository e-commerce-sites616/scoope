'use strict';
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const env = process.env;
const nodeEnv = env.NODE_ENV || 'development';

module.exports = Object.freeze({
  root,
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: env.PORT !== undefined && env.PORT !== '' ? Number(env.PORT) : 3000,
  host: env.HOST || '0.0.0.0',
  siteUrl: (env.SITE_URL || '').replace(/\/$/, ''),
  dataDir: env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(root, 'data'),
  persistentStorage: Boolean(env.DATA_DIR),
  clientDir: path.join(root, 'src/client'),
  publicDir: path.join(root, 'public'),
  version: require(path.join(root, 'package.json')).version,
});
