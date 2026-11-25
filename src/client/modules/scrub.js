// Scroll-scrubbed video: scroll position drives video.currentTime.
// Native <video> + requestAnimationFrame only. Falls back to a static poster + full list when
// motion is reduced, data saver is on, the video fails to load, or JavaScript is off.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

export function initScrub() {
  const root = document.querySelector('[data-scrub]');
  if (!root) return;
  const video = root.querySelector('video');
  const track = root.querySelector('.scrub__track');
  const beats = [...root.querySelectorAll('.beat')];
  const bar = root.querySelector('.scrub__bar i');
  const makeStatic = () => { root.classList.remove('is-live'); root.classList.add('is-static'); };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData) return makeStatic();

  let duration = 0, cur = 0, target = 0, raf = 0, near = false, started = false, palette = null;

  function paint(t) {
    beats.forEach((b) => b.classList.toggle('is-active', t >= Number(b.dataset.from) && t < Number(b.dataset.to)));
    if (bar) bar.style.setProperty('--p', String(duration ? t / duration : 0));
    if (palette) {
      const f = t / palette.step, i = clamp(Math.floor(f), 0, palette.colours.length - 1), j = Math.min(i + 1, palette.colours.length - 1), k = f - Math.floor(f);
      const a = hex(palette.colours[i]), b = hex(palette.colours[j]);
      const c = a.map((v, n) => Math.round(v + (b[n] - v) * k));
      root.style.setProperty('--scrub-bg', `rgb(${c})`);
      root.style.setProperty('--scrub-fg', (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 150 ? '#382822' : '#F6F0E7');
    }
  }
  function measure() {
    const r = track.getBoundingClientRect();
    const total = r.height - innerHeight;
    target = clamp(total > 0 ? -r.top / total : 0, 0, 1) * Math.max(duration - 0.05, 0);
  }
  function tick() {
    raf = 0;
    cur += (target - cur) * 0.2;
    if (Math.abs(target - cur) < 0.01) cur = target;
    // Seek only when the gap is meaningful and the previous seek has finished.
    if (!video.seeking && Math.abs(video.currentTime - cur) > 0.03) video.currentTime = cur;
    paint(cur);
    if (near && cur !== target) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (near && duration && !raf) raf = requestAnimationFrame(tick); };
  const onScroll = () => { if (!near) return; measure(); kick(); };

  function start() {
    if (started) return;
    started = true;
    video.src = matchMedia('(max-width: 700px)').matches ? root.dataset.srcMobile : root.dataset.src;
    video.preload = 'auto';
    const timer = setTimeout(makeStatic, 10000);
    fetch(root.dataset.palette).then((r) => (r.ok ? r.json() : null)).then((j) => { palette = j; paint(cur); }).catch(() => {});
    video.addEventListener('loadedmetadata', () => {
      clearTimeout(timer);
      duration = video.duration;
      root.classList.add('is-live');
      // iOS only paints seeked frames after the element has played once.
      video.play().then(() => video.pause()).catch(() => {});
      measure(); paint(0); kick();
    }, { once: true });
    video.addEventListener('error', () => { clearTimeout(timer); makeStatic(); }, { once: true });
    video.load();
  }

  new IntersectionObserver(([e]) => {
    near = e.isIntersecting;
    if (near) { start(); measure(); kick(); } else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }, { rootMargin: '700px 0px' }).observe(track);
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
}
