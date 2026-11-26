// Controllo dell'integrità delle notifiche push.
//
// Perché esiste: una subscription push può "morire" senza che l'app se ne accorga (cache o dati del sito cancellati, service
// worker rimosso, chiave VAPID cambiata, permesso revocato, riga sparita dal server). Qui si guarda lo stato REALE letto dalle
// API del browser e da Supabase (mai da localStorage), si ripara in silenzio ciò che si può riparare senza l'utente e si
// avvisa solo quando serve davvero un suo gesto.
//
// Tutto ciò che tocca il browser o Supabase passa da `deps` (iniettabili): i test lo simulano con doppioni; in app si usano i
// valori reali (defaultDeps). Questo file non importa nulla di "browser-only" in modo statico, quindi gira anche in Node.
import { VAPID_PUBLIC_KEY, resolve } from '../config.js';

export const MIN_INTERVAL_MS = 20_000;
export const STATUS = Object.freeze({
  OK: 'ok', IDLE: 'idle', UNSUPPORTED: 'unsupported', UNCONFIGURED: 'unconfigured', UNKNOWN: 'unknown', BLOCKED: 'blocked',
  ASK: 'ask-permission', REPAIR_SW: 'repair-sw', REPAIR_SUB: 'repair-subscription', SYNC: 'sync-server', BROKEN: 'broken',
});
const REPAIRABLE = new Set([STATUS.REPAIR_SW, STATUS.REPAIR_SUB, STATUS.SYNC]);

// ------------------------------------------------------------------------------------------------ utilità pure

export function keyToBytes(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/** La subscription è utilizzabile? Endpoint https e (se il browser la espone) chiave applicationServerKey uguale alla VAPID pubblica. */
export function isSubscriptionValid(sub, vapidKey) {
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint)) return false;
  const k = sub.options?.applicationServerKey;
  if (!k || !vapidKey) return true; // il browser non la espone: non si può smentire, quindi non si scarta
  return sameBytes(new Uint8Array(k), keyToBytes(vapidKey));
}

export function isIosNotInstalled(nav, matchMedia) {
  if (!nav || !/iPhone|iPad|iPod/.test(nav.userAgent ?? '')) return false;
  return !(nav.standalone || matchMedia?.('(display-mode: standalone)')?.matches);
}

/**
 * Funzione PURA: dagli input raccolti alla diagnosi. Nessun accesso a browser, rete o storage.
 * Ritorna { status, problems, action }. Solo ask-permission, blocked, install-app e broken richiedono l'utente.
 */
export function diagnosePush(i) {
  const out = (status, problems = [], action = 'none') => ({ status, problems, action });
  const server = Array.isArray(i.serverEndpoints) ? i.serverEndpoints : [];
  if (!i.supported) {
    return i.everEnabled && i.iosNotInstalled
      ? out(STATUS.UNSUPPORTED, ['ios-not-installed'], 'install-app')
      : out(STATUS.UNSUPPORTED);
  }
  if (!i.vapidConfigured) return out(STATUS.UNCONFIGURED);
  if (i.pushPreferenceWanted === false) return out(STATUS.IDLE); // nessuna preferenza attiva: niente da proteggere
  if (i.permission === 'denied') {
    return i.everEnabled ? out(STATUS.BLOCKED, ['permission-denied'], 'open-settings') : out(STATUS.IDLE);
  }
  if (i.permission !== 'granted') {
    return i.everEnabled ? out(STATUS.ASK, ['permission-not-granted'], STATUS.ASK) : out(STATUS.IDLE);
  }
  // permesso concesso. Se non le ha mai volute (nessuna traccia di attivazione) non si iscrive nessuno di nascosto.
  if (!i.everEnabled) return out(STATUS.IDLE);
  if (!i.swRegistered) return out(STATUS.REPAIR_SW, ['service-worker-missing'], STATUS.REPAIR_SW);
  if (!i.localSubscription) return out(STATUS.REPAIR_SUB, ['subscription-missing'], STATUS.REPAIR_SUB);
  if (!i.subscriptionValid) return out(STATUS.REPAIR_SUB, ['subscription-invalid'], STATUS.REPAIR_SUB);
  if (!server.includes(i.localSubscription.endpoint)) return out(STATUS.SYNC, ['server-missing'], STATUS.SYNC);
  return out(STATUS.OK);
}

export const needsUser = (d) => d?.status === STATUS.BLOCKED || d?.status === STATUS.ASK || d?.status === STATUS.BROKEN
  || (d?.status === STATUS.UNSUPPORTED && d.action === 'install-app');

// ------------------------------------------------------------------------------------------------ dipendenze

const lazyApi = {
  listEndpoints: async (...a) => (await import('./api-push.js')).listEndpoints(...a),
  saveSubscription: async (...a) => (await import('./api-push.js')).saveSubscription(...a),
  deleteEndpoint: async (...a) => (await import('./api-push.js')).deleteEndpoint(...a),
  pushPreferenceWanted: async (...a) => (await import('./api-push.js')).pushPreferenceWanted(...a),
};

/** Dipendenze reali (browser). Chi chiama può sovrascrivere solo alcune voci passando `deps`. */
export function defaultDeps(over = {}) {
  const nav = globalThis.navigator;
  return {
    navigator: nav,
    Notification: globalThis.Notification,
    hasPushManager: 'PushManager' in globalThis,
    matchMedia: globalThis.matchMedia?.bind(globalThis),
    vapidKey: VAPID_PUBLIC_KEY,
    api: lazyApi,
    registerSW: async () => {
      await nav.serviceWorker.register(resolve('sw.js'), { scope: resolve('./') });
      return Promise.race([nav.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('sw-timeout')), 10_000))]);
    },
    ...over,
  };
}
const withDefaults = (deps) => defaultDeps(deps);

// ------------------------------------------------------------------------------------------------ (b) raccolta dati reali

/**
 * Raccoglie lo stato vero (permesso, service worker, subscription, endpoint sul server) e lo passa a diagnosePush.
 * Il risultato include `inputs` (ciò che è stato letto) per il ripristino. Se il server non risponde: status 'unknown', niente azioni.
 */
export async function checkPushHealth({ userId, deps } = {}) {
  const d = withDefaults(deps);
  const nav = d.navigator;
  const supported = Boolean(nav && 'serviceWorker' in nav && d.hasPushManager && d.Notification);
  const iosNotInstalled = isIosNotInstalled(nav, d.matchMedia);
  const inputs = {
    supported, iosNotInstalled, vapidConfigured: Boolean(d.vapidKey), permission: supported ? d.Notification.permission : 'default',
    swRegistered: false, localSubscription: null, subscriptionValid: false, serverEndpoints: [], everEnabled: false, pushPreferenceWanted: true,
  };
  if (supported) {
    let reg = null;
    try { reg = (await nav.serviceWorker.getRegistration()) ?? null; } catch { reg = null; }
    inputs.swRegistered = Boolean(reg);
    if (reg) {
      let sub = null;
      try { sub = (await reg.pushManager.getSubscription()) ?? null; } catch { sub = null; }
      inputs.localSubscription = sub ? { endpoint: sub.endpoint } : null;
      inputs.subscriptionValid = isSubscriptionValid(sub, d.vapidKey);
    }
  }
  if ((supported || iosNotInstalled) && inputs.vapidConfigured && userId) {
    try { inputs.serverEndpoints = await d.api.listEndpoints(userId); }
    catch { return { status: STATUS.UNKNOWN, problems: ['server-unreachable'], action: 'none', inputs }; }
    try { inputs.pushPreferenceWanted = (await d.api.pushPreferenceWanted?.(userId)) !== false; } catch { inputs.pushPreferenceWanted = true; }
  }
  inputs.everEnabled = inputs.serverEndpoints.length > 0 || (inputs.permission === 'granted' && Boolean(inputs.localSubscription));
  return { ...diagnosePush(inputs), inputs };
}

// ------------------------------------------------------------------------------------------------ (c) ripristino

export class PushRepairError extends Error {
  constructor(code, cause) { super(code); this.code = code; this.cause = cause; }
}

/**
 * Porta la subscription locale a uno stato sano e allineato al server, senza duplicati:
 * - subscription non valida (chiave VAPID diversa, endpoint non https): tolta dal browser e il SUO endpoint dal server;
 * - subscription assente: ne viene creata una sola;
 * - riga sul server già presente per quell'endpoint: non si reinserisce.
 * Non chiede mai il permesso (richiede un gesto dell'utente: lo fa enablePush).
 */
export async function ensureSubscription(reg, { userId, serverEndpoints = [], deps }) {
  const d = withDefaults(deps);
  const actions = [];
  let sub = await reg.pushManager.getSubscription();
  if (sub && !isSubscriptionValid(sub, d.vapidKey)) {
    const old = sub.endpoint;
    let removed;
    try { removed = await sub.unsubscribe(); } catch (e) { throw new PushRepairError('unsubscribe-failed', e); }
    if (removed === false) throw new PushRepairError('unsubscribe-failed');
    actions.push('unsubscribed-old');
    try { await d.api.deleteEndpoint(old); actions.push('removed-old-from-server'); }
    catch { actions.push('old-server-row-pending'); } // la ripulirà il server al primo invio (404/410)
    sub = null;
  }
  if (!sub) {
    try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(d.vapidKey) }); }
    catch (e) { throw new PushRepairError('subscribe-failed', e); }
    actions.push('subscribed');
  }
  if (!serverEndpoints.includes(sub.endpoint)) {
    try { await d.api.saveSubscription(userId, sub); } catch (e) { throw new PushRepairError('server-error', e); }
    actions.push('saved-on-server');
  }
  return { sub, actions };
}

/** Ripristino automatico (senza gesto): registra il service worker se manca, ricrea/riallinea la subscription. Mai richiede il permesso. */
export async function repairPush(result, { userId, deps } = {}) {
  const d = withDefaults(deps);
  if (!result || !REPAIRABLE.has(result.status) || !userId) return { ok: true, actions: [] };
  if (d.Notification?.permission !== 'granted') return { ok: true, actions: [] }; // doppia cautela: mai senza permesso
  const actions = [];
  try {
    let reg = await d.navigator.serviceWorker.getRegistration();
    if (!reg) {
      try { reg = await d.registerSW(); } catch (e) { throw new PushRepairError('sw-register-failed', e); }
      actions.push('registered-sw');
    }
    const r = await ensureSubscription(reg, { userId, serverEndpoints: result.inputs?.serverEndpoints ?? [], deps: d });
    return { ok: true, actions: [...actions, ...r.actions] };
  } catch (e) {
    return { ok: false, actions, error: e instanceof PushRepairError ? e.code : 'unexpected', cause: e };
  }
}

// ------------------------------------------------------------------------------------------------ (d) monitor

/**
 * Esegue il controllo all'avvio e ogni volta che l'app torna visibile (al massimo ogni `minIntervalMs`, mai due insieme).
 * `onProblem(diagnosi)` solo se serve l'utente; `onClear()` quando il problema è sparito (per chiudere il popup).
 */
export function startPushMonitor({ userId, onProblem, onClear, deps, doc = globalThis.document, minIntervalMs = MIN_INTERVAL_MS, now = Date.now } = {}) {
  const d = withDefaults(deps);
  let last = -Infinity; let running = null; let stopped = false;

  async function cycle() {
    let diag = await checkPushHealth({ userId, deps: d });
    let failure = null;
    if (REPAIRABLE.has(diag.status)) {
      const r = await repairPush(diag, { userId, deps: d });
      if (!r.ok) failure = r;
      diag = await checkPushHealth({ userId, deps: d });
    }
    if (stopped) return diag;
    if (failure && REPAIRABLE.has(diag.status) && ['subscribe-failed', 'unsubscribe-failed', 'sw-register-failed'].includes(failure.error)) {
      diag = { status: STATUS.BROKEN, problems: [failure.error], action: 'retry', inputs: diag.inputs };
    }
    if (needsUser(diag)) onProblem?.(diag);
    else onClear?.(diag);
    return diag;
  }

  function runNow(force = false) {
    if (stopped) return Promise.resolve(null);
    if (running) return running; // niente esecuzioni concorrenti
    if (!force && now() - last < minIntervalMs) return Promise.resolve(null);
    last = now();
    running = cycle().catch((err) => { console.warn('Controllo notifiche non riuscito', err); return null; }).finally(() => { running = null; });
    return running;
  }

  const onVisibility = () => { if (doc?.visibilityState === 'visible') runNow(false); };
  doc?.addEventListener?.('visibilitychange', onVisibility);
  runNow(true);
  return { runNow, stop() { stopped = true; doc?.removeEventListener?.('visibilitychange', onVisibility); } };
}
