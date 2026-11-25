// Accesso privato: scelta del profilo + PIN, senza email e password.
// Il PIN è verificato dal server (Edge Function `access`); il browser riceve un token monouso e lo scambia con la sessione.
import { FUNCTIONS_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';
import { sb } from './supabase.js';
import { AppError } from './api-base.js';
import { accessMessage } from './access-messages.js';

export { accessMessage };

export const ROLE_INFO = {
  alessia: { role: 'alessia', label: 'ALE', emoji: '💗', name: 'Alessia', sub: 'Il tuo spazio' },
  phill: { role: 'phill', label: 'PHILL', emoji: '', name: 'Phill', sub: 'La tua area' },
};

export class AccessError extends AppError {
  constructor(message, { code, retryAfter, attemptsLeft } = {}) {
    super(message);
    this.name = 'AccessError';
    this.code = code;
    this.retryAfter = retryAfter;
    this.attemptsLeft = attemptsLeft;
  }
}

async function call(body, jwt) {
  let res;
  try {
    res = await fetch(`${FUNCTIONS_URL}/access`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AccessError('Non riesco a collegarmi. Controlla la connessione e riprova.', { code: 'network' });
  }
  let data = {};
  try { data = await res.json(); } catch { /* corpo non JSON */ }
  return { status: res.status, data };
}

function fail(status, data) {
  throw new AccessError(accessMessage(data.error, data), { code: data.error, retryAfter: data.retry_after, attemptsLeft: data.attempts_left });
}

/** Quali profili sono già configurati (e se serve un codice di configurazione). */
export async function getAccessStatus() {
  const { status, data } = await call({ action: 'status' });
  if (status !== 200) fail(status, data);
  return data;
}

async function openSession(tokenData) {
  const { error } = await sb.auth.verifyOtp({ token_hash: tokenData.token_hash, type: tokenData.type });
  if (error) throw new AccessError('Non è stato possibile aprire la sessione. Riprova.', { code: 'session' });
}

export async function enterProfile(role, pin) {
  const { status, data } = await call({ action: 'enter', role, pin });
  if (status !== 200) fail(status, data);
  await openSession(data);
}

export async function claimProfile({ role, pin, displayName, setupCode }) {
  const { status, data } = await call({ action: 'claim', role, pin, display_name: displayName, setup_code: setupCode });
  if (status !== 200) fail(status, data);
  await openSession(data);
}

export async function changePin(oldPin, newPin) {
  const { data: s } = await sb.auth.getSession();
  const jwt = s.session?.access_token;
  const { status, data } = await call({ action: 'change_pin', old_pin: oldPin, new_pin: newPin }, jwt);
  if (status !== 200) fail(status, data);
}
