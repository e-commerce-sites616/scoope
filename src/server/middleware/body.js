'use strict';
// JSON body reader with a hard size cap. Throws { status, code } errors for the router to send.
const MAX = 32 * 1024;
const fail = (status, code) => Object.assign(new Error(code), { status, code });

function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;                       // same-origin fetches from older browsers, curl, tests
  let host;
  try { host = new URL(origin).host; } catch { throw fail(403, 'bad_origin'); }
  if (host !== req.headers.host) throw fail(403, 'bad_origin');
}

async function readJson(req, limit = MAX) {
  checkOrigin(req);
  if (!/^application\/json(\s*;|$)/i.test(req.headers['content-type'] || '')) throw fail(415, 'json_required');
  const declared = Number(req.headers['content-length']);
  if (declared > limit) throw fail(413, 'body_too_large');
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) { req.destroy(); throw fail(413, 'body_too_large'); }
    chunks.push(c);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw 0;
    return v;
  } catch { throw fail(400, 'invalid_json'); }
}

module.exports = { readJson, checkOrigin };
