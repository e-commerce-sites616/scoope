'use strict';
// Process-wide store singleton, configured from DATA_DIR.
const config = require('../config');
const { Store } = require('./store');
const { buildSeeds } = require('../models/seed');

const db = new Store(config.dataDir);
db.newId0 = (p) => Store.prototype.newId.call(db, p);
db.newId = (prefix) => db.newId0(prefix);
db.start = () => db.init(buildSeeds());
module.exports = db;
