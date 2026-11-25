// Generated product illustrations in the SCOOPÉ palette. Used until verified photography
// exists in the asset manifest; a verified photo overlays this automatically (see images.js).
// Only constants are interpolated into markup: nothing user-supplied.
const COLOURS = [
  ['vanilla', '#F6F0E7'], ['chocolate', '#5A3A2E'], ['strawberry', '#DCA1A0'], ['berry', '#C98C8B'],
  ['caramel', '#B98A5E'], ['cookies', '#8C7B6E'], ['pistachio', '#839078'],
];
const SAUCE = [['chocolate', '#3A2620'], ['caramel', '#B98A5E'], ['berry', '#A8505C'], ['pistachio', '#6E7C62']];
const EDGE = 'stroke="currentColor" stroke-opacity=".3" stroke-width="1.5"';

function flavoursOf(slug) {
  const hits = COLOURS.filter(([k]) => slug.includes(k)).map(([, c]) => c);
  if (slug.includes('mixed')) return ['#F6F0E7', '#5A3A2E', '#DCA1A0'];
  if (slug.includes('waffle')) return ['#F6F0E7'];
  if (slug.includes('scoop') && !hits.length) return ['#F6F0E7', '#5A3A2E', '#DCA1A0'];
  return hits.length ? hits : ['#DCA1A0'];
}
export const flavourColour = (slug) => flavoursOf(slug)[0];
const scoop = (x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${EDGE}/><path d="M${x - r * .55} ${y - r * .2}a${r * .6} ${r * .6} 0 0 1 ${r * .3}-${r * .45}" stroke="#F6F0E7" stroke-opacity=".5" stroke-width="${r * .1}" stroke-linecap="round" fill="none"/>`;
const shadow = '<ellipse cx="200" cy="440" rx="110" ry="11" fill="#000" opacity=".16"/>';

function cup(c) {
  return `${shadow}<path d="M120 335H280L258 436H142Z" fill="#F6F0E7" ${EDGE}/><path d="M127 362H273L269 384H131Z" fill="#783D45"/>` +
    scoop(200, 285, 86, c[0]) + `<ellipse cx="200" cy="334" rx="90" ry="13" fill="${c[0]}" ${EDGE}/>`;
}
function cone(c, n) {
  let s = shadow + '<path d="M140 310H260L200 446Z" fill="#D8BDA2"/>';
  for (const y of [335, 360, 385, 410]) { const w = 60 * (446 - y) / 136; s += `<path d="M${200 - w} ${y}H${200 + w}" stroke="#B98A5E" stroke-width="2.5"/>`; }
  for (let i = 0; i < n; i++) s += scoop(200, 282 - i * 82, 68, c[i % c.length]);
  return s;
}
function tub(c) {
  let body;
  if (c.length > 1) {
    const T = [110, 170, 230, 290], B = [128, 176, 224, 272];
    body = c.slice(0, 3).map((col, i) => `<path d="M${T[i]} 232L${T[i + 1]} 232L${B[i + 1]} 424L${B[i]} 424Z" fill="${col}"/>`).join('') + `<path d="M110 232L128 424H272L290 232" fill="none" ${EDGE}/>`;
  } else body = `<path d="M110 232L128 424H272L290 232Z" fill="${c[0]}" ${EDGE}/>`;
  return shadow + body + '<rect x="98" y="198" width="204" height="40" rx="4" fill="#F6F0E7" stroke="currentColor" stroke-opacity=".3" stroke-width="1.5"/><rect x="132" y="300" width="136" height="54" fill="#F6F0E7" opacity=".92"/><circle cx="200" cy="327" r="14" fill="#783D45"/><path d="M193 322c1-6 8-8 15-8-1 7-6 11-15 8z" fill="#DCA1A0"/>';
}
function sundae(c, slug) {
  const sauce = (SAUCE.find(([k]) => slug.includes(k)) || SAUCE[0])[1];
  // glass first, then scoops resting in it, so the rim never cuts through the ice cream
  return shadow + '<ellipse cx="200" cy="432" rx="64" ry="9" fill="currentColor" fill-opacity=".25"/><path d="M193 352H207V430H193Z" fill="currentColor" fill-opacity=".3"/>' +
    '<path d="M108 258H292Q292 346 200 356Q108 346 108 258Z" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-opacity=".55" stroke-width="2"/>' +
    scoop(160, 252, 52, c[0]) + scoop(240, 252, 52, c[1 % c.length]) + scoop(200, 204, 58, c[2 % c.length]) +
    `<path d="M150 182c20-14 80-14 100 0-4 22-8 30-16 30-6-14-12-14-16 4-6-14-14-14-18 0-6-12-14-10-20-2-4-4-8-16-10-32z" fill="${sauce}" opacity=".95"/>` +
    '<circle cx="200" cy="150" r="24" fill="#F6F0E7" ' + EDGE + '/><circle cx="200" cy="126" r="12" fill="#A8505C"/><path d="M200 116c0-9 5-15 12-19" stroke="#839078" stroke-width="3" stroke-linecap="round" fill="none"/>';
}
function box(slug) {
  const [body, rib] = slug.includes('sweet') ? ['#DCA1A0', '#783D45'] : slug.includes('celebration') ? ['#783D45', '#DCA1A0'] : ['#382822', '#D8BDA2'];
  return shadow + `<rect x="106" y="262" width="188" height="170" fill="${body}" ${EDGE}/><rect x="96" y="226" width="208" height="46" fill="${body}" ${EDGE}/>` +
    `<rect x="186" y="226" width="28" height="206" fill="${rib}"/><path d="M200 226C150 160 126 226 200 226C274 160 250 226 200 226Z" fill="${rib}"/><circle cx="200" cy="226" r="9" fill="${rib}"/>`;
}

export function artSvg(slug, cat, view = 'light') {
  const c = flavoursOf(slug);
  const n = slug.includes('triple') ? 3 : slug.includes('double') ? 2 : 1;
  const inner = cat === 'take-home-tubs' ? tub(c) : cat === 'signature-sundaes' ? sundae(c, slug) : cat === 'gift-collections' ? box(slug)
    : cat === 'cones-combinations' ? cone(c, n) : cup(c);
  const zoom = view === 'detail' ? '<g transform="translate(200 300) scale(1.4) translate(-200 -300)">' + inner + '</g>' : inner;
  return `<svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${zoom}</svg>`;
}

export function setView(el, view) {
  el.dataset.view = view;
  el.querySelector('svg')?.remove();
  el.insertAdjacentHTML('afterbegin', artSvg(el.dataset.slug, el.dataset.cat, view));
}
export function hydrateArt(root = document) {
  root.querySelectorAll('[data-art]').forEach((el) => { if (!el.querySelector('svg')) setView(el, el.dataset.view || 'light'); });
}
