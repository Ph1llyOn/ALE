import { h } from '../core/ui.js';

const ITEMS = [
  { href: '#/home', label: 'Home', match: ['/home'], icon: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z' },
  { href: '#/profilo', label: 'Profilo', match: ['/profilo', '/profilo/collegamento'], icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0z' },
];

function icon(d) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'tab-icon');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

export function tabbar(currentPath) {
  return h('nav', { class: 'tabbar', 'aria-label': 'Navigazione principale' },
    ITEMS.map((it) => h('a', { href: it.href, class: 'tab', 'aria-current': it.match.includes(currentPath) ? 'page' : null },
      icon(it.icon), h('span', null, it.label))));
}
