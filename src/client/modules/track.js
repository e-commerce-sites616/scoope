import { api, el, money, when } from './api.js';

const DONE = new Set(['delivered', 'cancelled']);
const SCOOP = '<svg class="win" viewBox="0 0 120 150" aria-hidden="true"><path d="M36 78H84L60 140Z" fill="#D8BDA2"/><g class="win__scoops"><circle cx="60" cy="62" r="30" fill="#DCA1A0"/><circle cx="60" cy="38" r="22" fill="#F6F0E7" stroke="#382822" stroke-opacity=".25"/></g><circle class="win__tick" cx="92" cy="30" r="14" fill="#839078"/><path class="win__check" d="M85 30l5 5 9-10" stroke="#F6F0E7" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export async function initTrack() {
  if (document.body.dataset.page !== 'track') return;
  const root = document.querySelector('[data-app]'); const key = location.pathname.split('/').pop();
  const fresh = new URLSearchParams(location.search).get('paid') === '1';
  let timer = 0;

  async function load() {
    let o;
    try { o = await api('GET', `/api/v1/orders/${encodeURIComponent(key)}`); }
    catch { const e = el('div', 'cempty'); e.append(el('p', 'cempty__title', "We couldn't find that order."), el('p', '', 'Check the link, or sign in to see orders on your account.')); const a = el('a', 'btn', 'Go to your account'); a.href = '/account'; e.append(a); root.replaceChildren(e); return; }
    draw(o);
    clearTimeout(timer); if (!DONE.has(o.status) && o.status !== 'pending_payment') timer = setTimeout(() => { if (!document.hidden) load(); else timer = setTimeout(load, 5000); }, 8000);
  }

  function draw(o) {
    const top = el('header', 'trk__head');
    if (fresh && o.paymentStatus === 'paid') { const w = el('div', 'trk__win'); w.innerHTML = SCOOP; top.append(w); }
    const h = el('h1', 'trk__title', o.cancelled ? 'Order cancelled' : o.paymentStatus === 'paid' && fresh ? 'Thank you. Your order is in.' : `Order ${o.reference}`);
    const chip = el('span', `chip chip--${o.status}`, o.statusLabel); top.append(h, el('p', 'trk__ref', `Reference ${o.reference} · placed ${when(o.createdAt)}`), chip);
    const demo = el('p', 'demo-banner', o.demoNote);

    const tl = el('ol', 'timeline'); const idx = o.timeline.findLastIndex((t) => t.at);
    o.timeline.forEach((t, i) => { const li = el('li', `${t.at ? 'is-done' : ''}${i === idx && !o.cancelled ? ' is-current' : ''}`); li.append(el('b', '', t.label), el('span', '', t.at ? when(t.at) : '')); tl.append(li); });
    const left = el('div', 'trk__main');
    if (o.cancelled) left.append(el('p', 'trk__note', o.refunded ? 'This order was cancelled and a simulated refund was recorded.' : o.cancelReason === 'expired' ? 'This order expired before it was paid.' : 'This order was cancelled.'));
    else left.append(tl);
    if (!o.cancelled && o.estimate && o.paymentStatus === 'paid') left.append(el('p', 'trk__est', `Estimated delivery: ${when(o.estimate.from)} to ${new Date(o.estimate.to).toLocaleTimeString('en-NG', { timeStyle: 'short' })}${o.estimate.outsideHours ? ' (we open at 10:00)' : ''}. Indicative only.`));
    if (o.pointsEarned) left.append(el('p', 'trk__note', `You earned ${o.pointsEarned} reward points.`));
    const actions = el('div', 'trk__actions');
    if (o.canPay) { const a = el('a', 'btn', 'Pay now'); a.href = `/pay/${key}`; actions.append(a); }
    if (o.canCancel) {
      const c = el('button', 'link', 'Cancel this order'); c.type = 'button';
      c.onclick = () => { c.hidden = true; const y = el('button', 'btn btn--ghost', 'Yes, cancel it'); y.type = 'button'; const n = el('button', 'link', 'Keep my order'); n.type = 'button'; n.onclick = () => { y.remove(); n.remove(); c.hidden = false; }; y.onclick = async () => { y.disabled = true; try { await api('POST', `/api/v1/orders/${encodeURIComponent(key)}/cancel`, {}); load(); } catch (e) { y.after(el('p', 'cline__msg', 'This order can no longer be cancelled.')); } }; actions.append(y, n); };
      actions.append(c);
    }
    left.append(actions);
    if (!/^SCP-/.test(key)) left.append(el('p', 'pdp__demo', 'Keep this page link. If you are not signed in, it is the only way back to this order.'));

    const side = el('aside', 'cside'); const sum = el('div', 'csum'); side.append(el('h2', 'cside__h', 'Order details'), sum);
    for (const i of o.items) { const r = el('div', 'csum__row'); r.append(el('span', '', `${i.qty} × ${i.name}`), el('span', '', money(i.lineTotal))); sum.append(r); if (i.options) sum.append(el('p', 'cline__opts', i.options)); }
    const add = (a, b, c = '') => { const r = el('div', `csum__row ${c}`); r.append(el('span', '', a), el('span', '', b)); sum.append(r); };
    add('Subtotal', money(o.subtotal)); if (o.discount) add('Discounts', `−${money(o.discount)}`); add('Delivery', money(o.deliveryFee)); add('Total', money(o.total), 'csum__total');
    add('Payment', o.paymentStatus === 'paid' ? 'Paid (simulated)' : o.paymentStatus === 'refunded' ? 'Refunded (simulated)' : o.paymentStatus === 'failed' ? 'Last attempt declined' : 'Not paid');
    side.append(el('h3', 'cside__h2', 'Delivering to'), el('p', '', `${o.customer.name}`), el('p', '', `${o.delivery.line1}, ${o.delivery.area} (${o.delivery.zone})`));
    if (o.delivery.notes) side.append(el('p', 'cline__opts', `Notes: ${o.delivery.notes}`));
    if (o.gift) side.append(el('h3', 'cside__h2', 'Gift'), el('p', '', `For ${o.gift.recipient}`), o.gift.message ? el('p', 'cline__opts', `"${o.gift.message}"`) : el('span'));
    const grid = el('div', 'cogrid'); grid.append(left, side);
    root.replaceChildren(top, demo, grid);
  }
  load();
}
