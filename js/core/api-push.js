// Notifiche Web Push: iscrizione del dispositivo. Funziona solo se il browser lo supporta (su iPhone: app installata nella
// schermata Home, iOS 16.4+) e se sul server sono state configurate le chiavi VAPID.
import { VAPID_PUBLIC_KEY } from '../config.js';
import { sb } from './supabase.js';
import { fail, AppError } from './api-base.js';
import { ensureSubscription } from './push-health.js';
import { getNotificationPrefs } from './api-settings.js';

export const pushConfigured = () => Boolean(VAPID_PUBLIC_KEY);
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushPermission = () => (pushSupported() ? Notification.permission : 'unsupported');

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

export function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Dispositivo';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '';
  return `${os}${br ? ` · ${br}` : ''}`.slice(0, 60);
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Endpoint registrati sul server per questo utente (la RLS limita comunque alle sue righe). */
export async function listEndpoints(userId) {
  const { data, error } = await sb.from('push_subscriptions').select('endpoint').eq('user_id', userId);
  if (error) fail(error);
  return data.map((r) => r.endpoint);
}

/** Registra la subscription sul server SENZA duplicati: se l'endpoint c'è già, non fa nulla (ON CONFLICT DO NOTHING). */
export async function saveSubscription(userId, sub) {
  const json = sub.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? toB64(sub.getKey('p256dh')), auth: json.keys?.auth ?? toB64(sub.getKey('auth')), label: deviceLabel() },
    { onConflict: 'endpoint', ignoreDuplicates: true });
  if (error) fail(error);
}

/** Cancella dal server SOLO la riga di quell'endpoint (e solo se è dell'utente). */
export async function deleteEndpoint(endpoint) {
  const { error } = await sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) fail(error);
}

/** Almeno una preferenza di notifica è attiva? In caso di dubbio (errore di lettura) si considera di sì. */
export async function pushPreferenceWanted(userId) {
  const p = await getNotificationPrefs(userId);
  return Object.values(p).some((v) => v === true);
}

/** Chiede il permesso e iscrive questo dispositivo. Va chiamata da un gesto dell'utente (un tocco). */
export async function enablePush(userId) {
  if (!pushSupported()) throw new AppError('Questo dispositivo non può ricevere notifiche.');
  if (!pushConfigured()) throw new AppError('Le notifiche non sono ancora attive. Riprova più avanti.');
  const permission = await Notification.requestPermission(); // primo await: resta dentro il gesto dell'utente
  if (permission !== 'granted') throw new AppError('Per ricevere le notifiche, permettile dalle impostazioni del dispositivo.');
  const reg = await navigator.serviceWorker.ready;
  const api = { saveSubscription, deleteEndpoint };
  try {
    const { sub } = await ensureSubscription(reg, { userId, serverEndpoints: await listEndpoints(userId), deps: { vapidKey: VAPID_PUBLIC_KEY, api } });
    return sub;
  } catch (err) {
    if (err?.code === 'subscribe-failed') throw new AppError('Non riesco ad attivare le notifiche su questo dispositivo. Chiudi e riapri l’app, poi riprova.');
    throw err;
  }
}

export async function listDevices(userId) {
  const { data, error } = await sb.from('push_subscriptions').select('id, endpoint, label, created_at').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) fail(error);
  return data;
}

export async function removeDevice(device) {
  const { error } = await sb.from('push_subscriptions').delete().eq('id', device.id);
  if (error) fail(error);
  const sub = await currentSubscription();
  if (sub && sub.endpoint === device.endpoint) await sub.unsubscribe();
}
