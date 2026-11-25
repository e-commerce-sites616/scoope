// Cart storage. Lines hold identifiers and quantities only; the server prices everything.
// Product line: { id, type:'product', productId, slug, size, variant, qty, seen }
// Build line:   { id, type:'build', config:{ base, scoops:[{flavour,qty}], toppings, sauces, extras }, qty, seen }
// `seen` is the unit price the shopper last saw, used only to warn about price changes.
const KEY = 'scoope.cart.v1';
export const MAX_QTY = 20;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 36);

export function readLines() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(a)) return [];
    return a.filter((l) => l && typeof l === 'object').map((l) => ({ ...l, id: l.id || uid(), type: l.type === 'build' ? 'build' : 'product', qty: Number.isInteger(l.qty) && l.qty > 0 ? Math.min(l.qty, MAX_QTY) : 1 }));
  } catch { return []; }
}
export function writeLines(lines) {
  try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { return false; }
  window.dispatchEvent(new Event('scoope:cart'));
  return true;
}
const count = () => readLines().reduce((n, l) => n + l.qty, 0);

export function initBag() {
  const el = document.querySelector('[data-bag-count]');
  if (!el) return;
  let last = count();
  const render = (animate) => {
    const n = count();
    el.textContent = String(n);
    el.dataset.empty = String(n === 0);
    if (animate && n > last) { el.removeAttribute('data-bump'); void el.offsetWidth; el.dataset.bump = 'true'; }
    last = n;
  };
  render(false);
  window.addEventListener('storage', (e) => { if (e.key === KEY) render(true); });
  window.addEventListener('scoope:cart', () => render(true));
}

export function addLine(line) {
  const lines = readLines();
  const qty = Math.min(Math.max(Math.trunc(line.qty) || 1, 1), 10);
  const same = (l) => l.type === line.type && (line.type === 'build'
    ? JSON.stringify(l.config) === JSON.stringify(line.config)
    : l.productId === line.productId && (l.size ?? null) === (line.size ?? null) && (l.variant ?? null) === (line.variant ?? null));
  const hit = lines.find(same);
  if (hit) { hit.qty = Math.min(hit.qty + qty, MAX_QTY); hit.seen = line.seen ?? hit.seen; }
  else lines.push({ ...line, id: uid(), qty });
  if (!writeLines(lines)) return false;
  window.dispatchEvent(new Event('scoope:added'));
  return true;
}
