// Service worker di ALE. — app shell offline.
// Tutti i percorsi sono relativi alla posizione di questo file (lo scope = sottopercorso del sito).
const VERSION = 'v4';
const CACHE = `ale-shell-${VERSION}`;

const SHELL = [
  './',
  '404.html',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'css/base.css',
  'css/components.css',
  'css/tokens.css',
  'index.html',
  'js/components/profile-error.js',
  'js/components/tabbar.js',
  'js/config.js',
  'js/core/api.js',
  'js/core/boot.js',
  'js/core/errors.js',
  'js/core/greeting.js',
  'js/core/route-logic.js',
  'js/core/router.js',
  'js/core/session.js',
  'js/core/store.js',
  'js/core/supabase.js',
  'js/core/theme-init.js',
  'js/core/theme.js',
  'js/core/ui.js',
  'js/core/validate.js',
  'js/features/auth/forgot.js',
  'js/features/auth/login.js',
  'js/features/auth/register.js',
  'js/features/auth/reset.js',
  'js/features/home/home.js',
  'js/features/pairing/invite-storage.js',
  'js/features/pairing/invite.js',
  'js/features/pairing/pairing.js',
  'js/features/profile/image.js',
  'js/features/profile/profile.js',
  'js/main.js',
  'js/vendor/supabase.umd.js',
  'manifest.webmanifest',
];

const scopeUrl = new URL(self.registration.scope);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((p) => new URL(p, scopeUrl).toString())))
      .then(() => self.skipWaiting()) // la nuova versione si attiva subito (la strategia "rete prima" evita file misti)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ale-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const NETWORK_TIMEOUT_MS = 4000; // con rete lenta/instabile si ripiega sulla cache

function fetchWithTimeout(req) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS);
    fetch(req).then((res) => { clearTimeout(timer); resolve(res); }, (err) => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Mai in cache: tutto ciò che non è del nostro sito (Supabase, Auth, Edge Functions, CDN).
  if (url.origin !== scopeUrl.origin || !url.pathname.startsWith(scopeUrl.pathname)) return;

  // Rete prima (così HTML, JS e CSS sono sempre della stessa versione), cache come ripiego offline.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetchWithTimeout(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (cached) return cached;
      if (req.mode === 'navigate') return (await cache.match(new URL('index.html', scopeUrl).toString())) || Response.error();
      return Response.error();
    }
  })());
});
