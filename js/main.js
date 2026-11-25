import './core/boot.js'; // primo: cattura l'hash iniziale prima che supabase-js lo consumi
import { initThemeToggle } from './core/theme.js';
import { resolve } from './config.js';
import { h, loadingScreen, errorBox } from './core/ui.js';
import { setState, getState } from './core/store.js';
import { registerView, startRouter, render } from './core/router.js';
import { startSession } from './core/session.js';

import loginView from './features/auth/login.js';
import signupView from './features/auth/register.js';
import forgotView from './features/auth/forgot.js';
import resetView from './features/auth/reset.js';
import inviteView from './features/pairing/invite.js';
import pairingView from './features/pairing/pairing.js';
import homeView from './features/home/home.js';
import profileView from './features/profile/profile.js';

const app = document.getElementById('app');
app.replaceChildren(loadingScreen());

// Il tema si applica anche alle schermate senza il pulsante dedicato.
initThemeToggle(h('button'));

registerView('/accedi', loginView);
registerView('/registrati', signupView);
registerView('/password-dimenticata', forgotView);
registerView('/reimposta-password', resetView);
registerView('/invito', inviteView);
registerView('/home', homeView);
registerView('/profilo', profileView);
registerView('/profilo/collegamento', pairingView);

// Stato della connessione
const banner = h('div', { class: 'offline-banner', role: 'status', hidden: true }, 'Sei offline: alcune funzioni non sono disponibili.');
document.body.prepend(banner);
const syncOnline = () => { setState({ online: navigator.onLine }); banner.hidden = navigator.onLine; };
window.addEventListener('online', () => { syncOnline(); if (getState().session && !getState().profile) render(); });
window.addEventListener('offline', syncOnline);
syncOnline();

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register(resolve('sw.js'), { scope: resolve('./') }); }
  catch (err) { console.warn('Service worker non registrato', err); }
}

async function boot() {
  try {
    await startSession();
    await startRouter(app);
  } catch (err) {
    console.error(err);
    app.replaceChildren(h('main', { class: 'shell' }, errorBox('Non riesco ad avviare l’app. Controlla la connessione e riprova.', { onRetry: () => location.reload() })));
  }
  registerServiceWorker();
}

boot();
