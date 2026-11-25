// Piccoli helper DOM. Regola di sicurezza: il testo entra SEMPRE come nodo di testo (mai innerHTML),
// così nomi e altri dati inseriti dagli utenti non possono iniettare markup.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value' || key === 'checked' || key === 'disabled') el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export const clear = (el) => { el.replaceChildren(); return el; };

export function spinner(label = 'Caricamento…') {
  return h('div', { class: 'loading', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { class: 'sr-only' }, label));
}

export function loadingScreen() {
  return h('div', { class: 'center-screen' }, spinner());
}

export function errorBox(message, { onRetry } = {}) {
  return h('div', { class: 'card error-card', role: 'alert' },
    h('p', null, message),
    onRetry ? h('button', { class: 'btn btn-secondary', type: 'button', onclick: onRetry }, 'Riprova') : null);
}

export function emptyState(title, text) {
  return h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, title), text ? h('p', { class: 'muted' }, text) : null);
}

let toastTimer;
export function toast(message, kind = 'info') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = h('div', { id: 'toast-host', 'aria-live': 'polite', role: 'status' });
    document.body.append(host);
  }
  host.replaceChildren(h('div', { class: `toast toast-${kind}` }, message));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.replaceChildren(), 4000);
}

/** Esegue fn mostrando lo stato "occupato" sul pulsante; evita doppi invii. */
export async function withBusy(button, fn) {
  if (button.disabled) return undefined;
  const label = button.textContent;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Un attimo…';
  try { return await fn(); }
  finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = label;
  }
}

/** Campo di form con etichetta ed errore accessibili. */
export function field({ id, label, type = 'text', autocomplete, required = true, value = '', maxlength, inputmode, hint }) {
  const input = h('input', {
    id, name: id, type, autocomplete, required, value, maxlength, inputmode, class: 'input',
    'aria-describedby': `${id}-msg`, spellcheck: type === 'email' || type === 'password' ? 'false' : null,
    autocapitalize: type === 'email' ? 'none' : null,
  });
  const msg = h('p', { id: `${id}-msg`, class: 'field-msg', 'aria-live': 'polite' }, hint || '');
  const wrap = h('div', { class: 'field' }, h('label', { for: id, class: 'label' }, label), input, msg);
  const setError = (text) => {
    msg.textContent = text || hint || '';
    msg.classList.toggle('is-error', Boolean(text));
    if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  };
  return { wrap, input, setError };
}

export function avatarEl(url, name, size = 'md') {
  const initial = [...String(name || '?').trim()][0]?.toUpperCase() || '?';
  const el = h('div', { class: `avatar avatar-${size}`, role: 'img', 'aria-label': name ? `Foto di ${name}` : 'Foto profilo' });
  if (url) {
    const img = h('img', { src: url, alt: '', decoding: 'async' });
    img.addEventListener('error', () => { img.remove(); el.append(h('span', { 'aria-hidden': 'true' }, initial)); });
    el.append(img);
  } else {
    el.append(h('span', { 'aria-hidden': 'true' }, initial));
  }
  return el;
}

export function logo(size = 'lg') {
  return h('h1', { class: `logo logo-${size}`, 'aria-label': 'ALE.' }, 'ALE', h('span', { class: 'logo-dot' }, '.'));
}
