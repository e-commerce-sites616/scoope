'use strict';
const config = require('../config');
const { esc } = require('./pages');

function origin(req) {
  if (config.siteUrl) return config.siteUrl;
  const host = String(req.headers.host || '');
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return 'http://localhost';
  return `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${host}`;
}

// Safe to embed inside <script type="application/ld+json">.
const ld = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

function head({ title, description, path, base, type = 'website', jsonld }) {
  const url = `${base}${path}`;
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:type" content="${type}"><meta property="og:site_name" content="SCOOPÉ">`,
    `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    jsonld ? `<script type="application/ld+json">${ld(jsonld)}</script>` : '',
  ].join('\n  ');
}

module.exports = { origin, head, ld };
