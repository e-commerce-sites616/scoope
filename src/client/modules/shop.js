import { hydrateArt } from './art.js';
import { initImages } from './images.js';

const money = (n) => '₦' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export function initShop() {
  const form = document.querySelector('[data-filters]');
  const grid = document.querySelector('[data-grid]');
  if (!form || !grid) return;
  const count = document.querySelector('[data-count]');
  const empty = document.querySelector('[data-no-results]');
  const error = document.querySelector('[data-error]');
  const tabs = form.querySelector('[data-categories]');
  const isSearch = document.body.dataset.page === 'search';
  const state = { q: '', category: '', minPrice: '', maxPrice: '', sort: 'popular', available: '' };

  const fromUrl = () => { const sp = new URLSearchParams(location.search); for (const k of Object.keys(state)) state[k] = sp.get(k) || (k === 'sort' ? 'popular' : ''); };
  const toForm = () => { for (const k of ['q', 'minPrice', 'maxPrice', 'sort']) form.elements[k].value = state[k]; form.elements.available.checked = state.available === 'true'; };
  const toUrl = () => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(state)) if (v && !(k === 'sort' && v === 'popular')) sp.set(k, v);
    history.replaceState(null, '', location.pathname + (sp.size ? `?${sp}` : ''));
  };

  function card(p, i) {
    const a = el('a', `card${i % 7 === 0 ? ' card--wide' : ''}`); a.href = `/product/${p.slug}`;
    const art = el('div', 'art'); art.dataset.art = ''; art.dataset.slug = p.slug; art.dataset.cat = p.category; art.dataset.view = 'light';
    art.setAttribute('role', 'img'); art.setAttribute('aria-label', p.images[0]?.alt || p.name);
    const img = el('img'); img.dataset.asset = p.images[0]?.assetId || ''; img.alt = ''; img.width = 800; img.height = 1000; img.loading = 'lazy'; img.decoding = 'async';
    art.append(img);
    const body = el('div', 'card__body');
    const price = el('p', 'card__price', `${p.variants.length || p.sizes.length > 1 ? 'From ' : ''}${money(p.price)} `);
    const tag = !p.available ? ['tag tag--out', 'Sold out'] : p.lowStock ? ['tag tag--low', 'Few left'] : p.bestseller ? ['tag', 'Bestseller'] : null;
    if (tag) price.append(el('span', tag[0], tag[1]));
    body.append(el('h3', '', p.name), el('p', 'card__notes', p.flavourNotes.slice(0, 3).join(', ')), price);
    a.append(art, body);
    return a;
  }

  let seq = 0;
  async function load() {
    const mine = ++seq;
    grid.setAttribute('aria-busy', 'true'); grid.classList.add('is-loading'); error.hidden = true;
    const sp = new URLSearchParams({ limit: '60' });
    for (const [k, v] of Object.entries(state)) if (v) sp.set(k, v);
    try {
      const res = await fetch(`/api/v1/products?${sp}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (mine !== seq) return;
      grid.replaceChildren(...data.items.map(card));
      hydrateArt(grid); initImages(grid);
      empty.hidden = data.total !== 0; grid.hidden = data.total === 0;
      count.textContent = data.total === 0 ? '' : `${data.total} ${data.total === 1 ? 'product' : 'products'}`;
    } catch {
      if (mine !== seq) return;
      grid.replaceChildren(); grid.hidden = true; empty.hidden = true; error.hidden = false; count.textContent = '';
    } finally {
      if (mine === seq) { grid.setAttribute('aria-busy', 'false'); grid.classList.remove('is-loading'); }
    }
  }
  const apply = () => { toUrl(); markTabs(); load(); };

  function markTabs() { tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.slug === state.category))); }
  async function buildTabs() {
    let items = [];
    try { items = (await (await fetch('/api/v1/categories')).json()).items; } catch { /* tabs are optional */ }
    for (const [slug, name] of [['', 'All'], ...items.map((c) => [c.slug, c.name])]) {
      const b = el('button', 'tab', name); b.type = 'button'; b.dataset.slug = slug;
      b.addEventListener('click', () => { state.category = slug; apply(); });
      tabs.append(b);
    }
    markTabs();
  }

  let t;
  form.elements.q.addEventListener('input', (e) => { state.q = e.target.value.trim(); clearTimeout(t); t = setTimeout(apply, 250); });
  for (const k of ['minPrice', 'maxPrice', 'sort']) form.elements[k].addEventListener('change', (e) => { state[k] = e.target.value; apply(); });
  form.elements.available.addEventListener('change', (e) => { state.available = e.target.checked ? 'true' : ''; apply(); });
  form.addEventListener('submit', (e) => e.preventDefault());
  document.querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', () => { Object.assign(state, { q: '', category: '', minPrice: '', maxPrice: '', sort: 'popular', available: '' }); toForm(); apply(); }));
  document.querySelector('[data-retry]')?.addEventListener('click', load);

  fromUrl(); toForm(); buildTabs(); load();
  if (isSearch) form.elements.q.focus({ preventScroll: true });
}
