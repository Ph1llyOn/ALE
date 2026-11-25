// Service worker di ALE. — app shell offline.
// Tutti i percorsi sono relativi alla posizione di questo file (lo scope = sottopercorso del sito).
const VERSION = 'v8';
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
  'css/screens.css',
  'css/tokens.css',
  'index.html',
  'js/components/controls.js',
  'js/components/icons.js',
  'js/components/message-card.js',
  'js/components/pin-pad.js',
  'js/components/profile-error.js',
  'js/components/tabbar.js',
  'js/config.js',
  'js/core/access-messages.js',
  'js/core/api-access.js',
  'js/core/api-base.js',
  'js/core/api-messages.js',
  'js/core/api-partner.js',
  'js/core/api-personal.js',
  'js/core/api-privacy.js',
  'js/core/api.js',
  'js/core/chart.js',
  'js/core/errors.js',
  'js/core/format.js',
  'js/core/greeting.js',
  'js/core/moods.js',
  'js/core/route-logic.js',
  'js/core/router.js',
  'js/core/session.js',
  'js/core/store.js',
  'js/core/supabase.js',
  'js/core/theme-init.js',
  'js/core/theme.js',
  'js/core/ui.js',
  'js/core/validate.js',
  'js/features/access/access.js',
  'js/features/equipment/equipment.js',
  'js/features/home/home-alessia.js',
  'js/features/home/home-phill.js',
  'js/features/home/home.js',
  'js/features/messages/inbox.js',
  'js/features/messages/phill-messages.js',
  'js/features/pairing/pairing.js',
  'js/features/privacy/privacy.js',
  'js/features/profile/image.js',
  'js/features/profile/profile.js',
  'js/features/progress/progress.js',
  'js/features/sections/sections.js',
  'js/features/wellbeing/wellbeing.js',
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
    // cache: 'no-cache' = rivalida sempre con il server (richiesta condizionale, 304 se invariato): così una nuova
    // versione pubblicata su GitHub Pages (che dichiara 10 minuti di cache) arriva subito e i file restano coerenti.
    fetch(req, { cache: 'no-cache' }).then((res) => { clearTimeout(timer); resolve(res); }, (err) => { clearTimeout(timer); reject(err); });
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
