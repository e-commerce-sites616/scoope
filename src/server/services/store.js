'use strict';
// File-backed JSON store. One file per collection.
// Guarantees: serialised writes per collection, atomic replace (tmp + fsync + rename),
// validation before persisting, rolling backups, corruption quarantine and recovery.
// Non-guarantees: no multi-collection transactions, no multi-process safety. Run ONE instance.
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { validate, SCHEMAS, OBJECT_COLLECTIONS } = require('../models/schema');

const BACKUP_EVERY_MS = 60_000;
const BACKUPS_KEPT = 10;

class Store {
  constructor(dir) {
    this.dir = dir;
    this.backupDir = path.join(dir, 'backups');
    this.cache = new Map();
    this.queues = new Map();
    this.lastBackup = new Map();
    this.ready = false;
    this.recovered = [];
  }

  file(name) { return path.join(this.dir, `${name}.json`); }
  isObj(name) { return OBJECT_COLLECTIONS.has(name); }

  newId(prefix) { return `${prefix}_${crypto.randomBytes(9).toString('hex')}`; }

  async init(seeds = {}) {
    await fsp.mkdir(this.backupDir, { recursive: true });
    for (const name of Object.keys(SCHEMAS)) {
      const fallback = seeds[name] ?? (this.isObj(name) ? {} : []);
      this.cache.set(name, await this._load(name, fallback));
    }
    this.ready = true;
    return this;
  }

  _check(name, data) {
    if (this.isObj(name)) return validate(SCHEMAS[name], data, name);
    if (!Array.isArray(data)) return [`${name} must be an array`];
    const ids = new Set();
    const errors = [];
    data.forEach((rec, i) => {
      validate(SCHEMAS[name], rec, `${name}[${i}]`).forEach((e) => errors.push(`${name}[${i}].${e}`));
      if (rec && rec.id !== undefined) { if (ids.has(rec.id)) errors.push(`${name}[${i}] duplicate id`); ids.add(rec.id); }
    });
    return errors;
  }

  async _readValid(file, name) {
    const data = JSON.parse(await fsp.readFile(file, 'utf8'));
    const errors = this._check(name, data);
    if (errors.length) throw new Error(`invalid ${name}: ${errors[0]}`);
    return data;
  }

  async _load(name, fallback) {
    const file = this.file(name);
    try {
      return await this._readValid(file, name);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // Corrupt or invalid: quarantine (never delete) then recover.
        const q = path.join(this.dir, `${name}.corrupt-${Date.now()}.json`);
        await fsp.rename(file, q).catch(() => {});
        const backups = (await fsp.readdir(this.backupDir).catch(() => []))
          .filter((f) => f.startsWith(`${name}-`)).sort().reverse();
        for (const b of backups) {
          try {
            const data = await this._readValid(path.join(this.backupDir, b), name);
            this.recovered.push({ name, from: b });
            await this._persist(name, data);
            return data;
          } catch { /* try next */ }
        }
        this.recovered.push({ name, from: 'seed' });
      }
      const data = structuredClone(fallback);
      const errors = this._check(name, data);
      if (errors.length) throw new Error(`seed for ${name} is invalid: ${errors[0]}`);
      await this._persist(name, data);
      return data;
    }
  }

  async _backup(name) {
    const now = Date.now();
    if (now - (this.lastBackup.get(name) || 0) < BACKUP_EVERY_MS) return;
    try {
      const stamp = new Date(now).toISOString().replace(/[-:T.Z]/g, '').slice(0, 17);
      await fsp.copyFile(this.file(name), path.join(this.backupDir, `${name}-${stamp}.json`));
      this.lastBackup.set(name, now);
      const all = (await fsp.readdir(this.backupDir)).filter((f) => f.startsWith(`${name}-`)).sort();
      for (const old of all.slice(0, Math.max(0, all.length - BACKUPS_KEPT))) await fsp.unlink(path.join(this.backupDir, old)).catch(() => {});
    } catch { /* no previous file yet */ }
  }

  async _persist(name, data) {
    await this._backup(name);
    const tmp = `${this.file(name)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    const fh = await fsp.open(tmp, 'w', 0o600);
    try {
      await fh.writeFile(JSON.stringify(data, null, 2));
      await fh.sync();
    } finally { await fh.close(); }
    try { await fsp.rename(tmp, this.file(name)); }
    catch (e) { await fsp.unlink(tmp).catch(() => {}); throw e; }
  }

  _assertName(name) { if (!SCHEMAS[name]) throw new Error(`unknown collection: ${name}`); }

  /** Snapshot copy; callers can never mutate the cache. */
  read(name) { this._assertName(name); return structuredClone(this.cache.get(name)); }

  /** Serialised read-modify-write. fn receives a clone, mutates it, may return a value.
   *  If fn throws or validation fails, nothing is written and the cache is unchanged. */
  mutate(name, fn) {
    this._assertName(name);
    const prev = this.queues.get(name) || Promise.resolve();
    const run = prev.catch(() => {}).then(async () => {
      const draft = structuredClone(this.cache.get(name));
      const result = await fn(draft);
      const errors = this._check(name, draft);
      if (errors.length) { const e = new Error(errors[0]); e.code = 'VALIDATION'; e.details = errors; throw e; }
      await this._persist(name, draft);
      this.cache.set(name, draft);
      return result;
    });
    this.queues.set(name, run);
    return run;
  }

  get(name, id) { return this.read(name).find((r) => r.id === id) || null; }

  insert(name, prefix, rec) {
    return this.mutate(name, (list) => {
      const now = new Date().toISOString();
      const row = { ...rec, id: rec.id || this.newId(prefix), createdAt: rec.createdAt || now, updatedAt: now };
      list.push(row);
      return row;
    });
  }

  update(name, id, patch) {
    return this.mutate(name, (list) => {
      const i = list.findIndex((r) => r.id === id);
      if (i < 0) { const e = new Error('not found'); e.code = 'NOT_FOUND'; throw e; }
      const { id: _ignore, createdAt: _c, ...safe } = patch;
      list[i] = { ...list[i], ...safe, updatedAt: new Date().toISOString() };
      return list[i];
    });
  }

  remove(name, id) {
    return this.mutate(name, (list) => {
      const i = list.findIndex((r) => r.id === id);
      if (i < 0) return false;
      list.splice(i, 1);
      return true;
    });
  }

  status() {
    return { ready: this.ready, collections: this.cache.size, recoveredOnStart: this.recovered.length };
  }
}

module.exports = { Store };
