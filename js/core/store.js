// Stato minimale dell'app con sottoscrizioni.
const state = {
  ready: false,        // sessione iniziale risolta
  session: null,
  profile: null,       // { id, role, display_name, avatar_path }
  partnership: null,   // collegamento attivo o null
  partner: null,       // profilo del partner (se collegato)
  recovery: false,     // l'utente è arrivato da un link di recupero password
  online: true,
};
const subscribers = new Set();

export const getState = () => state;

export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of subscribers) fn(state);
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function resetUserData() {
  setState({ session: null, profile: null, partnership: null, partner: null, recovery: false });
}
