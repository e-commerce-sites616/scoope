import { api, me, resetMe, el, money, when, field, msgBox, errText } from './api.js';
import { initImages } from './images.js';

async function zonesOptions(sel, current) {
  const z = (await (await fetch('/api/v1/delivery-zones')).json()).items;
  sel.append(new Option('Choose your area', ''));
  for (const zone of z) { const g = document.createElement('optgroup'); g.label = `${zone.name} (${money(zone.fee)} delivery)`; zone.areas.forEach((a) => g.append(new Option(a, a))); sel.append(g); }
  if (current) sel.value = current;
}

const ICON = {
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-11.2A7 7 0 005 9.8C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/></svg>',
  box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l8-4 8 4v8l-8 4-8-4V8z"/><path d="M4 8l8 4 8-4M12 12v8"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeoff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.7A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 01-3.2 3.9M6.4 7.4A15.6 15.6 0 002.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-.9"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></svg>',
};
const safeNext = () => { const n = new URLSearchParams(location.search).get('next') || ''; return /^\/(?!\/)[A-Za-z0-9\-_/.?=&%#]*$/.test(n) && !n.startsWith('/account') ? n : ''; };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function strength(pw) {
  if (!pw) return { level: 0, label: '' };
  let n = 0; if (pw.length >= 8) n++; if (pw.length >= 12) n++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw)) n++; if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 16) n++;
  if (pw.length < 8) return { level: 1, label: 'Too short' };
  return { level: Math.max(1, n), label: ['', 'Weak', 'Okay', 'Good', 'Strong'][Math.max(1, n)] };
}

// Signed-out view: brand panel + one focused card with a Sign in / Create account switch.
function authForms(root, done) {
  document.querySelector('main')?.classList.add('is-auth');
  let mode = location.hash === '#register' ? 'register' : 'login';
  const next = safeNext();

  const panel = el('aside', 'authpanel');
  const copy = el('div', 'authpanel__copy');
  const h1 = el('h1', 'authpanel__title'); const lead = el('p', 'authpanel__lead');
  const perks = el('ul', 'perks');
  [['star', 'Earn a point for every ₦100', 'Then trade 100 points for ₦500 off.'], ['pin', 'Save your delivery addresses', 'Checkout in two taps next time.'], ['box', 'Follow every order', 'From payment to your door, all in one place.']].forEach(([i, t, d]) => {
    const li = el('li', 'perk'); const ic = el('span', 'perk__ic'); ic.innerHTML = ICON[i]; const tx = el('span', 'perk__tx'); tx.append(el('b', '', t), el('small', '', d)); li.append(ic, tx); perks.append(li);
  });
  copy.append(el('p', 'eyebrow', 'SCOOPÉ account'), h1, lead, perks);
  const arch = el('div', 'authpanel__arch'); const img = el('img'); img.dataset.asset = 'hero-main'; img.alt = ''; img.width = 800; img.height = 1000; img.decoding = 'async'; arch.append(img);
  panel.append(copy, arch);

  const card = el('section', 'authcard'); card.setAttribute('aria-label', 'Sign in or create an account');
  const seg = el('div', 'seg'); seg.setAttribute('role', 'tablist');
  const tabs = {};
  for (const [k, l] of [['login', 'Sign in'], ['register', 'Create account']]) { const b = el('button', 'seg__btn', l); b.type = 'button'; b.setAttribute('role', 'tab'); b.id = `tab-${k}`; b.setAttribute('aria-controls', 'authform'); b.onclick = () => set(k, true); tabs[k] = b; seg.append(b); }
  seg.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); set(mode === 'login' ? 'register' : 'login', true); tabs[mode].focus(); } });
  const formWrap = el('div', 'authcard__form'); formWrap.id = 'authform'; formWrap.setAttribute('role', 'tabpanel');
  card.append(seg, formWrap);
  root.replaceChildren(el('div', 'authshell'));
  root.firstChild.append(panel, card);
  initImages(root);

  function input(label, name, o = {}) {
    const wrap = el('div', 'afield'); const id = `a-${name}`; const l = el('label', 'afield__label', label); l.htmlFor = id;
    const row = el('div', 'afield__row'); const i = document.createElement('input'); i.id = id; i.name = name; i.type = o.type || 'text';
    Object.entries({ autocomplete: o.ac, maxlength: o.max, inputmode: o.mode, spellcheck: 'false', autocapitalize: o.cap || 'off' }).forEach(([k, v]) => v && i.setAttribute(k, v));
    const err = el('p', 'afield__err'); err.id = `${id}-err`; i.setAttribute('aria-describedby', err.id);
    row.append(i);
    if (o.type === 'password') {
      const t = el('button', 'afield__eye'); t.type = 'button'; t.innerHTML = ICON.eye; t.setAttribute('aria-label', 'Show password'); t.setAttribute('aria-pressed', 'false');
      t.onclick = () => { const show = i.type === 'password'; i.type = show ? 'text' : 'password'; t.innerHTML = show ? ICON.eyeoff : ICON.eye; t.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); t.setAttribute('aria-pressed', String(show)); };
      row.append(t);
    }
    wrap.append(l, row, err);
    const fail = (m) => { err.textContent = m; i.setAttribute('aria-invalid', m ? 'true' : 'false'); wrap.classList.toggle('has-err', Boolean(m)); return !m; };
    return { wrap, i, fail };
  }

  function set(m, focus) {
    mode = m; history.replaceState(null, '', `${location.pathname}${location.search}${m === 'register' ? '#register' : ''}`);
    for (const [k, b] of Object.entries(tabs)) { b.setAttribute('aria-selected', String(k === m)); b.tabIndex = k === m ? 0 : -1; }
    formWrap.setAttribute('aria-labelledby', `tab-${m}`);
    h1.textContent = m === 'login' ? 'Welcome back.' : 'A little moment, remembered.';
    lead.textContent = m === 'login' ? 'Sign in to see your orders, points and saved addresses.' : 'Create an account in under a minute. Points, addresses and order history come with it.';
    const f = el('form', 'aform'); f.noValidate = true;
    const alert = el('div', 'aform__alert'); alert.setAttribute('role', 'alert');
    const name = m === 'register' ? input('Your name', 'name', { ac: 'name', max: 80, cap: 'words' }) : null;
    const email = input('Email address', 'email', { type: 'email', ac: m === 'login' ? 'username' : 'email', max: 254, mode: 'email' });
    const pw = input(m === 'login' ? 'Password' : 'Create a password', 'password', { type: 'password', ac: m === 'login' ? 'current-password' : 'new-password', max: 128 });
    const sub = el('button', 'btn aform__go', m === 'login' ? 'Sign in' : 'Create account'); sub.type = 'submit';
    f.append(alert); if (name) f.append(name.wrap); f.append(email.wrap, pw.wrap);
    let meter;
    if (m === 'register') {
      meter = el('div', 'meter'); meter.setAttribute('aria-live', 'polite'); const bars = el('div', 'meter__bars'); for (let i = 0; i < 4; i++) bars.append(el('i')); const lab = el('span', 'meter__lab'); meter.append(bars, lab); meter.dataset.level = '0';
      pw.i.addEventListener('input', () => { const s = strength(pw.i.value); meter.dataset.level = String(s.level); lab.textContent = s.label; });
      f.append(meter, el('p', 'aform__hint', 'Use at least 8 characters. A short phrase works well.'));
    }
    f.append(sub);
    const alt = el('p', 'aform__alt'); const sw = el('button', 'link', m === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'); sw.type = 'button'; sw.onclick = () => set(m === 'login' ? 'register' : 'login', true); alt.append(sw);
    const note = el('p', 'aform__note', 'Demonstration store. We never send email, so password reset by email is not available. Prefer not to sign up? '); const g = el('a', 'link', 'Continue as a guest'); g.href = '/shop'; note.append(g, document.createTextNode('.'));
    f.append(alt, note);

    const checks = () => {
      let ok = true;
      if (name) ok = name.fail(name.i.value.trim().length < 1 ? 'Please enter your name.' : '') && ok;
      ok = email.fail(!EMAIL_RE.test(email.i.value.trim()) ? 'Enter a valid email address, like ada@example.com.' : '') && ok;
      ok = pw.fail(m === 'login' ? (pw.i.value ? '' : 'Enter your password.') : (pw.i.value.length < 8 ? 'Use at least 8 characters.' : '')) && ok;
      return ok;
    };
    for (const fld of [name, email, pw]) if (fld) fld.i.addEventListener('blur', () => { if (fld.i.value || fld.wrap.classList.contains('has-err')) checks(); });
    for (const fld of [name, email, pw]) if (fld) fld.i.addEventListener('input', () => { if (fld.wrap.classList.contains('has-err')) fld.fail(''); alert.textContent = ''; });
    f.onsubmit = async (e) => {
      e.preventDefault(); alert.textContent = '';
      if (!checks()) { f.querySelector('[aria-invalid="true"]')?.focus(); return; }
      sub.disabled = true; sub.classList.add('is-busy'); sub.textContent = m === 'login' ? 'Signing in' : 'Creating your account';
      try {
        await api('POST', `/api/v1/auth/${m}`, { email: email.i.value.trim(), password: pw.i.value, ...(name ? { name: name.i.value.trim() } : {}) });
        resetMe(); document.querySelector('main')?.classList.remove('is-auth');
        if (next) { location.href = next; return; }
        done();
      } catch (err) {
        alert.textContent = errText(err);
        sub.disabled = false; sub.classList.remove('is-busy'); sub.textContent = m === 'login' ? 'Sign in' : 'Create account';
        if (err.code === 'email_taken') email.fail('That email already has an account.');
        pw.i.focus(); if (m === 'login') pw.i.select?.();
      }
    };
    formWrap.replaceChildren(f);
    if (focus) (name || email).i.focus();
  }
  set(mode, false);
}

async function dashboard(root, info) {
  const u = info.user; let tab = location.hash.replace('#', '') || 'orders';
  const head = el('div', 'acct__head'); head.append(el('p', 'acct__hello', `Hello, ${u.name.split(' ')[0]}.`), el('p', 'acct__pts', `${info.points} reward points`));
  const nav = el('div', 'tabs'); nav.setAttribute('role', 'group');
  const body = el('div', 'acct__body');
  const TABS = [['orders', 'Orders'], ['rewards', 'Rewards'], ['addresses', 'Addresses'], ['profile', 'Profile']];
  const out = el('button', 'link acct__out', 'Sign out'); out.type = 'button';
  out.onclick = async () => { await api('POST', '/api/v1/auth/logout', {}); resetMe(); location.href = '/account'; };
  head.append(out);

  async function show(t) {
    tab = t; history.replaceState(null, '', `#${t}`);
    nav.replaceChildren(...TABS.map(([k, l]) => { const b = el('button', 'tab', l); b.type = 'button'; b.setAttribute('aria-pressed', String(k === t)); b.onclick = () => show(k); return b; }));
    body.replaceChildren(el('p', 'bagpage__loading', 'Loading...'));
    const data = await api('GET', '/api/v1/account');
    if (t === 'orders') {
      const { items } = await api('GET', '/api/v1/account/orders');
      if (!items.length) { const e = el('div', 'cempty'); e.append(el('p', 'cempty__title', 'No orders yet.'), el('p', '', 'Your first order will show up here.')); const a = el('a', 'btn', 'Browse the flavours'); a.href = '/shop'; e.append(a); return body.replaceChildren(e); }
      const ul = el('ul', 'olist');
      for (const o of items) { const li = el('li', 'olist__row'); const a = el('a', 'olist__ref', o.reference); a.href = `/track/${o.key}`; li.append(a, el('span', 'olist__date', when(o.createdAt)), el('span', `chip chip--${o.status}`, o.statusLabel), el('span', 'olist__total', money(o.total))); ul.append(li); }
      body.replaceChildren(ul);
    } else if (t === 'rewards') {
      const r = data.rewards; const box = el('div', 'rewards');
      box.append(el('p', 'rewards__bal', String(r.balance)), el('p', 'rewards__lbl', 'points'), el('p', 'rewards__rule', `${r.rules.earn}. ${r.rules.redeem}.`));
      const ul = el('ul', 'olist'); if (!r.history.length) ul.append(el('li', 'olist__row', 'No activity yet. Points are earned when an order is paid.'));
      for (const h of r.history) { const li = el('li', 'olist__row'); li.append(el('span', '', h.note || h.type), el('span', 'olist__date', when(h.createdAt)), el('span', `olist__total${h.points < 0 ? ' neg' : ''}`, `${h.points > 0 ? '+' : ''}${h.points}`)); ul.append(li); }
      body.replaceChildren(box, ul);
    } else if (t === 'addresses') {
      const ul = el('ul', 'olist'); if (!data.addresses.length) ul.append(el('li', 'olist__row', 'No saved addresses yet.'));
      for (const a of data.addresses) { const li = el('li', 'olist__row'); const rm = el('button', 'link', 'Remove'); rm.type = 'button'; rm.onclick = async () => { await api('DELETE', `/api/v1/account/addresses/${a.id}`); show('addresses'); }; li.append(el('b', '', a.label), el('span', '', `${a.line1}, ${a.area}`), rm); ul.append(li); }
      const f = el('form', 'authform'); f.noValidate = true; const m = msgBox();
      const sel = document.createElement('select'); sel.name = 'area'; await zonesOptions(sel); const sl = el('label', 'field'); sl.append(el('span', 'field__label', 'Area'), sel);
      f.append(el('h2', '', 'Add an address'), field('Label', 'label', { value: 'Home', maxlength: 30 }), field('Street address', 'line1', { maxlength: 160, required: '' }), sl);
      const b = el('button', 'btn', 'Save address'); b.type = 'submit'; f.append(b, m);
      f.onsubmit = async (e) => { e.preventDefault(); try { await api('POST', '/api/v1/account/addresses', Object.fromEntries(new FormData(f))); show('addresses'); } catch (err) { m.textContent = errText(err); m.dataset.state = 'error'; } };
      body.replaceChildren(ul, f);
    } else {
      const pf = el('form', 'authform'); pf.noValidate = true; const pm = msgBox();
      pf.append(el('h2', '', 'Your details'), field('Name', 'name', { value: u.name, maxlength: 80 }), field('Phone', 'phone', { value: data.user.phone || '', maxlength: 20, type: 'tel' }));
      const pb = el('button', 'btn', 'Save'); pb.type = 'submit'; pf.append(pb, pm);
      pf.onsubmit = async (e) => { e.preventDefault(); try { await api('PATCH', '/api/v1/account/profile', Object.fromEntries(new FormData(pf))); pm.textContent = 'Saved.'; pm.dataset.state = 'ok'; } catch (err) { pm.textContent = errText(err); pm.dataset.state = 'error'; } };
      const wf = el('form', 'authform'); wf.noValidate = true; const wm = msgBox();
      wf.append(el('h2', '', 'Change password'), field('Current password', 'current', { type: 'password', autocomplete: 'current-password' }), field('New password (8+ characters)', 'next', { type: 'password', autocomplete: 'new-password' }));
      const wb = el('button', 'btn', 'Change password'); wb.type = 'submit'; wf.append(wb, wm);
      wf.onsubmit = async (e) => { e.preventDefault(); try { await api('POST', '/api/v1/account/password', Object.fromEntries(new FormData(wf))); wm.textContent = 'Password changed. Other devices were signed out.'; wm.dataset.state = 'ok'; wf.reset(); } catch (err) { wm.textContent = errText(err); wm.dataset.state = 'error'; } };
      const wrap = el('div', 'auth'); wrap.append(pf, wf); body.replaceChildren(wrap);
    }
  }
  root.replaceChildren(head, nav, body);
  window.addEventListener('hashchange', () => { const t = location.hash.replace('#', ''); if (TABS.some(([k]) => k === t) && t !== tab) show(t); });
  show(TABS.some(([k]) => k === tab) ? tab : 'orders');
}

export async function initAccount() {
  if (document.body.dataset.page !== 'account') return;
  const root = document.querySelector('[data-app]');
  const render = async () => { const info = await me(true); info.user ? dashboard(root, info) : authForms(root, render); };
  render();
}
