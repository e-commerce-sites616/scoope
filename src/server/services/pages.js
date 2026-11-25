'use strict';
const fsp = require('node:fs/promises');
const path = require('node:path');
const config = require('../config');

const cache = new Map();

async function readFile(rel) {
  if (config.isProd && cache.has(rel)) return cache.get(rel);
  const text = await fsp.readFile(path.join(config.clientDir, rel), 'utf8');
  if (config.isProd) cache.set(rel, text);
  return text;
}

async function expand(html, depth = 0) {
  if (depth > 3) return html;
  const names = [...new Set([...html.matchAll(/\{\{>([a-z-]+)\}\}/g)].map((m) => m[1]))];
  for (const name of names) {
    const partial = await expand(await readFile(`components/${name}.html`), depth + 1);
    html = html.split(`{{>${name}}}`).join(partial);
  }
  return html;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Render a page template with partial includes and HTML-escaped {{var}} values. */
async function renderPage(name, vars = {}) {
  const html = await expand(await readFile(`pages/${name}.html`));
  const all = { siteUrl: config.siteUrl, ...vars };
  // {{{raw}}} is for server-built, already-escaped markup only; {{var}} is always escaped.
  return html
    .replace(/\{\{\{([a-zA-Z]+)\}\}\}/g, (_, k) => String(all[k] ?? ''))
    .replace(/\{\{([a-zA-Z]+)\}\}/g, (_, k) => esc(all[k] ?? ''));
}

module.exports = { renderPage, esc };
