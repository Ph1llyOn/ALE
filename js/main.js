import { initThemeToggle } from './core/theme.js';
import { resolve } from './config.js';

initThemeToggle(document.getElementById('theme-toggle'));

const status = document.getElementById('sw-status');

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    status.textContent = 'Modalità offline non supportata da questo browser.';
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register(resolve('sw.js'), { scope: resolve('./') });
    await navigator.serviceWorker.ready;
    status.textContent = 'Pronta anche offline.';
    reg.addEventListener('updatefound', () => {
      status.textContent = 'Aggiornamento in corso…';
    });
  } catch (err) {
    status.textContent = 'Modalità offline non disponibile.';
    console.warn('SW non registrato', err);
  }
}

registerServiceWorker();
