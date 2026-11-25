// Stage 7 motion: scroll reveals, clipping reveals for imagery, controlled parallax.
// Everything is gated on prefers-reduced-motion and degrades to fully visible content.
export function initMotion() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const root = document.documentElement;
  const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
  document.querySelectorAll('[data-reveal]').forEach((n) => io.observe(n));
  root.classList.add('motion');

  // Parallax: only elements currently on screen are updated, on one rAF per scroll burst.
  const items = [...document.querySelectorAll('[data-parallax]')].map((el) => ({ el, f: Number(el.dataset.parallax) || 0.1, on: false }));
  if (!items.length) return;
  const vis = new IntersectionObserver((es) => es.forEach((e) => { const it = items.find((i) => i.el === e.target); if (it) it.on = e.isIntersecting; }), { rootMargin: '100px' });
  items.forEach((i) => vis.observe(i.el));
  let raf = 0;
  const run = () => { raf = 0; const vh = innerHeight; for (const i of items) if (i.on) { const r = i.el.getBoundingClientRect(); const px = Math.max(-40, Math.min(40, (r.top + r.height / 2 - vh / 2) * -i.f)); i.el.style.setProperty('--py', `${px.toFixed(1)}px`); } };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(run); }, { passive: true });
  run();
}
