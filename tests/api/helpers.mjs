// Helper per i test API: parlano con lo stack Supabase LOCALE (mai con il progetto remoto).
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

function readStatus() {
  if (process.env.ALE_API_URL && process.env.ALE_PUBLISHABLE_KEY && process.env.ALE_SECRET_KEY) {
    return { API_URL: process.env.ALE_API_URL, PUBLISHABLE_KEY: process.env.ALE_PUBLISHABLE_KEY, SECRET_KEY: process.env.ALE_SECRET_KEY };
  }
  const out = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'],
  });
  const json = out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

const status = readStatus();
export const API_URL = status.API_URL;
export const PUBLISHABLE_KEY = status.PUBLISHABLE_KEY;
const SECRET_KEY = status.SECRET_KEY;
export const MAILPIT_URL = process.env.ALE_MAILPIT_URL || 'http://127.0.0.1:54324';

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(API_URL)) {
  throw new Error(`I test API devono puntare allo stack LOCALE, non a ${API_URL}`);
}

export const PASSWORD = 'Test-passw0rd-123456';

// `ws` serve solo ai test su Node < 22 (supabase-js richiede un WebSocket nativo per il modulo realtime).
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, realtime: { transport: WebSocket } };
export const anonClient = () => createClient(API_URL, PUBLISHABLE_KEY, opts);
export const adminClient = () => createClient(API_URL, SECRET_KEY, opts);

const created = [];
export const uniqueEmail = (tag) => `${tag}-${randomBytes(5).toString('hex')}@example.test`;

/** Registra un utente (conferma email disattivata in locale) e restituisce client già autenticato. */
export async function makeUser(role, name = `${role}-test`) {
  const email = uniqueEmail(role);
  const client = anonClient();
  const { data, error } = await client.auth.signUp({
    email, password: PASSWORD, options: { data: { role, display_name: name } },
  });
  if (error) throw new Error(`signUp fallita: ${error.message}`);
  if (!data.session) throw new Error('nessuna sessione dopo signUp (conferma email attiva in locale?)');
  created.push(data.user.id);
  return { client, id: data.user.id, email, role };
}

export async function cleanup() {
  const admin = adminClient();
  // Elimina prima gli oggetti storage via API (i DELETE diretti sono bloccati da Storage).
  for (const id of created.splice(0)) {
    const { data: files } = await admin.storage.from('avatars').list(id);
    if (files?.length) await admin.storage.from('avatars').remove(files.map((f) => `${id}/${f.name}`));
    await admin.auth.admin.deleteUser(id);
  }
}

export async function link(alessia, phill) {
  const inv = await alessia.client.rpc('create_invitation');
  assertOk(inv.data, 'create_invitation');
  const red = await phill.client.rpc('redeem_invitation', { p_code: inv.data.code });
  assertOk(red.data, 'redeem_invitation');
  return inv.data.code;
}

function assertOk(data, what) {
  if (!data?.ok) throw new Error(`${what} fallita: ${JSON.stringify(data)}`);
}

// PNG 1x1 valido
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** Legge da Mailpit l'ultimo messaggio inviato a un indirizzo. */
export async function lastMailTo(email, { tries = 20 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent('to:' + email)}`);
    const j = await r.json();
    if (j.messages?.length) {
      const m = await (await fetch(`${MAILPIT_URL}/api/v1/message/${j.messages[0].ID}`)).json();
      return m;
    }
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new Error(`nessuna email per ${email}`);
}
