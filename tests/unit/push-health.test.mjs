// Controllo integrità push: SCENARI SIMULATI con doppioni di browser e server (nessuna rete, nessun browser).
// Ciò che qui non si può provare (iPhone vero, permessi di sistema, consegna reale) è nei passi manuali del report.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diagnosePush, checkPushHealth, repairPush, startPushMonitor, isSubscriptionValid, keyToBytes, needsUser,
} from '../../js/core/push-health.js';

const VAPID = 'BGPfHm6o4E4oiN8TrcuEmVLaFjK_Nr9jNaFRVPS-PuX31eewXXfNFpoTemZFGqgb1UrbgFgdRq7nuJKefwbT7E8';
const OTHER = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url');
const U = 'user-1';
const bufOf = (b64) => keyToBytes(b64).buffer;

/** Mondo finto: browser (permesso, SW, subscription) + server (righe push_subscriptions). */
function world(o = {}) {
  const w = {
    permission: o.permission ?? 'granted', sw: o.sw ?? true, serverDown: o.serverDown ?? false, prefsWanted: o.prefsWanted ?? true,
    sub: o.sub ?? null, server: new Set(o.server ?? []), n: 0, log: [], subscribeError: o.subscribeError ?? null, vapid: o.vapid ?? VAPID,
  };
  const mkSub = (key) => {
    const s = {
      endpoint: `https://push.test/${++w.n}`, options: { applicationServerKey: bufOf(key) },
      unsubscribe: async () => { w.log.push(`unsub:${s.endpoint}`); if (w.sub === s) w.sub = null; return true; },
    };
    return s;
  };
  w.mkSub = mkSub;
  const pushManager = {
    getSubscription: async () => w.sub,
    subscribe: async ({ applicationServerKey }) => {
      w.log.push('subscribe');
      if (w.subscribeError) throw w.subscribeError;
      assert.deepEqual([...new Uint8Array(applicationServerKey)], [...keyToBytes(w.vapid)], 'si usa la VAPID pubblica');
      w.sub = mkSub(w.vapid); return w.sub;
    },
  };
  const reg = { pushManager };
  w.Notification = { get permission() { return w.permission; } };
  w.deps = {
    navigator: { userAgent: o.ua ?? 'Mozilla/5.0 (iPhone)', standalone: o.standalone ?? true, serviceWorker: { getRegistration: async () => (w.sw ? reg : undefined) } },
    Notification: w.Notification, hasPushManager: o.hasPushManager ?? true, matchMedia: () => ({ matches: false }), vapidKey: w.vapid,
    registerSW: async () => { w.log.push('registerSW'); w.sw = true; return reg; },
    api: {
      listEndpoints: async () => { if (w.serverDown) throw new Error('offline'); return [...w.server]; },
      saveSubscription: async (_u, s) => { w.log.push(`save:${s.endpoint}`); w.server.add(s.endpoint); },
      deleteEndpoint: async (ep) => { w.log.push(`del:${ep}`); w.server.delete(ep); },
      pushPreferenceWanted: async () => w.prefsWanted,
    },
  };
  return w;
}
const check = (w) => checkPushHealth({ userId: U, deps: w.deps });
const fix = async (w) => { const d = await check(w); return { d, r: await repairPush(d, { userId: U, deps: w.deps }) }; };

// --------------------------------------------------------------------------------------------- diagnosePush (pura)

const base = { supported: true, vapidConfigured: true, permission: 'granted', swRegistered: true, localSubscription: { endpoint: 'https://a/1' }, subscriptionValid: true,
  serverEndpoints: ['https://a/1'], everEnabled: true, pushPreferenceWanted: true };
const dx = (o) => diagnosePush({ ...base, ...o });

test('diagnosePush: tutti i casi', () => {
  assert.equal(dx({}).status, 'ok');
  assert.deepEqual(dx({ supported: false, everEnabled: false }), { status: 'unsupported', problems: [], action: 'none' });
  assert.equal(dx({ supported: false, everEnabled: true, iosNotInstalled: false }).action, 'none', 'non supportato senza iOS-non-installato: nessun popup');
  const ios = dx({ supported: false, everEnabled: true, iosNotInstalled: true });
  assert.deepEqual([ios.status, ios.action, needsUser(ios)], ['unsupported', 'install-app', true]);
  assert.deepEqual([dx({ permission: 'denied' }).status, dx({ permission: 'denied' }).action], ['blocked', 'open-settings']);
  assert.equal(dx({ permission: 'denied', everEnabled: false }).status, 'idle');
  assert.equal(dx({ permission: 'default' }).status, 'ask-permission');
  assert.equal(dx({ permission: 'default', everEnabled: false }).status, 'idle');
  assert.equal(dx({ swRegistered: false }).status, 'repair-sw');
  assert.equal(dx({ localSubscription: null }).status, 'repair-subscription');
  assert.equal(dx({ subscriptionValid: false }).status, 'repair-subscription');
  assert.equal(dx({ serverEndpoints: [] }).status, 'sync-server');
  assert.equal(dx({ serverEndpoints: ['https://a/altro'] }).status, 'sync-server', 'endpoint diverso sul server');
  assert.equal(dx({ vapidConfigured: false }).status, 'unconfigured');
  assert.equal(dx({ pushPreferenceWanted: false, permission: 'denied' }).status, 'idle', 'nessuna preferenza attiva: non si disturba');
  assert.equal(dx({ everEnabled: false, localSubscription: null }).status, 'idle', 'permesso concesso ma mai attivate: nessuna iscrizione di nascosto');
  for (const d of [dx({}), dx({ permission: 'default', everEnabled: false }), dx({ swRegistered: false }), dx({ serverEndpoints: [] })]) assert.equal(needsUser(d), false);
});

test('chiavi: confronto applicationServerKey con la VAPID', () => {
  assert.equal(isSubscriptionValid({ endpoint: 'https://x', options: { applicationServerKey: bufOf(VAPID) } }, VAPID), true);
  assert.equal(isSubscriptionValid({ endpoint: 'https://x', options: { applicationServerKey: bufOf(OTHER) } }, VAPID), false);
  assert.equal(isSubscriptionValid({ endpoint: 'http://x', options: { applicationServerKey: bufOf(VAPID) } }, VAPID), false, 'endpoint non https');
  assert.equal(isSubscriptionValid({ endpoint: 'https://x', options: {} }, VAPID), true, 'chiave non esposta: non si scarta');
  assert.equal(isSubscriptionValid(null, VAPID), false);
});

// --------------------------------------------------------------------------------------------- checkPushHealth / repairPush

test('tutto ok: nessun popup, nessuna scrittura', async () => {
  const sub = world().mkSub(VAPID);
  const w = world({ sub, server: [sub.endpoint] });
  const { d, r } = await fix(w);
  assert.equal(d.status, 'ok'); assert.deepEqual(r.actions, []); assert.deepEqual(w.log, []);
});

test('mai attivate: nessun popup e nessuna iscrizione, con permesso "default"', async () => {
  const w = world({ permission: 'default' });
  assert.equal((await check(w)).status, 'idle');
  const { r } = await fix(w);
  assert.deepEqual([r.actions, w.log], [[], []]);
});

test('cache cancellata (SW sparito) con permesso granted e riga sul server → SW registrato, subscription ricreata UNA volta, server aggiornato', async () => {
  const w = world({ sw: false, server: ['https://push.test/vecchio'] });
  const d = await check(w);
  assert.equal(d.status, 'repair-sw');
  const r = await repairPush(d, { userId: U, deps: w.deps });
  assert.equal(r.ok, true);
  assert.deepEqual(w.log.filter((l) => l === 'subscribe' || l === 'registerSW'), ['registerSW', 'subscribe']);
  assert.equal((await check(w)).status, 'ok');
  assert.equal(w.server.size, 2, 'il vecchio endpoint ignoto non si cancella: lo ripulisce il server al primo 404/410');
  const again = await fix(w);
  assert.deepEqual(again.r.actions, [], 'secondo passaggio: niente da fare, nessun doppione');
});

test('localStorage cancellato: la diagnosi non cambia (non viene letto)', async () => {
  const sub = world().mkSub(VAPID);
  const w = world({ sub, server: [sub.endpoint] });
  const before = await check(w);
  const store = new Map([['ale.qualcosa', '1']]);
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), clear: () => store.clear() };
  globalThis.sessionStorage = globalThis.localStorage;
  try { store.clear(); assert.deepEqual(await check(w), before); } finally { delete globalThis.localStorage; delete globalThis.sessionStorage; }
});

test('subscription mancante con permesso granted → ricreata una sola volta, anche con controlli ripetuti', async () => {
  const w = world({ server: ['https://push.test/old'] });
  await fix(w); await fix(w); await fix(w);
  assert.equal(w.log.filter((l) => l === 'subscribe').length, 1);
  assert.equal(w.log.filter((l) => l.startsWith('save:')).length, 1);
});

test('subscription con chiave VAPID diversa → tolta dal browser e dal server (solo la sua riga), nuova inserita', async () => {
  const w = world({ server: ['https://push.test/altro-dispositivo'] });
  const old = w.mkSub(OTHER); w.sub = old; w.server.add(old.endpoint);
  assert.equal((await check(w)).status, 'repair-subscription');
  const { r } = await fix(w);
  assert.equal(r.ok, true);
  assert.ok(w.log.includes(`unsub:${old.endpoint}`));
  assert.ok(w.log.includes(`del:${old.endpoint}`));
  assert.ok(!w.server.has(old.endpoint));
  assert.ok(w.server.has('https://push.test/altro-dispositivo'), 'l\'altro dispositivo non si tocca');
  assert.ok(w.server.has(w.sub.endpoint) && w.sub.endpoint !== old.endpoint);
  assert.equal(w.log.filter((l) => l.startsWith('del:')).length, 1);
  assert.equal((await check(w)).status, 'ok');
});

test('registrazione Supabase mancante → risincronizzata; se già presente non si reinserisce', async () => {
  const sub = world().mkSub(VAPID);
  const w = world({ sub, server: [] });
  const d = await check(w);
  assert.equal(d.status, 'sync-server');
  await repairPush(d, { userId: U, deps: w.deps });
  assert.deepEqual(w.log, [`save:${sub.endpoint}`]);
  assert.equal(w.log.filter((l) => l === 'subscribe').length, 0, 'la subscription locale resta quella');
  await fix(w);
  assert.equal(w.log.length, 1, 'nessun secondo inserimento');
});

test('permesso revocato → "blocked", nessun tentativo di aggirarlo', async () => {
  const w = world({ permission: 'denied', server: ['https://push.test/1'] });
  let asked = 0; w.Notification.requestPermission = async () => { asked++; return 'granted'; };
  const { d, r } = await fix(w);
  assert.deepEqual([d.status, d.action, needsUser(d)], ['blocked', 'open-settings', true]);
  assert.deepEqual([r.actions, w.log, asked], [[], [], 0]);
});

test('permesso "default" dopo che erano attive → ask-permission, mai richiesto senza gesto', async () => {
  const w = world({ permission: 'default', server: ['https://push.test/1'] });
  let asked = 0; w.Notification.requestPermission = async () => { asked++; };
  const { d, r } = await fix(w);
  assert.equal(d.status, 'ask-permission');
  assert.deepEqual([r.actions, w.log, asked], [[], [], 0]);
});

test('granted ma subscribe lancia errore → ripristino fallito, nessun doppione né scrittura sul server', async () => {
  const w = world({ subscribeError: new Error('push service error'), server: ['https://push.test/old'] });
  const { r } = await fix(w);
  assert.equal(r.ok, false); assert.equal(r.error, 'subscribe-failed');
  assert.deepEqual([...w.server], ['https://push.test/old']);
  assert.ok(!w.log.some((l) => l.startsWith('save:') || l.startsWith('del:')));
});

test('ritorno nell\'app dopo aver cambiato le impostazioni: denied → granted → ripristino automatico', async () => {
  const w = world({ permission: 'denied', server: ['https://push.test/vecchio'] });
  const calls = []; const clears = [];
  const doc = fakeDoc();
  const mon = startPushMonitor({ userId: U, deps: w.deps, doc, onProblem: (d) => calls.push(d.status), onClear: () => clears.push(1), minIntervalMs: 0 });
  await mon.runNow(true);
  assert.deepEqual(calls.slice(-1), ['blocked']);
  w.permission = 'granted'; // l'utente riattiva da Impostazioni e torna nell'app
  doc.visibilityState = 'visible'; doc.fire();
  await mon.runNow(true);
  assert.equal(w.sub?.endpoint !== undefined, true, 'subscription ricreata da sola');
  assert.ok(w.server.has(w.sub.endpoint));
  assert.ok(clears.length >= 1, 'il popup si chiude da solo');
  assert.equal((await check(w)).status, 'ok');
  mon.stop();
});

test('monitor: segnala il guasto persistente (broken) ma non quello silenzioso di rete', async () => {
  const w = world({ subscribeError: new Error('boom'), server: ['https://push.test/old'] });
  const calls = [];
  const mon = startPushMonitor({ userId: U, deps: w.deps, doc: fakeDoc(), onProblem: (d) => calls.push(d), minIntervalMs: 0 });
  await mon.runNow(true);
  assert.equal(calls.at(-1).status, 'broken');
  assert.equal(w.log.filter((l) => l === 'subscribe').length >= 1, true);
  mon.stop();
  // server irraggiungibile: stato "unknown", nessun popup, nessuna scrittura
  const off = world({ serverDown: true });
  const seen = [];
  const m2 = startPushMonitor({ userId: U, deps: off.deps, doc: fakeDoc(), onProblem: () => seen.push('p'), onClear: () => seen.push('c'), minIntervalMs: 0 });
  await m2.runNow(true);
  assert.equal((await check(off)).status, 'unknown'); assert.ok(!seen.includes('p')); assert.deepEqual(off.log, []);
  m2.stop();
});

test('non supportato (es. browser senza Push): nessun errore e nessun popup', async () => {
  const w = world({ hasPushManager: false, ua: 'Mozilla/5.0 (X11)' });
  const d = await check(w);
  assert.deepEqual([d.status, needsUser(d)], ['unsupported', false]);
  const ios = world({ hasPushManager: false, standalone: false, server: ['https://push.test/1'] });
  const di = await check(ios);
  assert.deepEqual([di.status, di.action], ['unsupported', 'install-app']);
});

// --------------------------------------------------------------------------------------------- monitor: frequenza e concorrenza

function fakeDoc() {
  const ls = new Set();
  return { visibilityState: 'visible', addEventListener: (_t, f) => ls.add(f), removeEventListener: (_t, f) => ls.delete(f), fire() { for (const f of [...ls]) f(); }, count: () => ls.size };
}

test('monitor: limite di frequenza (20 s) e nessuna esecuzione concorrente', async () => {
  const w = world({ permission: 'default' });
  let t = 1_000_000; let lists = 0; let release;
  const gate = new Promise((r) => { release = r; });
  w.deps.api.listEndpoints = async () => { lists++; await gate; return []; };
  const doc = fakeDoc();
  const mon = startPushMonitor({ userId: U, deps: w.deps, doc, now: () => t, onProblem() {}, onClear() {} }); // avvio: parte subito
  doc.fire(); doc.fire(); // mentre il primo giro è in corso: ignorati
  t += 30_000; doc.fire();
  await new Promise((r) => setImmediate(r));
  assert.equal(lists, 1, 'un solo giro alla volta');
  release(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  assert.equal(lists, 1);
  await mon.runNow(true); // giro forzato: azzera il conteggio dei 20 secondi
  assert.equal(lists, 2);
  t += 5_000; doc.fire(); await new Promise((r) => setImmediate(r));
  assert.equal(lists, 2, 'entro 20 secondi: nessun nuovo controllo');
  t += 16_000; doc.fire(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  assert.equal(lists, 3, 'dopo 20 secondi si ripete');
  doc.visibilityState = 'hidden'; t += 60_000; doc.fire(); await new Promise((r) => setImmediate(r));
  assert.equal(lists, 3, 'in background non si controlla');
  mon.stop();
  assert.equal(doc.count(), 0, 'stop rimuove l\'ascolto');
});
