// Controlli riusabili: interruttore, controllo segmentato, scala 1-5, riga di elenco, intestazione di pagina.
import { h } from '../core/ui.js';
import { icon } from './icons.js';

let seq = 0;
const uid = (p) => `${p}-${++seq}`;

/** Interruttore accessibile (role="switch"). onChange(nextValue) può essere asincrona; in caso di errore si ripristina. */
export function toggle({ label, description, checked = false, onChange }) {
  const id = uid('sw');
  const input = h('input', { type: 'checkbox', role: 'switch', id, class: 'switch-input', checked, 'aria-describedby': description ? `${id}-d` : null });
  const row = h('label', { class: 'switch-row', for: id },
    h('span', { class: 'switch-text' }, h('span', { class: 'switch-label' }, label), description ? h('span', { id: `${id}-d`, class: 'muted' }, description) : null),
    input, h('span', { class: 'switch-track', 'aria-hidden': 'true' }, h('span', { class: 'switch-thumb' })));
  input.addEventListener('change', async () => {
    const next = input.checked;
    input.disabled = true;
    try { await onChange(next); }
    catch { input.checked = !next; }
    finally { input.disabled = false; }
  });
  return { el: row, input };
}

/** Controllo segmentato (tab di una pagina). */
export function segmented({ options, value, onChange, label }) {
  const wrap = h('div', { class: 'segmented', role: 'tablist', 'aria-label': label });
  const buttons = new Map();
  const select = (v) => {
    for (const [key, b] of buttons) { b.setAttribute('aria-selected', String(key === v)); b.tabIndex = key === v ? 0 : -1; }
  };
  for (const o of options) {
    const b = h('button', { type: 'button', role: 'tab', class: 'segment', 'aria-selected': String(o.value === value),
      tabindex: o.value === value ? 0 : -1, onclick: () => { select(o.value); onChange(o.value); } }, o.label);
    buttons.set(o.value, b);
    wrap.append(b);
  }
  return { el: wrap, select };
}

/** Scala 1-5 come gruppo di pulsanti radio. */
export function scale({ name, label, options, value, onChange }) {
  const group = h('fieldset', { class: 'scale' }, h('legend', { class: 'label' }, label));
  const row = h('div', { class: 'scale-row' });
  for (const o of options) {
    const id = `${name}-${o.value}`;
    const input = h('input', { type: 'radio', name, id, value: o.value, class: 'sr-only', checked: value === o.value,
      onchange: () => onChange(o.value) });
    row.append(h('label', { for: id, class: 'scale-item' }, input, h('span', { class: 'scale-num' }, o.value), h('span', { class: 'scale-label' }, o.label)));
  }
  group.append(row);
  return group;
}

/** Riga di elenco cliccabile con icona e freccia. */
export function listRow({ href, iconName, title, text, trailing }) {
  return h('a', { class: 'list-row', href },
    iconName ? h('span', { class: 'list-icon' }, icon(iconName)) : null,
    h('span', { class: 'grow' }, h('span', { class: 'list-title' }, title), text ? h('span', { class: 'muted block' }, text) : null),
    trailing ?? icon('chevron', { size: 18, className: 'icon list-chevron' }));
}

export function pageHeader({ title, eyebrow, back }) {
  return h('header', { class: 'page-header' },
    back ? h('a', { class: 'back', href: back.href }, `‹ ${back.label}`) : null,
    eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null,
    h('h1', { class: 'page-title', 'data-focus': true }, title));
}
