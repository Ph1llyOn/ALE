// Rotta pubblica #/invito?codice=...: salva il codice (solo in sessionStorage) e porta l'utente
// dove può usarlo. Il codice resta nel frammento dell'URL: non viene mai inviato al server di hosting.
import { h, loadingScreen } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { navigate } from '../../core/router.js';
import { rememberInviteCode } from './invite-storage.js';

export default async function inviteView({ query }) {
  rememberInviteCode(query.codice);
  const { session, profile } = getState();
  queueMicrotask(() => {
    if (!session) navigate('/registrati', { replace: true });
    else if (profile?.role === 'phill') navigate('/profilo/collegamento', { replace: true });
    else navigate('/home', { replace: true });
  });
  return h('main', { class: 'shell' }, loadingScreen());
}
