// Logica delle rotte pura (senza DOM): testabile e riusata dal router.
// Object.create(null): nessuna chiave ereditata (es. "constructor", "__proto__" non sono rotte).
export const ROUTES = Object.assign(Object.create(null), {
  '/accedi': 'guest',
  '/registrati': 'guest',
  '/password-dimenticata': 'guest',
  '/reimposta-password': 'recovery',
  '/invito': 'public',
  '/home': 'auth',
  '/profilo': 'auth',
  '/profilo/collegamento': 'auth',
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
 * Decide cosa mostrare. state = { session: bool, recovery: bool }.
 * Ritorna { redirect: '/percorso' } oppure { render: '/percorso' }.
 */
export function decide(path, { session, recovery }) {
  const home = session ? '/home' : '/accedi';
  if (path === '/' || path === '') return { redirect: home };
  const kind = ROUTES[path];
  if (!kind) return { redirect: home };

  if (recovery && session && path !== '/reimposta-password') return { redirect: '/reimposta-password' };
  if (kind === 'recovery') return recovery && session ? { render: path } : { redirect: home };
  if (kind === 'public') return { render: path };
  if (kind === 'guest') return session ? { redirect: '/home' } : { render: path };
  if (kind === 'auth') return session ? { render: path } : { redirect: '/accedi' };
  return { redirect: home };
}
