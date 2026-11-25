// Hovering or focusing a flavour swaps the rendered scoop on the same cone.
// Pure enhancement: without JS the list still works as plain links.
export function initFlavours() {
  const list = document.querySelector('[data-flavour-list]');
  const stage = document.querySelector('.stage');
  const label = document.querySelector('[data-flavour-name]');
  if (!list || !stage) return;
  const items = [...list.querySelectorAll('li[data-stage]')];
  const imgs = [...stage.querySelectorAll('img[data-stage]')];
  const show = (li) => {
    imgs.forEach((i) => i.classList.toggle('is-on', i.dataset.stage === li.dataset.stage));
    if (label) label.textContent = li.dataset.name;
    items.forEach((i) => i.toggleAttribute('data-active', i === li));
  };
  items.forEach((li) => { li.addEventListener('pointerenter', () => show(li)); li.addEventListener('focusin', () => show(li)); });
  show(items[0]);
}
