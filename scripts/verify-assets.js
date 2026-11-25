'use strict';
// Checks every manifest URL really returns an image/video. Run on a machine with internet access:
//   npm run verify:assets            (report only)
//   npm run verify:assets -- --write (set verified flags in the manifest)
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../public/assets/manifest/assets.json');
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
const write = process.argv.includes('--write');

async function check(url, kind) {
  if (url.startsWith('/')) {   // local file under public/
    const f = path.join(__dirname, '../public', path.normalize(url).replace(/^(\.\.[\\/])+/, ''));
    return fs.existsSync(f) && fs.statSync(f).size > 0 ? { ok: true, detail: `local ${(fs.statSync(f).size / 1024).toFixed(0)} KB` } : { ok: false, detail: 'file missing' };
  }
  try {
    const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(15000) });
    const type = res.headers.get('content-type') || '';
    return { ok: res.ok && type.startsWith(kind + '/'), detail: `${res.status} ${type}` };
  } catch (e) { return { ok: false, detail: e.message }; }
}

(async () => {
  let bad = 0;
  for (const [list, kind] of [['images', 'image'], ['videos', 'video']]) {
    for (const a of manifest[list]) {
      if (!a.url) { console.log(`-    ${a.id}: no URL yet`); a.verified = false; continue; }
      const r = await check(a.url, kind);
      a.verified = r.ok; if (r.ok) a.status = 'verified'; else bad++;
      for (const k of ['mobileUrl', 'poster']) if (a[k] && !(await check(a[k], k === 'poster' ? 'image' : kind)).ok) { a.verified = false; bad++; console.log(`FAIL ${a.id}: ${k} missing`); }
      console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${a.id}: ${r.detail}`);
    }
  }
  if (write) { fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n'); console.log('Manifest updated.'); }
  process.exit(bad ? 1 : 0);
})();
