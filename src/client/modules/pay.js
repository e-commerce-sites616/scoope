import { api, el, money, errText } from './api.js';

export async function initPay() {
  if (document.body.dataset.page !== 'pay') return;
  const root = document.querySelector('[data-app]'); const key = location.pathname.split('/').pop();
  let o;
  try { o = await api('GET', `/api/v1/orders/${encodeURIComponent(key)}`); } catch { const e = el('div', 'cempty'); e.append(el('p', 'cempty__title', "We couldn't find that order."), el('p', '', 'The link may be incomplete.')); root.replaceChildren(e); return; }
  if (o.paymentStatus === 'paid' || !['pending_payment'].includes(o.status)) { location.replace(`/track/${key}`); return; }

  const box = el('div', 'paybox');
  const left = el('div', 'paybox__main');
  left.append(el('p', 'demo-banner demo-banner--big', 'This is a demonstration. No real payment is collected and no card is charged. Choose how you want the simulated payment to go.'));
  left.append(el('p', 'paybox__ref', `Order ${o.reference}`), el('p', 'paybox__amt', money(o.total)));
  const clock = el('p', 'paybox__clock'); left.append(clock);
  const msg = el('p', 'form__msg'); msg.setAttribute('role', 'status');
  const ok = el('button', 'btn', `Simulate successful payment`); ok.type = 'button';
  const bad = el('button', 'btn btn--ghost', 'Simulate a declined payment'); bad.type = 'button';
  const row = el('div', 'paybox__btns'); row.append(ok, bad); left.append(row, msg);
  const side = el('aside', 'cside'); const sum = el('div', 'csum'); side.append(el('h2', 'cside__h', 'Your order'), sum);
  for (const i of o.items) { const r = el('div', 'csum__row'); r.append(el('span', '', `${i.qty} × ${i.name}`), el('span', '', money(i.lineTotal))); sum.append(r); if (i.options) sum.append(el('p', 'cline__opts', i.options)); }
  const add = (a, b, c = '') => { const r = el('div', `csum__row ${c}`); r.append(el('span', '', a), el('span', '', b)); sum.append(r); };
  add('Delivery', money(o.deliveryFee)); if (o.discount) add('Discounts', `−${money(o.discount)}`); add('Total', money(o.total), 'csum__total');
  box.append(left, side); root.replaceChildren(box);

  const until = new Date(o.reservedUntil).getTime();
  const tick = () => { const s = Math.max(0, Math.round((until - Date.now()) / 1000)); clock.textContent = s ? `Your items are held for ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.` : 'Your hold has expired. Please place the order again.'; if (!s) { ok.disabled = bad.disabled = true; clearInterval(t); } };
  const t = setInterval(tick, 1000); tick();
  async function go(scenario) {
    ok.disabled = bad.disabled = true; msg.textContent = 'Processing...'; msg.dataset.state = '';
    try { await api('POST', `/api/v1/orders/${encodeURIComponent(key)}/pay`, { scenario }); location.href = `/track/${key}?paid=1`; }
    catch (e) {
      if (e.status === 402) { msg.textContent = `${e.json.message} You have ${e.json.attemptsLeft} attempt${e.json.attemptsLeft === 1 ? '' : 's'} left.`; msg.dataset.state = 'error'; ok.disabled = e.json.attemptsLeft === 0; bad.disabled = e.json.attemptsLeft === 0; }
      else { msg.textContent = errText(e); msg.dataset.state = 'error'; ok.disabled = bad.disabled = false; }
    }
  }
  ok.onclick = () => go('success'); bad.onclick = () => go('fail');
}
