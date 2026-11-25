import { readLines, writeLines, addLine } from './bag.js';
import { flavourColour } from './art.js';
import { api } from './api.js';

const money = (n) => '₦' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
const STEPS = [['base', 'Choose a base'], ['flavours', 'Choose your flavours'], ['scoops', 'How many scoops?'], ['toppings', 'Add toppings'], ['sauces', 'Choose sauces'], ['extras', 'Any extras?'], ['review', 'Review your sundae']];
const SAUCE = { chocolate: '#3A2620', caramel: '#B98A5E', strawberry: '#C0394B', berry: '#6E2C5C' };
const SPOTS = [[-30, -34], [12, -46], [42, -22], [-48, -6], [26, 4], [-8, -16], [58, -2], [-22, 22]];
const MAX_MSG = { toppings: 'toppings', sauces: 'sauces', extras: 'extras' };

function preview(s, cfg, prev) {
  const scoops = s.picks.flatMap((f) => Array(s.counts[f] || 0).fill(f));
  const top = s.base === 'waffle-cone' ? 312 : s.base === 'sundae-glass' ? 298 : 336;
  let g = '<ellipse cx="200" cy="452" rx="112" ry="11" fill="#000" opacity=".15"/>';
  if (s.base === 'waffle-cone') {
    g += '<path d="M140 312H260L200 450Z" fill="#D8BDA2"/>';
    for (const y of [338, 364, 390, 416]) { const w = 60 * (450 - y) / 138; g += `<path d="M${200 - w} ${y}H${200 + w}" stroke="#B98A5E" stroke-width="2.5"/>`; }
  } else if (s.base === 'sundae-glass') {
    g += '<path d="M193 350H207V440H193Z" fill="currentColor" fill-opacity=".3"/><ellipse cx="200" cy="444" rx="62" ry="9" fill="currentColor" fill-opacity=".25"/><path d="M104 300H296Q296 392 200 402Q104 392 104 300Z" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-opacity=".55" stroke-width="2"/>';
  } else g += '<path d="M120 336H280L258 440H142Z" fill="#F6F0E7" stroke="currentColor" stroke-opacity=".3" stroke-width="1.5"/><path d="M127 366H273L269 388H131Z" fill="#783D45"/>';
  if (s.extras.includes('brownie-bites')) g += '<rect x="86" y="416" width="26" height="24" fill="#4A2E26"/><rect x="296" y="420" width="22" height="20" fill="#4A2E26"/>';
  if (s.extras.includes('cookie-crumb')) g += '<circle cx="98" cy="446" r="5" fill="#C9A27A"/><circle cx="116" cy="450" r="4" fill="#C9A27A"/><circle cx="300" cy="448" r="5" fill="#C9A27A"/>';
  scoops.forEach((f, i) => { g += `<g class="${i >= prev ? 'pop' : ''}"><circle cx="200" cy="${top - 28 - i * 50}" r="62" fill="${flavourColour(f)}" stroke="currentColor" stroke-opacity=".3" stroke-width="1.5"/></g>`; });
  if (scoops.length) {
    const cy = top - 28 - (scoops.length - 1) * 50;
    s.sauces.forEach((id, n) => { const c = SAUCE[id] || '#3A2620'; g += `<path d="M${146 + n * 6} ${cy - 40}c24-18 84-18 108 0-4 24-10 36-18 36-6-16-14-16-18 6-6-16-16-16-20 0-6-14-16-12-22-2-4-6-8-18-10-40z" fill="${c}" opacity="${n ? '.8' : '.95'}"/>`; });
    s.toppings.forEach((id, n) => {
      for (let k = 0; k < 3; k++) {
        const [dx, dy] = SPOTS[(n * 3 + k) % SPOTS.length], x = 200 + dx, y = cy + dy;
        g += id === 'chocolate-chips' ? `<ellipse cx="${x}" cy="${y}" rx="4" ry="3" fill="#2A1A14"/>`
          : id === 'crushed-biscuits' ? `<rect x="${x}" y="${y}" width="9" height="6" fill="#C9A27A" transform="rotate(${k * 30} ${x} ${y})"/>`
          : id === 'sprinkles' ? `<rect x="${x}" y="${y}" width="9" height="3" rx="1.5" fill="${['#DCA1A0', '#839078', '#D8BDA2'][k]}" transform="rotate(${k * 50} ${x} ${y})"/>`
          : id === 'chopped-nuts' ? `<ellipse cx="${x}" cy="${y}" rx="5" ry="3.5" fill="#A9743F"/>`
          : id === 'fresh-strawberries' ? `<circle cx="${x}" cy="${y}" r="7" fill="#C0394B"/>`
          : k === 0 ? `<circle cx="200" cy="${cy - 62}" r="22" fill="#F6F0E7" stroke="currentColor" stroke-opacity=".3"/><circle cx="200" cy="${cy - 82}" r="9" fill="#A8505C"/>` : '';
      }
    });
  }
  return `<svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${g}</svg>`;
}

export async function initBuilder() {
  const root = document.querySelector('[data-builder]');
  if (!root) return;
  let cfg;
  try { cfg = await (await fetch('/api/v1/builder-config')).json(); } catch { cfg = null; }
  if (!cfg || !cfg.bases) { root.replaceChildren(el('p', 'empty__title', "The builder didn't load. Please refresh.")); return; }

  const s = { step: 0, base: null, picks: [], counts: {}, toppings: [], sauces: [], extras: [], qty: 1 };
  const editId = new URLSearchParams(location.search).get('edit');
  const editing = editId ? readLines().find((l) => l.id === editId && l.type === 'build') : null;
  if (editing) {
    const c = editing.config;
    Object.assign(s, { base: c.base, picks: c.scoops.map((x) => x.flavour), counts: Object.fromEntries(c.scoops.map((x) => [x.flavour, x.qty])), toppings: [...c.toppings], sauces: [...c.sauces], extras: [...c.extras], qty: editing.qty, step: 6 });
  }
  const find = (key, id) => cfg[key].find((o) => o.id === id);
  const scoopTotal = () => s.picks.reduce((n, f) => n + (s.counts[f] || 0), 0);
  const sum = (key) => s[key].reduce((n, id) => n + (find(key, id)?.price || 0), 0);
  const unit = () => (find('bases', s.base)?.price || 0) + scoopTotal() * cfg.scoopPrice + sum('toppings') + sum('sauces') + sum('extras');
  let prevScoops = 0;

  root.replaceChildren();
  const layout = el('div', 'builder__grid');
  const stage = el('div', 'builder__stage');
  const prev = el('div', 'art builder__preview'); prev.dataset.view = 'light'; prev.setAttribute('role', 'img');
  const price = el('p', 'builder__price'); price.setAttribute('aria-live', 'polite');
  stage.append(prev, price);
  const main = el('div', 'builder__main');
  const steps = el('ol', 'steps'); steps.setAttribute('aria-label', 'Progress');
  const panel = el('section', 'bpanel');
  const msg = el('p', 'builder__msg'); msg.setAttribute('role', 'status');
  const nav = el('div', 'builder__nav');
  const back = el('button', 'link', 'Back'); back.type = 'button';
  const next = el('button', 'btn', 'Next'); next.type = 'button';
  const navPrice = el('span', 'builder__navprice');
  nav.append(back, navPrice, next);
  main.append(steps, panel, msg, nav);
  layout.append(stage, main); root.append(layout);

  function tile(label, note, on, disabled, onClick, swatch) {
    const b = el('button', 'tile'); b.type = 'button'; b.setAttribute('aria-pressed', String(on)); b.disabled = disabled;
    if (swatch) { const d = el('i', 'tile__sw'); d.style.setProperty('background', swatch); b.append(d); }
    const t = el('span', 'tile__t'); t.append(el('b', '', label), el('small', '', note)); b.append(t);
    b.onclick = onClick; return b;
  }
  const toggle = (key, id) => {
    const i = s[key].indexOf(id);
    if (i >= 0) s[key].splice(i, 1);
    else if (s[key].length >= cfg[`max${key[0].toUpperCase()}${key.slice(1)}`]) { msg.textContent = `You can choose up to ${cfg[`max${key[0].toUpperCase()}${key.slice(1)}`]} ${MAX_MSG[key]}.`; return; }
    else s[key].push(id);
    msg.textContent = ''; draw();
  };

  function body(name) {
    const grid = el('div', 'tiles');
    if (name === 'base') for (const b of cfg.bases) grid.append(tile(b.label, b.price ? `+${money(b.price)}` : 'Included', s.base === b.id, false, () => { s.base = b.id; msg.textContent = ''; draw(); }));
    else if (name === 'flavours') {
      for (const f of cfg.flavours) {
        const on = s.picks.includes(f.slug);
        grid.append(tile(f.name, f.available ? f.notes.slice(0, 2).join(', ') : 'Sold out', on, !f.available && !on, () => {
          if (on) { s.picks = s.picks.filter((x) => x !== f.slug); delete s.counts[f.slug]; }
          else if (scoopTotal() >= cfg.maxScoops) { msg.textContent = `A sundae holds up to ${cfg.maxScoops} scoops.`; return; }
          else { s.picks.push(f.slug); s.counts[f.slug] = 1; }
          msg.textContent = ''; draw();
        }, flavourColour(f.slug)));
      }
    } else if (name === 'scoops') {
      const wrap = el('div', 'scoops');
      wrap.append(el('p', 'scoops__left', `${scoopTotal()} of ${cfg.maxScoops} scoops used`));
      for (const f of s.picks) {
        const row = el('div', 'scoops__row'); const nm = cfg.flavours.find((x) => x.slug === f).name;
        const q = el('div', 'qty qty--sm'); q.setAttribute('role', 'group'); q.setAttribute('aria-label', `Scoops of ${nm}`);
        const m = el('button', '', '−'); m.type = 'button'; m.setAttribute('aria-label', `Fewer ${nm}`); m.disabled = s.counts[f] <= 1; m.onclick = () => { s.counts[f]--; draw(); };
        const p = el('button', '', '+'); p.type = 'button'; p.setAttribute('aria-label', `More ${nm}`); p.disabled = scoopTotal() >= cfg.maxScoops; p.onclick = () => { s.counts[f]++; draw(); };
        q.append(m, el('output', '', String(s.counts[f])), p);
        row.append(el('span', 'scoops__name', nm), q, el('span', 'scoops__price', money(s.counts[f] * cfg.scoopPrice))); wrap.append(row);
      }
      return wrap;
    } else if (name === 'review') return review();
    else for (const o of cfg[name]) grid.append(tile(o.label, `+${money(o.price)}`, s[name].includes(o.id), false, () => toggle(name, o.id)));
    return grid;
  }

  function review() {
    const w = el('div', 'review'); const rows = el('dl', 'review__rows');
    const add = (k, v, p) => { const r = el('div', 'review__row'); r.append(el('dt', '', k), el('dd', '', v), el('dd', 'review__p', p)); rows.append(r); };
    const base = find('bases', s.base); add('Base', base.label, base.price ? money(base.price) : 'Included');
    for (const f of s.picks) add('Scoops', `${s.counts[f]}× ${cfg.flavours.find((x) => x.slug === f).name}`, money(s.counts[f] * cfg.scoopPrice));
    for (const k of ['toppings', 'sauces', 'extras']) for (const id of s[k]) add(k[0].toUpperCase() + k.slice(1, -1), find(k, id).label, money(find(k, id).price));
    w.append(rows);
    const q = el('div', 'review__qty'); q.append(el('span', '', 'Quantity'));
    const g = el('div', 'qty qty--sm'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', 'Quantity');
    const m = el('button', '', '−'); m.type = 'button'; m.setAttribute('aria-label', 'Decrease quantity'); m.disabled = s.qty <= 1; m.onclick = () => { s.qty--; draw(); };
    const p = el('button', '', '+'); p.type = 'button'; p.setAttribute('aria-label', 'Increase quantity'); p.disabled = s.qty >= 10; p.onclick = () => { s.qty++; draw(); };
    g.append(m, el('output', '', String(s.qty)), p); q.append(g); w.append(q);
    const tot = el('p', 'review__total'); tot.textContent = `Total ${money(unit() * s.qty)}`; w.append(tot);
    return w;
  }

  const valid = () => [() => !!s.base, () => s.picks.length >= 1, () => scoopTotal() >= 1 && scoopTotal() <= cfg.maxScoops, () => true, () => true, () => true, () => true];
  const config = () => ({ base: s.base, scoops: s.picks.map((f) => ({ flavour: f, qty: s.counts[f] })), toppings: [...s.toppings], sauces: [...s.sauces], extras: [...s.extras] });

  async function submit() {
    next.disabled = true; msg.textContent = 'Checking your sundae...';
    try {
      const q = (await api('POST', '/api/v1/cart/quote', { lines: [{ type: 'build', qty: s.qty, config: config() }] })).lines?.[0];
      if (!q || q.status !== 'ok') { msg.textContent = q?.reason === 'flavour_sold_out' ? `${q.flavour} just sold out. Please change your flavours.` : 'That combination is not available. Please review your choices.'; next.disabled = false; return; }
      if (editing) { writeLines(readLines().map((l) => (l.id === editing.id ? { ...l, config: q.config, qty: s.qty, seen: q.unit } : l))); location.href = '/cart'; return; }
      addLine({ type: 'build', config: q.config, qty: s.qty, seen: q.unit });
      msg.textContent = 'Added to your bag.'; next.disabled = false;
    } catch { msg.textContent = "Couldn't reach the server. Please try again."; next.disabled = false; }
  }

  function draw() {
    steps.replaceChildren(...STEPS.map(([, label], i) => {
      const li = el('li', i === s.step ? 'is-current' : i < s.step ? 'is-done' : '');
      const b = el('button', '', String(i + 1)); b.type = 'button'; b.setAttribute('aria-label', label); b.disabled = i > s.step && !valid().slice(0, i).every((f) => f());
      if (i === s.step) b.setAttribute('aria-current', 'step');
      b.onclick = () => { s.step = i; msg.textContent = ''; draw(); };
      li.append(b); return li;
    }));
    const h = el('h2', 'bpanel__title', `${s.step + 1}. ${STEPS[s.step][1]}`); h.tabIndex = -1;
    const hint = { base: 'Where your scoops will sit.', flavours: `Pick up to ${cfg.maxScoops}. You will set how many of each next.`, scoops: `Up to ${cfg.maxScoops} scoops in total, at ${money(cfg.scoopPrice)} each.`, toppings: `Optional. Up to ${cfg.maxToppings}.`, sauces: `Optional. Up to ${cfg.maxSauces}.`, extras: `Optional. Up to ${cfg.maxExtras}.`, review: 'Everything look right? The price is checked again when you add it.' }[STEPS[s.step][0]];
    panel.replaceChildren(h, el('p', 'bpanel__hint', hint), body(STEPS[s.step][0]));
    prev.innerHTML = preview(s, cfg, prevScoops); prevScoops = scoopTotal();
    prev.setAttribute('aria-label', `Your sundae: ${s.base ? find('bases', s.base).label.toLowerCase() : 'no base yet'} with ${scoopTotal()} scoops`);
    price.textContent = s.base || scoopTotal() ? `${money(unit())} each` : 'Start by choosing a base';
    navPrice.textContent = s.base || scoopTotal() ? money(unit() * (s.step === 6 ? s.qty : 1)) : '';
    back.hidden = s.step === 0;
    const last = s.step === 6;
    next.textContent = last ? (editing ? 'Save changes' : 'Add to bag') : 'Next';
    next.disabled = !valid()[s.step]();
    next.onclick = last ? submit : () => { s.step++; msg.textContent = ''; draw(); panel.querySelector('h2')?.focus({ preventScroll: true }); };
    if (editing) root.dataset.editing = 'true';
  }
  back.onclick = () => { s.step = Math.max(0, s.step - 1); msg.textContent = ''; draw(); };
  draw();
}
