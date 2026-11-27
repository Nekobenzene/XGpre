'use strict';

const viewport = document.getElementById('gallery-window');
const grid = document.getElementById('case-grid');
const toggle = document.getElementById('gallery-mode');
const cards = Array.from(grid.children);
const flowCards = cards.slice();
for (let i = flowCards.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [flowCards[i], flowCards[j]] = [flowCards[j], flowCards[i]];
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let flowing = !reducedMotion.matches;

function renderGallery() {
  const count = 2;
  const canFlow = !reducedMotion.matches && cards.length >= count * 5;
  const animating = canFlow && flowing;
  viewport.classList.toggle('is-flowing', animating);
  toggle.hidden = !canFlow;
  toggle.textContent = animating ? '查看全部' : '循环播放';

  if (!animating) {
    grid.replaceChildren(...cards);
    viewport.replaceChildren(grid);
    return;
  }

  const columns = document.createElement('div');
  columns.className = 'gallery-columns';
  for (let i = 0; i < count; i++) {
    const column = document.createElement('div');
    column.className = 'gallery-column';
    const track = document.createElement('div');
    track.className = 'gallery-track';
    const originals = document.createElement('ul');
    originals.setAttribute('aria-label', '案例列表第 ' + (i + 1) + ' 列');
    originals.append(...flowCards.filter((_, index) => index % count === i));
    const copies = originals.cloneNode(true);
    copies.removeAttribute('aria-label');
    copies.setAttribute('aria-hidden', 'true');
    for (const link of copies.querySelectorAll('a')) {
      link.tabIndex = -1;
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
  if (!viewport.classList.contains('is-flowing') || !(event.target instanceof HTMLAnchorElement)
    || event.target.tabIndex < 0 || !event.target.matches(':focus-visible')) return;
  const link = event.target;
  flowing = false;
  renderGallery();
  link.focus();
});

reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) flowing = false;
  renderGallery();
});
renderGallery();
