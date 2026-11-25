const KEY = 'ale.theme';
const ORDER = ['system', 'light', 'dark'];
const LABEL = { system: 'sistema', light: 'chiaro', dark: 'scuro' };

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return ORDER.includes(v) ? v : 'system';
  } catch { return 'system'; }
}

function apply(mode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  try {
    if (mode === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch { /* ignora */ }
}

export function initThemeToggle(button) {
  let mode = read();
  const render = () => { button.textContent = `Tema: ${LABEL[mode]}`; };
  apply(mode);
  render();
  button.addEventListener('click', () => {
    mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    apply(mode);
    render();
  });
}
