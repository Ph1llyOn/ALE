import { h, errorBox, withBusy } from '../core/ui.js';
import { signOut } from '../core/api.js';
import { refreshUserData } from '../core/session.js';
import { render } from '../core/router.js';

/** Schermata mostrata quando c'è una sessione ma il profilo non si carica: si può riprovare o uscire. */
export function profileErrorView(message) {
  const logout = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => withBusy(logout, signOut) }, 'Esci');
  return h('main', { class: 'shell' },
    errorBox(message || 'Non riesco a caricare il tuo profilo.', { onRetry: async () => { await refreshUserData(); render(); } }),
    logout);
}
