// Icone a tratto, coerenti (24x24, linea 1.8). Create con createElementNS: nessun markup come stringa.
const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10',
  activity: 'M13 3 5 13.5h6L10 21l8-10.5h-6z',
  calendar: 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10.5h16M8.5 3.5v4M15.5 3.5v4',
  book: 'M6 3.5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6zM6 3.5v17M9.5 8h5M9.5 11.5h5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
  mail: 'M4 6h16v12H4zM4.5 7l7.5 6 7.5-6',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  chevron: 'm9 6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16zM14 6l4 4',
  trash: 'M5 7h14M10 4h4M7 7l1 13h8l1-13M10 11v6M14 11v6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  leaf: 'M5 19c0-9 5-14 14-14 0 9-5 14-14 14zM5 19l7-7',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
  shield: 'M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
};

export function icon(name, { size = 24, className = 'icon' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', PATHS[name] ?? PATHS.heart);
  svg.append(path);
  return svg;
}

/** Piccolo cuore decorativo (riempito) per i dettagli romantici. */
export function heart({ size = 14 } = {}) {
  const svg = icon('heart', { size, className: 'icon icon-heart' });
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('stroke-width', '1');
  return svg;
}

export const ICON_NAMES = Object.keys(PATHS);
