// Logica pura del PIN (nessuna dipendenza): usata dall'Edge Function `access` e dai test Node.
// PIN di 6 cifre, hash PBKDF2-SHA256 con sale casuale, confronto a tempo costante, blocco progressivo.

export const PIN_LENGTH = 6;
export const PBKDF2_ITERATIONS = 150_000;
export const MAX_FAILED = 5;

export const isValidPin = (pin) => typeof pin === 'string' && /^\d{6}$/.test(pin);

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function newSalt() {
  return b64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPin(pin, saltB64) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: PBKDF2_ITERATIONS }, key, 256);
  return b64(new Uint8Array(bits));
}

/** Confronto a tempo costante tra due stringhe. */
export function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function verifyPin(pin, saltB64, expectedHash) {
  if (!isValidPin(pin)) return false;
  return safeEqual(await hashPin(pin, saltB64), expectedHash);
}

/** Secondi di blocco dopo MAX_FAILED errori: 1 min, 5 min, 15 min, 1 h, 6 h, 24 h (poi resta 24 h). */
export function lockSeconds(level) {
  const steps = [60, 300, 900, 3600, 21600, 86400];
  return steps[Math.min(Math.max(level, 1), steps.length) - 1];
}

/**
 * Esito di un tentativo: dato lo stato salvato e se il PIN era giusto, restituisce il nuovo stato.
 * state = { failed_attempts, lock_level, locked_until (Date|null) }
 */
export function afterAttempt(state, ok, now = new Date()) {
  if (ok) return { failed_attempts: 0, lock_level: 0, locked_until: null };
  const failed = (state.failed_attempts ?? 0) + 1;
  if (failed < MAX_FAILED) return { failed_attempts: failed, lock_level: state.lock_level ?? 0, locked_until: state.locked_until ?? null };
  const level = (state.lock_level ?? 0) + 1;
  return { failed_attempts: 0, lock_level: level, locked_until: new Date(now.getTime() + lockSeconds(level) * 1000) };
}

export const isLocked = (state, now = new Date()) => Boolean(state.locked_until) && new Date(state.locked_until) > now;
export const retryAfter = (state, now = new Date()) =>
  Math.max(0, Math.ceil((new Date(state.locked_until).getTime() - now.getTime()) / 1000));

export function checkSetupCode(expected, given) {
  if (!expected) return true; // nessun codice di configurazione impostato
  return typeof given === 'string' && safeEqual(given.trim().toUpperCase(), String(expected).trim().toUpperCase());
}

export const ROLES = ['alessia', 'phill'];
export const DEFAULT_NAMES = { alessia: 'Alessia', phill: 'Phill' };
/** Indirizzo interno dell'identità (mai mostrato, non riceve posta). */
export const internalEmail = (role) => `${role}@ale-app.local`;
