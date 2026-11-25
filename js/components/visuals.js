// Elementi visivi riusabili: hero, anello di avanzamento, statistiche, schede orizzontali, miniature degli esercizi.
import { h } from '../core/ui.js';
import { icon } from './icons.js';
import { exerciseById, exerciseImage } from '../data/exercises.js';

const NS = 'http://www.w3.org/2000/svg';
const R = 34;
const C = 2 * Math.PI * R;

/** Anello di avanzamento (0-100). */
export function ring({ percent = 0, label = null, ariaLabel }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 80 80');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(NS, 'circle');
  for (const [k, v] of Object.entries({ cx: 40, cy: 40, r: R, class: 'ring-track' })) track.setAttribute(k, v);
  const bar = document.createElementNS(NS, 'circle');
  for (const [k, v] of Object.entries({ cx: 40, cy: 40, r: R, class: 'ring-bar', 'stroke-dasharray': C.toFixed(2), 'stroke-dashoffset': (C * (1 - p / 100)).toFixed(2) })) bar.setAttribute(k, v);
  svg.append(track, bar);
  return h('div', { class: 'ring', role: 'img', 'aria-label': ariaLabel ?? `${p}%` }, svg, h('span', { class: 'ring-label' }, label ?? `${p}%`));
}

export function stat(value, label) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label));
}

/** Scheda "hero": titolo grande con una parola evidenziata, testo, pulsante a pillola. */
export function hero({ eyebrow, title, accent, text, cta, extra }) {
  const titleNodes = accent ? [title, ' ', h('em', null, accent)] : [title];
  return h('section', { class: 'hero' },
    eyebrow ? h('p', { class: 'hero-eyebrow' }, eyebrow) : null,
    h('h1', { class: 'hero-title', 'data-focus': true }, ...titleNodes),
    text ? h('p', { class: 'hero-text' }, text) : null,
    extra ?? null,
    cta ? (cta.href
      ? h('a', { class: 'btn', href: cta.href }, cta.label, h('span', { class: 'arrow', 'aria-hidden': 'true' }, icon('chevron', { size: 16 })))
      : h('button', { class: 'btn', type: 'button', onclick: cta.onClick }, cta.label, h('span', { class: 'arrow', 'aria-hidden': 'true' }, icon('chevron', { size: 16 })))) : null);
}

/** Miniatura dell'esercizio (illustrazione del catalogo, o icona se personalizzato). */
export function exerciseThumb(keyOrName, { className = 'exercise-thumb' } = {}) {
  const ex = exerciseById(keyOrName);
  return h('span', { class: className }, ex ? h('img', { src: exerciseImage(ex.id), alt: '', loading: 'lazy', decoding: 'async' }) : icon('activity', { size: 26 }));
}

/** Scheda orizzontale (per scroller): arte + titolo + sottotitolo. */
export function tile({ href, onClick, art, title, sub }) {
  const body = [
    h('span', { class: 'tile-art' }, art ?? icon('heart', { size: 36 })),
    h('span', { class: 'tile-body' }, h('span', { class: 'tile-title' }, title), sub ? h('span', { class: 'muted small' }, sub) : null),
  ];
  return href ? h('a', { class: 'tile', href }, ...body) : h('button', { class: 'tile', type: 'button', onclick: onClick, style: null }, ...body);
}

export const sectionHead = (title, action) => h('div', { class: 'section-head' }, h('h2', null, title), action ?? null);
