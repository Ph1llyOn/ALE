// Codice invito ricevuto da un link, conservato SOLO per la sessione del browser (sessionStorage)
// finché l'utente non ha finito di registrarsi/accedere. Mai in localStorage.
import { normalizeInviteCode } from '../../core/validate.js';

const KEY = 'ale.invite';

export function rememberInviteCode(code) {
  const c = normalizeInviteCode(code);
  try { if (c) sessionStorage.setItem(KEY, c); } catch { /* storage non disponibile */ }
}

export function pendingInviteCode() {
  try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; }
}

export function forgetInviteCode() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignora */ }
}
