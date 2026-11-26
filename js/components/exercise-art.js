// Illustrazione ANIMATA di un esercizio (l'omino stilizzato): l'SVG si inserisce nella pagina così si può mettere in pausa
// quando chi usa il telefono ha scelto "riduci animazioni". Se qualcosa va storto si ripiega su un'immagine normale.
import { h } from '../core/ui.js';
import { exerciseImage, exerciseById } from '../data/exercises.js';

const cache = new Map();
const reduceMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

async function loadSvg(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); }).catch((err) => { cache.delete(url); throw err; }));
  }
  return cache.get(url);
}

/** Restituisce un contenitore con l'illustrazione animata. `animated:false` lascia l'omino fermo nella posa iniziale. */
export function exerciseArt(key, { className = 'exercise-art', animated = true } = {}) {
  const ex = exerciseById(key);
  const box = h('div', { class: className, role: 'img', 'aria-label': ex ? `Illustrazione: ${ex.name}` : 'Illustrazione dell’esercizio' });
  if (!ex) return box;
  const url = exerciseImage(ex.id);
  const fallback = () => box.replaceChildren(h('img', { src: url, alt: '', decoding: 'async' }));
  loadSvg(url).then((text) => {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) { fallback(); return; }
    for (const bad of svg.querySelectorAll('script, foreignObject, image')) bad.remove();
    svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('focusable', 'false'); svg.setAttribute('aria-hidden', 'true');
    box.replaceChildren(document.importNode(svg, true));
    const live = box.querySelector('svg');
    if ((!animated || reduceMotion()) && live?.pauseAnimations) { live.pauseAnimations(); live.setCurrentTime(0); }
  }).catch(fallback);
  return box;
}
