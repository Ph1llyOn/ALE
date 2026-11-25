// Logica delle rotte pura (senza DOM): testabile e riusata dal router.
// Object.create(null): nessuna chiave ereditata (es. "constructor", "__proto__" non sono rotte).
export const ROUTES = Object.assign(Object.create(null), {
  '/scegli': 'guest',
  // area autenticata
  '/home': 'auth',
  '/profilo': 'auth',
  '/profilo/collegamento': 'auth',
  '/profilo/privacy': 'auth',
  // sezioni di Alessia
  '/attivita': 'auth',
  '/calendario': 'auth',
  '/diario': 'auth',
  '/biglietti': 'auth',
  '/profilo/benessere': 'auth',
  '/profilo/progressi': 'auth',
  '/profilo/attrezzatura': 'auth',
  // area di Phill
  '/messaggi': 'auth',
});

/** Rotte riservate a un ruolo (le altre sono per entrambi). Il database resta la vera barriera. */
export const ROUTE_ROLES = Object.assign(Object.create(null), {
  '/attivita': 'alessia',
  '/calendario': 'alessia',
  '/diario': 'alessia',
  '/biglietti': 'alessia',
  '/profilo/benessere': 'alessia',
  '/profilo/progressi': 'alessia',
  '/profilo/attrezzatura': 'alessia',
  '/messaggi': 'phill',
});

/** "#/invito?codice=ABC" → { path: '/invito', query: { codice: 'ABC' } } */
export function parseHash(hash) {
  let h = String(hash ?? '').replace(/^#/, '');
  if (!h.startsWith('/')) h = '/' + h;
  const [rawPath, rawQuery = ''] = h.split('?');
  const path = rawPath.replace(/\/+$/, '') || '/';
  const query = Object.fromEntries(new URLSearchParams(rawQuery));
  return { path, query };
}

/**
 * Decide cosa mostrare. state = { session: bool, role?: 'alessia'|'phill' }.
 * Ritorna { redirect: '/percorso' } oppure { render: '/percorso' }.
 */
export function decide(path, { session, role }) {
  const home = session ? '/home' : '/scegli';
  if (path === '/' || path === '') return { redirect: home };
  const kind = ROUTES[path];
  if (!kind) return { redirect: home };

  if (kind === 'guest') return session ? { redirect: '/home' } : { render: path };
  if (kind === 'auth') {
    if (!session) return { redirect: '/scegli' };
    const needed = ROUTE_ROLES[path];
    if (needed && role && role !== needed) return { redirect: '/home' };
    return { render: path };
  }
  return { redirect: home };
}

/** Rotte dell'area autenticata (mostrano la barra di navigazione). */
export const isAppRoute = (path) => ROUTES[path] === 'auth';
