// Accesso ai dati. Ogni funzione lancia AppError con un messaggio già in italiano.
import { sb } from './supabase.js';
import { rpcMessage } from './errors.js';
import { AppError, fail } from './api-base.js';

export { AppError };

export async function loadProfile(userId) {
  const { data, error } = await sb.from('profiles').select('id, role, display_name, avatar_path').eq('id', userId).maybeSingle();
  if (error) fail(error);
  return data;
}

/** Collegamento attivo (se c'è) e profilo del partner. */
export async function loadPartnership(userId) {
  const { data: p, error } = await sb.from('partnerships')
    .select('id, alessia_id, phill_id, status, created_at').eq('status', 'active').maybeSingle();
  if (error) fail(error);
  if (!p) return { partnership: null, partner: null };
  const partnerId = p.alessia_id === userId ? p.phill_id : p.alessia_id;
  const { data: partner, error: e2 } = await sb.from('profiles')
    .select('id, role, display_name, avatar_path').eq('id', partnerId).maybeSingle();
  if (e2) fail(e2);
  return { partnership: p, partner };
}

export async function updateDisplayName(userId, name) {
  const { data, error } = await sb.from('profiles').update({ display_name: name.trim() }).eq('id', userId).select('id, role, display_name, avatar_path').single();
  if (error) fail(error);
  return data;
}

// --- avatar -----------------------------------------------------------------
const urlCache = new Map(); // path -> { url, exp }

export async function avatarUrl(path) {
  if (!path) return null;
  const hit = urlCache.get(path);
  if (hit && hit.exp > Date.now() + 60_000) return hit.url;
  const { data, error } = await sb.storage.from('avatars').createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 3600_000 });
  return data.signedUrl;
}

export async function uploadAvatar(userId, blob, oldPath) {
  const path = `${userId}/${Date.now()}.jpg`;
  const up = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600' });
  if (up.error) fail(up.error);
  const { data, error } = await sb.from('profiles').update({ avatar_path: path }).eq('id', userId).select('id, role, display_name, avatar_path').single();
  if (error) {
    await sb.storage.from('avatars').remove([path]);
    fail(error);
  }
  if (oldPath && oldPath !== path) await sb.storage.from('avatars').remove([oldPath]); // pulizia, non bloccante
  return data;
}

export async function removeAvatar(userId, oldPath) {
  const { data, error } = await sb.from('profiles').update({ avatar_path: null }).eq('id', userId).select('id, role, display_name, avatar_path').single();
  if (error) fail(error);
  if (oldPath) await sb.storage.from('avatars').remove([oldPath]);
  return data;
}

// --- funzioni del database ----------------------------------------------------
export async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) fail(error);
  if (!data?.ok) throw new AppError(rpcMessage(data?.error), data);
  return data;
}

// --- sessione -----------------------------------------------------------------
export async function signOut() {
  const { error } = await sb.auth.signOut();
  if (error && error.name !== 'AuthSessionMissingError') {
    await sb.auth.signOut({ scope: 'local' }); // la sessione locale va chiusa comunque
  }
}
