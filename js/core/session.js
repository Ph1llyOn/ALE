// Ciclo di vita della sessione: carica profilo e collegamento, reagisce agli eventi di Auth.
import { sb } from './supabase.js';
import { getState, setState, resetUserData } from './store.js';
import { loadProfile, loadPartnership } from './api.js';
import { render, navigate } from './router.js';

/** Carica i dati dell'utente. Non lancia: lo stato di errore è in store.loadError. */
export async function hydrate(session) {
  if (!session) { resetUserData(); return; }
  try {
    const profile = await loadProfile(session.user.id);
    const { partnership, partner } = profile ? await loadPartnership(session.user.id) : { partnership: null, partner: null };
    if (!profile) {
      // Sessione valida in locale ma nessun profilo: l'utente potrebbe non esistere più (account eliminato).
      // Si verifica lato server; se l'utente non c'è, la sessione locale viene chiusa.
      const { error } = await sb.auth.getUser();
      if (error && [401, 403, 404].includes(error.status)) {
        await sb.auth.signOut({ scope: 'local' });
        return;
      }
    }
    setState({ session, profile, partnership, partner, loadError: profile ? null : 'Profilo non trovato.' });
  } catch (err) {
    setState({ session, profile: null, partnership: null, partner: null, loadError: err.message });
  }
}

export async function refreshUserData() {
  const { session } = getState();
  await hydrate(session);
}

/** Avvia l'ascolto degli eventi di Auth. Restituisce una promessa risolta alla prima sessione nota. */
export function startSession() {
  let resolveReady;
  const ready = new Promise((r) => { resolveReady = r; });

  sb.auth.onAuthStateChange((event, session) => {
    // Non si chiamano API Supabase direttamente dentro la callback (rischio di deadlock): setTimeout.
    setTimeout(async () => {
      const prev = getState();
      if (event === 'INITIAL_SESSION') {
        await hydrate(session);
        setState({ ready: true });
        resolveReady();
      } else if (event === 'SIGNED_IN') {
        const same = prev.session?.user?.id === session?.user?.id && prev.profile;
        if (same) setState({ session }); // ritorno di focus/rinnovo: niente ricaricamenti inutili
        else { await hydrate(session); render(); }
      } else if (event === 'TOKEN_REFRESHED') {
        setState({ session });
      } else if (event === 'USER_UPDATED') {
        setState({ session });
      } else if (event === 'SIGNED_OUT') {
        resetUserData();
        navigate('/scegli', { replace: true });
        render();
      }
    }, 0);
  });

  return ready;
}

// Aggiorna profilo e collegamento quando l'app torna in primo piano (o torna la rete): se nel frattempo
// Phill si è collegato o ha cambiato nome, la schermata si aggiorna da sola. Al massimo una volta ogni 20 secondi.
let lastRefresh = Date.now();
export function startAutoRefresh() {
  const refreshIfStale = async () => {
    const s = getState();
    if (!s.session || document.visibilityState !== 'visible') return;
    if (Date.now() - lastRefresh < 20_000) return;
    lastRefresh = Date.now();
    const sig = (st) => `${st.partnership?.id}|${st.partner?.display_name}|${st.profile?.display_name}`;
    const before = sig(s);
    await refreshUserData();
    if (sig(getState()) !== before) render();
  };
  document.addEventListener('visibilitychange', refreshIfStale);
  window.addEventListener('focus', refreshIfStale);
  window.addEventListener('online', refreshIfStale);
}
