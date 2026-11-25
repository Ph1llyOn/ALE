import { h } from '../core/ui.js';

/**
 * Tastierino numerico per il PIN (6 cifre). Funziona anche con la tastiera fisica.
 * onComplete(pin) viene chiamato quando l'ultima cifra è inserita.
 */
export function pinPad({ length = 6, onComplete }) {
  let value = '';
  let busy = false;
  const dots = h('div', { class: 'pin-dots', role: 'img', 'aria-label': 'Cifre inserite: 0 su 6' },
    Array.from({ length }, () => h('span', { class: 'pin-dot' })));
  const msg = h('p', { class: 'pin-msg', role: 'status', 'aria-live': 'polite' });

  const paint = () => {
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i < value.length));
    dots.setAttribute('aria-label', `Cifre inserite: ${value.length} su ${length}`);
  };

  const press = (digit) => {
    if (busy || value.length >= length) return;
    value += digit;
    paint();
    if (value.length === length) onComplete(value);
  };
  const back = () => { if (busy) return; value = value.slice(0, -1); paint(); };

  const key = (label, onClick, cls = '', aria = null) =>
    h('button', { type: 'button', class: `pin-key ${cls}`.trim(), 'aria-label': aria, onclick: onClick }, label);
  const keys = [
    ...'123456789'.split('').map((d) => key(d, () => press(d))),
    h('span'),
    key('0', () => press('0')),
    key('⌫', back, 'ghost', 'Cancella'),
  ];
  const pad = h('div', { class: 'pin-pad', role: 'group', 'aria-label': 'Tastierino numerico' }, keys);
  const el = h('div', { class: 'stack center' }, dots, msg, pad);

  const onKey = (ev) => {
    if (!el.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (/^\d$/.test(ev.key)) press(ev.key);
    else if (ev.key === 'Backspace') back();
  };
  document.addEventListener('keydown', onKey);

  return {
    el,
    setMessage(text, isError = false) { msg.textContent = text; msg.classList.toggle('is-error', isError); },
    shake() { dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); },
    reset() { value = ''; paint(); },
    setBusy(b) { busy = b; pad.style.opacity = b ? '0.5' : ''; },
  };
}
