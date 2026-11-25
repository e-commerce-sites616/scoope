'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const config = require('../config');
const { MIME } = require('../utils/http');

// URL prefix -> directory. Only whitelisted extensions are ever served,
// so HTML partials and server files can never be fetched as static files.
const MOUNTS = [
  ['/assets/', path.join(config.publicDir, 'assets')],
  ['/fonts/', path.join(config.publicDir, 'fonts')],
  ['/styles/', path.join(config.clientDir, 'styles')],
  ['/modules/', path.join(config.clientDir, 'modules')],
  ['/services/', path.join(config.clientDir, 'services')],
  ['/utils/', path.join(config.clientDir, 'utils')],
];
const ALLOWED = new Set(['.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.ico', '.woff2', '.woff', '.mp4', '.webm', '.txt', '.xml']);

/** Returns true if the request was handled. */
async function serveStatic(req, res, pathname) {
  const mount = MOUNTS.find(([prefix]) => pathname.startsWith(prefix));
  if (!mount) return false;

  let rel;
  try { rel = decodeURIComponent(pathname.slice(mount[0].length)); } catch { return false; }
  if (rel.includes('\0')) return false;

  const base = mount[1];
  const full = path.resolve(base, rel);
  if (!full.startsWith(base + path.sep)) return false;

  const ext = path.extname(full).toLowerCase();
  if (!ALLOWED.has(ext)) return false;

  let stat;
  try { stat = await fsp.stat(full); } catch { return false; }
  if (!stat.isFile()) return false;

  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Last-Modified': stat.mtime.toUTCString(),
    'Accept-Ranges': 'bytes',
    'Cache-Control': config.isProd && ext !== '.json' ? 'public, max-age=3600' : 'no-cache',
  };

  // Byte ranges: required for video playback in Safari and for seeking (scrubbing) everywhere.
  let start = 0, end = stat.size - 1, status = 200;
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (m[1] === '' && m[2] === '')) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); res.end(); return true; }
    if (m[1] === '') { start = Math.max(0, stat.size - Number(m[2])); }
    else { start = Number(m[1]); if (m[2] !== '') end = Math.min(Number(m[2]), end); }
    if (start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); res.end(); return true; }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') { res.end(); return true; }
  fs.createReadStream(full, { start, end }).on('error', () => res.destroy()).pipe(res);
  return true;
}

module.exports = { serveStatic };
