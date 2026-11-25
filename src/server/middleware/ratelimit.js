'use strict';
// In-memory fixed-window limiter. Per-process only (the app runs a single instance).
const hits = new Map();
function hit(key, windowMs, max) {
  const now = Date.now();
  let h = hits.get(key);
  if (!h || h.reset <= now) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); }
  h.n += 1;
  return { ok: h.n <= max, retryAfter: Math.ceil((h.reset - now) / 1000) };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset <= now) hits.delete(k); }, 60_000).unref();
const clear = () => hits.clear();

function clientIp(req) {
  if (process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production') {
    const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (/^[0-9a-f:.]{3,45}$/i.test(xf)) return xf;
  }
  return req.socket.remoteAddress || 'unknown';
}
module.exports = { hit, clear, clientIp };
