// Fills <img data-asset="id"> from the asset manifest, only for assets marked verified.
// Anything else stays hidden and the generated art underneath remains visible.
let manifestPromise;
export const loadManifest = () => (manifestPromise ||= fetch('/assets/manifest/assets.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));

export async function initImages(root = document) {
  const slots = [...root.querySelectorAll('img[data-asset]:not([src])')];
  if (!slots.length) return;
  const manifest = await loadManifest();
  if (!manifest) return;
  for (const img of slots) {
    const a = (manifest.images || []).find((i) => i.id === img.dataset.asset);
    if (!a || !a.url || a.verified !== true) continue;
    img.alt = a.alt || '';
    img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    img.addEventListener('error', () => img.removeAttribute('src'), { once: true });
    img.src = a.url;
  }
}
