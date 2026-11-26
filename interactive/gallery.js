'use strict';

const viewport = document.getElementById('gallery-window');
const grid = document.getElementById('case-grid');
const toggle = document.getElementById('gallery-mode');
const cards = Array.from(grid.children);
const narrow = matchMedia('(max-width: 680px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let flowing = !reducedMotion.matches;

function renderGallery() {
  viewport.classList.toggle('is-flowing', flowing);
  toggle.hidden = reducedMotion.matches;
  toggle.textContent = flowing ? '查看全部' : '循环播放';

  if (!flowing) {
    grid.replaceChildren(...cards);
    viewport.replaceChildren(grid);
    return;
  }

  const count = narrow.matches ? 2 : 3;
  const columns = document.createElement('div');
  columns.className = 'gallery-columns';
  for (let i = 0; i < count; i++) {
    const column = document.createElement('div');
    column.className = 'gallery-column';
    const track = document.createElement('div');
    track.className = 'gallery-track';
    const originals = document.createElement('ul');
    originals.setAttribute('aria-label', '案例列表第 ' + (i + 1) + ' 列');
    originals.append(...cards.filter((_, index) => index % count === i));
    const copies = originals.cloneNode(true);
    copies.removeAttribute('aria-label');
    copies.setAttribute('aria-hidden', 'true');
    for (const link of copies.querySelectorAll('a')) {
      link.tabIndex = -1;
      link.addEventListener('mousedown', event => event.preventDefault());
    }
    track.append(originals, copies);
    column.append(track);
    columns.append(column);
  }
  viewport.replaceChildren(columns);
}

toggle.addEventListener('click', () => {
  flowing = !flowing;
  renderGallery();
});

viewport.addEventListener('focusin', event => {
  if (!flowing || !(event.target instanceof HTMLAnchorElement) || event.target.tabIndex < 0) return;
  const link = event.target;
  flowing = false;
  renderGallery();
  link.focus();
});

narrow.addEventListener('change', renderGallery);
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) flowing = false;
  renderGallery();
});
renderGallery();
