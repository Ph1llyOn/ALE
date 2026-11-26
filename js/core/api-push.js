// Notifiche Web Push: iscrizione del dispositivo. Funziona solo se il browser lo supporta (su iPhone: app installata nella
// schermata Home, iOS 16.4+) e se sul server sono state configurate le chiavi VAPID.
import { VAPID_PUBLIC_KEY } from '../config.js';
import { sb } from './supabase.js';
import { fail, AppError } from './api-base.js';

export const pushConfigured = () => Boolean(VAPID_PUBLIC_KEY);
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushPermission = () => (pushSupported() ? Notification.permission : 'unsupported');

const toKey = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
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

/** Chiede il permesso e iscrive questo dispositivo. Va chiamata da un gesto dell'utente (un tocco). */
export async function enablePush(userId) {
  if (!pushSupported()) throw new AppError('Questo dispositivo non può ricevere notifiche.');
  if (!pushConfigured()) throw new AppError('Le notifiche non sono ancora attive. Riprova più avanti.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new AppError('Per ricevere le notifiche, permettile dalle impostazioni del dispositivo.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) });
  const json = sub.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? toB64(sub.getKey('p256dh')), auth: json.keys?.auth ?? toB64(sub.getKey('auth')), label: deviceLabel() },
    { onConflict: 'endpoint', ignoreDuplicates: true });
  if (error) fail(error);
  return sub;
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
