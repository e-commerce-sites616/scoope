// Fetch wrapper: JSON in/out, attaches the session's CSRF token, throws rich errors.
let csrf = null, meP = null;
export const money = (n) => '₦' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
export const me = (force = false) => (meP = !force && meP ? meP : fetch('/api/v1/auth/me', { credentials: 'same-origin' }).then((r) => r.json()).then((j) => { csrf = j.csrf; return j; }).catch(() => ({ user: null, csrf: null, points: 0 })));
export const resetMe = () => { meP = null; csrf = null; };

export async function api(method, path, body) {
  await me();
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const res = await fetch(path, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  if (!res.ok) { const e = new Error(json?.error || 'error'); Object.assign(e, { status: res.status, code: json?.error, details: json?.details || [], json }); throw e; }
  return json;
}
const FRIENDLY = { invalid_credentials: 'That email and password do not match.', email_taken: 'An account with that email already exists. Try signing in.', rate_limited: 'Too many attempts. Please wait a few minutes and try again.', login_required: 'Please sign in first.', csrf: 'Your session changed. Please reload the page.', insufficient_stock: 'Sorry, someone just took the last of an item. Please review your bag.', area_not_served: 'We do not deliver to that area.', wrong_password: 'That is not your current password.', already_reviewed: 'You have already reviewed this product.', consent_required: 'Please tick the box to agree to receive emails.', order_expired: 'This order has expired. Please place it again.', not_cancellable: 'This order can no longer be cancelled.' };
export const errText = (e) => (e.details && e.details.length ? e.details.join(' ') : FRIENDLY[e.code] || (e.status >= 500 ? 'Something went wrong on our side. Please try again.' : 'Something went wrong. Please check your details and try again.'));
export const when = (iso) => new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
export const field = (label, name, attrs = {}, tag = 'input') => {
  const l = el('label', 'field'); l.append(el('span', 'field__label', label));
  const i = document.createElement(tag); i.name = name; Object.entries(attrs).forEach(([k, v]) => { if (k === 'value') i.value = v; else i.setAttribute(k, v); });
  l.append(i); return l;
};
export const msgBox = () => { const m = el('p', 'form__msg'); m.setAttribute('role', 'status'); return m; };
