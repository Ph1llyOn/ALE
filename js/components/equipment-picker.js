// Scelta degli attrezzi per categoria: ogni attrezzo si seleziona e si deseleziona con un tocco.
// `selected` è un Set di nomi in minuscolo; `onToggle(nome, acceso)` può essere asincrona (in caso di errore il tocco torna indietro).
import { h, toast } from '../core/ui.js';
import { EQUIPMENT_CATALOG } from '../data/exercises.js';

export const norm = (name) => String(name ?? '').trim().toLowerCase();

export function equipmentPicker({ selected, onToggle }) {
  const buttons = new Map();
  const wrap = h('div', { class: 'stack equipment-picker' }, EQUIPMENT_CATALOG.map((cat) => h('section', { class: 'stack', 'aria-label': cat.title },
    h('h3', { class: 'eyebrow' }, cat.title),
    h('div', { class: 'chips' }, cat.items.map((name) => {
      const paint = (b) => { const on = selected.has(norm(name)); b.setAttribute('aria-pressed', String(on)); b.classList.toggle('chip-on', on); };
      const b = h('button', { class: 'chip chip-btn', type: 'button', onclick: async () => {
        const next = !selected.has(norm(name));
        next ? selected.add(norm(name)) : selected.delete(norm(name));
        paint(b); b.disabled = true;
        try { await onToggle(name, next); }
        catch (err) { next ? selected.delete(norm(name)) : selected.add(norm(name)); paint(b); toast(err.message || 'Non sono riuscita a salvare. Riprova.', 'error'); }
        finally { b.disabled = false; }
      } }, name);
      paint(b);
      buttons.set(norm(name), b);
      return b;
    })))));
  return { el: wrap, refresh: () => { for (const [k, b] of buttons) { const on = selected.has(k); b.setAttribute('aria-pressed', String(on)); b.classList.toggle('chip-on', on); } } };
}
