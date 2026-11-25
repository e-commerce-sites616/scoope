import { setView } from './art.js';
import { addLine } from './bag.js';
import { loadManifest } from './images.js';

const money = (n) => '₦' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function initProduct() {
  const gallery = document.querySelector('[data-gallery]');
  if (gallery) {
    const main = gallery.querySelector('.gallery__main'); const thumbs = [...gallery.querySelectorAll('.thumb')]; const row = gallery.querySelector('.gallery__thumbs');
    const slug = location.pathname.split('/').pop(); const photo = main.querySelector('img[data-asset]');
    loadManifest().then((m) => {
      const find = (id) => (m?.images || []).find((i) => i.id === id && i.url && i.verified === true);
      const base = find(`product-${slug}`), close = find(`product-${slug}-close`);
      if (base && close) {
        // real second view: swap the photograph itself
        const views = [[base, 'Front view'], [close, 'Close-up view']];
        row.replaceChildren(...views.map(([a, label], i) => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'thumb'; b.setAttribute('aria-label', label); b.setAttribute('aria-pressed', String(i === 0));
          const im = document.createElement('img'); im.src = a.url; im.alt = ''; im.width = 44; im.height = 44; b.append(im);
          b.onclick = () => { photo.classList.remove('is-loaded'); photo.addEventListener('load', () => photo.classList.add('is-loaded'), { once: true }); photo.src = a.url; photo.alt = a.alt || ''; [...row.children].forEach((o) => o.setAttribute('aria-pressed', String(o === b))); };
          return b;
        }));
      } else if (base) row.hidden = true;                  // one photo only: nothing to switch
      else thumbs.forEach((b) => b.addEventListener('click', () => { setView(main, b.dataset.view); thumbs.forEach((o) => o.setAttribute('aria-pressed', String(o === b))); }));
    });
  }

  const form = document.querySelector('[data-buy]');
  if (!form) return;
  const priceEl = document.querySelector('[data-price]');
  const out = form.querySelector('[data-qty-out]');
  const msg = form.querySelector('[data-buy-msg]');
  let qty = 1;
  const unit = () => Number(form.dataset.base) + [...form.querySelectorAll('input:checked')].reduce((n, i) => n + Number(i.dataset.delta || 0), 0);
  const render = () => { out.textContent = String(qty); priceEl.textContent = money(unit() * qty); };
  form.addEventListener('change', render);
  form.querySelectorAll('[data-qty]').forEach((b) => b.addEventListener('click', () => { qty = Math.min(10, Math.max(1, qty + Number(b.dataset.qty))); render(); }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = addLine({ type: 'product', seen: unit(), productId: form.dataset.id, slug: form.dataset.slug, size: form.querySelector('input[name=size]:checked')?.value ?? null, variant: form.querySelector('input[name=variant]:checked')?.value ?? null, qty });
    msg.textContent = ok ? `Added ${qty} to your bag.` : 'Your browser blocked saving the bag. Check your privacy settings.';
    msg.dataset.state = ok ? 'ok' : 'error';
  });
  render();
}
