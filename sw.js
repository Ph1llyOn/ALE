// Service worker di ALE. — app shell offline.
// Tutti i percorsi sono relativi alla posizione di questo file (lo scope = sottopercorso del sito).
const VERSION = 'v20';
const CACHE = `ale-shell-${VERSION}`;

const SHELL = [
  './',
  '404.html',
  'assets/exercises/ankle-leg-raise.svg',
  'assets/exercises/arm-circles.svg',
  'assets/exercises/ball-bridge.svg',
  'assets/exercises/ball-wall-squat.svg',
  'assets/exercises/band-pull-apart.svg',
  'assets/exercises/band-row.svg',
  'assets/exercises/bird-dog.svg',
  'assets/exercises/calf-raise.svg',
  'assets/exercises/cat-cow.svg',
  'assets/exercises/chair-squat.svg',
  'assets/exercises/chest-stretch.svg',
  'assets/exercises/child-pose.svg',
  'assets/exercises/crunch.svg',
  'assets/exercises/dead-bug.svg',
  'assets/exercises/deep-breathing.svg',
  'assets/exercises/donkey-kick.svg',
  'assets/exercises/dumbbell-curl.svg',
  'assets/exercises/dumbbell-press.svg',
  'assets/exercises/dumbbell-row.svg',
  'assets/exercises/easy-pedal.svg',
  'assets/exercises/elliptical-easy.svg',
  'assets/exercises/glute-bridge.svg',
  'assets/exercises/goblet-squat.svg',
  'assets/exercises/hamstring-stretch.svg',
  'assets/exercises/hip-circles.svg',
  'assets/exercises/incline-push-up.svg',
  'assets/exercises/jump-rope.svg',
  'assets/exercises/jumping-jack.svg',
  'assets/exercises/kettlebell-squat.svg',
  'assets/exercises/leg-raise-crunch.svg',
  'assets/exercises/lunge.svg',
  'assets/exercises/march.svg',
  'assets/exercises/medball-press.svg',
  'assets/exercises/plank-knees.svg',
  'assets/exercises/plank.svg',
  'assets/exercises/push-up-knees.svg',
  'assets/exercises/push-up.svg',
  'assets/exercises/quad-stretch.svg',
  'assets/exercises/reverse-crunch.svg',
  'assets/exercises/shoulder-rolls.svg',
  'assets/exercises/side-leg-raise.svg',
  'assets/exercises/single-leg-bridge.svg',
  'assets/exercises/squat.svg',
  'assets/exercises/step-jack.svg',
  'assets/exercises/step-up.svg',
  'assets/exercises/stepper-easy.svg',
  'assets/exercises/superman.svg',
  'assets/exercises/toe-taps.svg',
  'assets/exercises/treadmill-walk.svg',
  'assets/exercises/wall-push-up.svg',
  'assets/exercises/wall-sit.svg',
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
  'js/components/equipment-picker.js',
  'js/components/exercise-art.js',
  'js/components/icons.js',
  'js/components/message-card.js',
  'js/components/pin-pad.js',
  'js/components/profile-error.js',
  'js/components/push-dialog.js',
  'js/components/tabbar.js',
  'js/components/visuals.js',
  'js/config.js',
  'js/core/access-messages.js',
  'js/core/api-access.js',
  'js/core/api-activities.js',
  'js/core/api-ai.js',
  'js/core/api-base.js',
  'js/core/api-calendar.js',
  'js/core/api-journal.js',
  'js/core/api-messages.js',
  'js/core/api-partner.js',
  'js/core/api-personal.js',
  'js/core/api-privacy.js',
  'js/core/api-push.js',
  'js/core/api-settings.js',
  'js/core/api-training.js',
  'js/core/api.js',
  'js/core/chart.js',
  'js/core/errors.js',
  'js/core/format.js',
  'js/core/greeting.js',
  'js/core/moods.js',
  'js/core/push-health.js',
  'js/core/route-logic.js',
  'js/core/router.js',
  'js/core/session.js',
  'js/core/store.js',
  'js/core/supabase.js',
  'js/core/theme-init.js',
  'js/core/theme.js',
  'js/core/ui.js',
  'js/core/validate.js',
  'js/data/calendar-util.js',
  'js/data/exercise-catalog.js',
  'js/data/exercise-texts.js',
  'js/data/exercises-core.js',
  'js/data/exercises.js',
  'js/data/motivation.js',
  'js/data/planner-core.js',
  'js/data/prompts.js',
  'js/features/access/access.js',
  'js/features/activities/activities.js',
  'js/features/activities/session-core.js',
  'js/features/activities/session.js',
  'js/features/activities/workout-edit.js',
  'js/features/calendar/calendar.js',
  'js/features/equipment/equipment.js',
  'js/features/equipment/training-prefs.js',
  'js/features/home/home-alessia.js',
  'js/features/home/home-phill.js',
  'js/features/home/home.js',
  'js/features/journal/journal-edit.js',
  'js/features/journal/journal.js',
  'js/features/messages/inbox.js',
  'js/features/messages/phill-messages.js',
  'js/features/notifications/notifications.js',
  'js/features/onboarding/onboarding.js',
  'js/features/pairing/pairing.js',
  'js/features/partner/proposals.js',
  'js/features/partner/shared.js',
  'js/features/privacy/privacy.js',
  'js/features/profile/image.js',
  'js/features/profile/profile.js',
  'js/features/progress/progress.js',
  'js/features/settings/settings.js',
  'js/features/tutorial/tutorial.js',
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

// Notifiche push: il payload è JSON { title, body, link } inviato dal server (push-dispatch).
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  const title = typeof data.title === 'string' && data.title ? data.title : 'ALE.';
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : '',
    icon: new URL('assets/icons/icon-192.png', scopeUrl).toString(),
    badge: new URL('assets/icons/icon-192.png', scopeUrl).toString(),
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    data: { link: typeof data.url === 'string' && data.url.startsWith('#/') ? data.url : '#/notifiche' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.link ?? '#/', scopeUrl).toString();
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(scopeUrl.toString())) { await w.focus(); w.navigate?.(target); return; }
    }
    await self.clients.openWindow(target);
  })());
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
