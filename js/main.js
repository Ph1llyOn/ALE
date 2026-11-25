import { initThemeToggle } from './core/theme.js';
import { resolve } from './config.js';
import { h, loadingScreen, errorBox } from './core/ui.js';
import { setState, getState } from './core/store.js';
import { registerView, startRouter, render } from './core/router.js';
import { startSession, startAutoRefresh } from './core/session.js';

import accessView from './features/access/access.js';
import pairingView from './features/pairing/pairing.js';
import homeView from './features/home/home.js';
import profileView from './features/profile/profile.js';
import inboxView from './features/messages/inbox.js';
import phillMessagesView from './features/messages/phill-messages.js';
import wellbeingView from './features/wellbeing/wellbeing.js';
import progressView from './features/progress/progress.js';
import equipmentView from './features/equipment/equipment.js';
import privacyView from './features/privacy/privacy.js';
import activitiesView from './features/activities/activities.js';
import workoutEditView from './features/activities/workout-edit.js';
import sessionView from './features/activities/session.js';
import calendarView from './features/calendar/calendar.js';
import journalView from './features/journal/journal.js';
import journalEditView from './features/journal/journal-edit.js';
import notificationsView from './features/notifications/notifications.js';
import settingsView from './features/settings/settings.js';
import onboardingView from './features/onboarding/onboarding.js';

const app = document.getElementById('app');
app.replaceChildren(loadingScreen());

// Il tema si applica anche alle schermate senza il pulsante dedicato.
initThemeToggle(h('button'));

registerView('/scegli', accessView);
registerView('/home', homeView);
registerView('/profilo', profileView);
registerView('/profilo/collegamento', pairingView);
registerView('/profilo/privacy', privacyView);
registerView('/profilo/benessere', wellbeingView);
registerView('/profilo/progressi', progressView);
registerView('/profilo/attrezzatura', equipmentView);
registerView('/biglietti', inboxView);
registerView('/messaggi', phillMessagesView);
registerView('/attivita', activitiesView);
registerView('/attivita/scheda', workoutEditView);
registerView('/attivita/sessione', sessionView);
registerView('/calendario', calendarView);
registerView('/diario', journalView);
registerView('/diario/voce', journalEditView);
registerView('/notifiche', notificationsView);
registerView('/profilo/impostazioni', settingsView);
registerView('/benvenuta', onboardingView);

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
    startAutoRefresh();
    await startRouter(app);
  } catch (err) {
    console.error(err);
    app.replaceChildren(h('main', { class: 'shell' }, errorBox('Non riesco ad avviare l’app. Controlla la connessione e riprova.', { onRetry: () => location.reload() })));
  }
  registerServiceWorker();
}

boot();
