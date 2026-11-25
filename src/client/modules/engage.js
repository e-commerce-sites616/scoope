import { api, me, el, errText, when } from './api.js';
import { addLine } from './bag.js';

// ---- Gift a Scoop
export function initGift() {
  const f = document.querySelector('[data-gift]'); if (!f) return;
  const msg = f.querySelector('[data-gift-msg]');
  f.onsubmit = (e) => {
    e.preventDefault();
    const pick = f.querySelector('input[name=gift]:checked'); const recipient = f.elements.recipient.value.trim(), message = f.elements.message.value.trim();
    if (!pick) { msg.textContent = 'Choose a gift first.'; msg.dataset.state = 'error'; return; }
    if (recipient.length < 2) { msg.textContent = "Please enter the recipient's name."; msg.dataset.state = 'error'; return; }
    try { localStorage.setItem('scoope.gift.v1', JSON.stringify({ recipient, message })); } catch { /* */ }
    const ok = addLine({ type: 'product', productId: pick.value, slug: pick.dataset.slug, qty: 1 });
    msg.textContent = ok ? `Added. We will mark the order as a gift for ${recipient} at checkout.` : 'Your browser blocked saving the bag.'; msg.dataset.state = ok ? 'ok' : 'error';
  };
}

// ---- Reviews
const stars = (n) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
export async function initReviews() {
  const sec = document.querySelector('[data-reviews]'); if (!sec) return;
  const body = sec.querySelector('[data-reviews-body]'); const slug = sec.dataset.slug;
  async function draw(data) {
    data ||= await api('GET', `/api/v1/products/${encodeURIComponent(slug)}/reviews`);
    const info = await me(); const parts = [];
    const sumry = el('p', 'rv__sum'); sumry.append(el('span', 'rv__stars', data.count ? stars(data.average) : '☆☆☆☆☆')); sumry.append(document.createTextNode(data.count ? ` ${data.average} out of 5 · ${data.count} review${data.count === 1 ? '' : 's'}` : ' No reviews yet. Be the first.')); sumry.firstChild.setAttribute('aria-hidden', 'true'); parts.push(sumry);
    const ul = el('ul', 'rv__list');
    for (const r of data.items) { const li = el('li', 'rv__item'); const h = el('p', 'rv__head'); const s = el('span', 'rv__stars', stars(r.rating)); s.setAttribute('role', 'img'); s.setAttribute('aria-label', `${r.rating} out of 5`); h.append(s, el('b', '', ` ${r.title || ''}`)); li.append(h, el('p', '', r.body), el('p', 'rv__by', `${r.author}${r.verified ? ' · Verified purchase' : ''} · ${when(r.createdAt)}`)); ul.append(li); }
    parts.push(ul);
    if (!info.user) { const p = el('p', 'rv__cta'); const a = el('a', 'link', 'Sign in'); a.href = `/account?next=${encodeURIComponent(location.pathname)}`; p.append(a, document.createTextNode(' to write a review.')); parts.push(p); }
    else {
      const f = el('form', 'rv__form'); f.noValidate = true; const m = el('p', 'form__msg'); m.setAttribute('role', 'status');
      const fs = el('fieldset', 'rv__rate'); fs.append(el('legend', '', 'Your rating'));
      for (let i = 1; i <= 5; i++) { const l = el('label', ''); const r = document.createElement('input'); r.type = 'radio'; r.name = 'rating'; r.value = String(i); if (i === 5) r.checked = true; l.append(r, el('span', '', `${i} star${i > 1 ? 's' : ''}`)); fs.append(l); }
      const t = el('label', 'field'); t.append(el('span', 'field__label', 'Title (optional)')); const ti = document.createElement('input'); ti.name = 'title'; ti.maxLength = 80; t.append(ti);
      const b = el('label', 'field'); b.append(el('span', 'field__label', 'Your review')); const ta = document.createElement('textarea'); ta.name = 'body'; ta.rows = 4; ta.maxLength = 1000; b.append(ta);
      const btn = el('button', 'btn', 'Post review'); btn.type = 'submit'; f.append(fs, t, b, btn, m);
      f.onsubmit = async (e) => { e.preventDefault(); btn.disabled = true; try { draw(await api('POST', `/api/v1/products/${encodeURIComponent(slug)}/reviews`, { rating: Number(f.elements.rating.value), title: ti.value, body: ta.value })); } catch (err) { m.textContent = errText(err); m.dataset.state = 'error'; btn.disabled = false; } };
      parts.push(f);
    }
    body.replaceChildren(...parts);
  }
  try { await draw(); } catch { body.replaceChildren(el('p', 'form__msg', 'Reviews could not be loaded.')); }
}

// ---- Newsletter, contact form, unsubscribe page
export function initForms() {
  const n = document.querySelector('[data-newsletter]');
  if (n) {
    const msg = n.querySelector('[data-news-msg]');
    n.onsubmit = async (e) => {
      e.preventDefault(); msg.textContent = ''; msg.replaceChildren();
      try {
        const r = await api('POST', '/api/v1/newsletter', { email: n.elements.email.value, consent: n.elements.consent.checked });
        if (r.status === 'already') { msg.textContent = 'You are already subscribed.'; return; }
        msg.textContent = 'You are subscribed. To unsubscribe later, keep this link: '; const a = el('a', 'link', 'unsubscribe'); a.href = r.unsubscribeUrl; msg.append(a); n.reset();
      } catch (err) { msg.textContent = errText(err); }
    };
  }
  const c = document.querySelector('[data-contact]');
  if (c) {
    const msg = c.querySelector('[data-contact-msg]');
    c.onsubmit = async (e) => { e.preventDefault(); try { await api('POST', '/api/v1/contact', Object.fromEntries(new FormData(c))); msg.textContent = 'Message sent. Thank you.'; msg.dataset.state = 'ok'; c.reset(); } catch (err) { msg.textContent = errText(err); msg.dataset.state = 'error'; } };
  }
  if (document.body.dataset.page === 'unsubscribe') {
    const root = document.querySelector('[data-app]'); const token = location.pathname.split('/').pop();
    const p = el('p', '', 'Stop receiving SCOOPÉ emails?'); const b = el('button', 'btn', 'Unsubscribe'); b.type = 'button'; const m = el('p', 'form__msg');
    b.onclick = async () => { try { await api('POST', '/api/v1/newsletter/unsubscribe', { token }); root.replaceChildren(el('p', 'cempty__title', 'You are unsubscribed.')); } catch { m.textContent = 'That link is not valid or was already used.'; m.dataset.state = 'error'; } };
    root.replaceChildren(p, b, m);
  }
}
