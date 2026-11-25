// Service worker di ALE. — app shell offline.
// Tutti i percorsi sono relativi alla posizione di questo file (lo scope = sottopercorso del sito).
const VERSION = 'v1';
const CACHE = `ale-shell-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  '404.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/base.css',
  'js/main.js',
  'js/config.js',
  'js/core/theme.js',
  'js/core/theme-init.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/icons/apple-touch-icon.png',
];

const scopeUrl = new URL(self.registration.scope);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL.map((p) => new URL(p, scopeUrl).toString())))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ale-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Mai in cache: tutto ciò che non è del nostro sito (Supabase, Auth, Edge Functions, CDN).
  if (url.origin !== scopeUrl.origin || !url.pathname.startsWith(scopeUrl.pathname)) return;

  // Navigazioni: rete prima, shell in cache se offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(new URL('index.html', scopeUrl).toString()))
    );
    return;
  }

  // Statici: stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
