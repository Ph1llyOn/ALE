// Edge Function `access` — accesso privato di ALE. senza email e password.
//   POST { action: 'status' }
//   POST { action: 'claim',  role, pin, setup_code?, display_name? }   prima configurazione di un profilo
//   POST { action: 'enter',  role, pin }                               ingresso su un dispositivo
//   POST { action: 'change_pin', old_pin, new_pin }  (con Authorization: Bearer <JWT dell'utente>)
// Risposta di claim/enter: { token_hash, type } da passare a supabase.auth.verifyOtp() nel client.
// Sicurezza: PIN con hash PBKDF2, blocco progressivo, creazione utenti solo qui (la registrazione pubblica è chiusa).
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  isValidPin, newSalt, hashPin, verifyPin, afterAttempt, isLocked, retryAfter, checkSetupCode,
  ROLES, DEFAULT_NAMES, internalEmail,
} from '../_shared/pin.js';

const ALLOWED_ORIGINS = (Deno.env.get('ALE_ALLOWED_ORIGINS') ??
  'https://ph1llyon.github.io,http://localhost:8080,http://127.0.0.1:8080').split(',');

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'access-control-allow-origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'origin',
  };
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'content-type': 'application/json' } });

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Token monouso che il client scambia con una sessione (nessuna email viene inviata). */
async function issueToken(sb: ReturnType<typeof admin>, role: string) {
  const { data, error } = await sb.auth.admin.generateLink({ type: 'magiclink', email: internalEmail(role) });
  if (error || !data?.properties?.hashed_token) throw new Error('token non emesso');
  return { token_hash: data.properties.hashed_token, type: 'magiclink' };
}

async function status(sb: ReturnType<typeof admin>) {
  const { data } = await sb.from('access_pins').select('role');
  const claimed = new Set((data ?? []).map((r: { role: string }) => r.role));
  return { alessia: claimed.has('alessia'), phill: claimed.has('phill'), setup_code_required: Boolean(Deno.env.get('ALE_SETUP_CODE')) };
}

async function attemptPin(sb: ReturnType<typeof admin>, role: string, pin: string) {
  const { data: row } = await sb.from('access_pins').select('*').eq('role', role).maybeSingle();
  if (!row) return { status: 404, body: { error: 'not_claimed' } };
  if (isLocked(row)) return { status: 429, body: { error: 'locked', retry_after: retryAfter(row) } };
  const ok = await verifyPin(pin, row.salt, row.hash);
  const next = afterAttempt(row, ok);
  await sb.from('access_pins').update({
    failed_attempts: next.failed_attempts, lock_level: next.lock_level,
    locked_until: next.locked_until ? next.locked_until.toISOString() : null, updated_at: new Date().toISOString(),
  }).eq('role', role);
  if (!ok) {
    const locked = Boolean(next.locked_until);
    return { status: locked ? 429 : 401, body: locked
      ? { error: 'locked', retry_after: retryAfter(next) }
      : { error: 'wrong_pin', attempts_left: 5 - next.failed_attempts } };
  }
  return { status: 200, body: { ok: true, user_id: row.user_id } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: 'bad_request' }, 400); }
  const sb = admin();
  const action = String(body.action ?? '');

  try {
    if (action === 'status') return json(req, await status(sb));

    if (action === 'claim') {
      const role = String(body.role ?? '');
      const pin = String(body.pin ?? '');
      if (!ROLES.includes(role)) return json(req, { error: 'invalid_role' }, 400);
      if (!isValidPin(pin)) return json(req, { error: 'invalid_pin' }, 400);
      if (!checkSetupCode(Deno.env.get('ALE_SETUP_CODE'), body.setup_code as string)) return json(req, { error: 'wrong_setup_code' }, 403);
      const { data: existing } = await sb.from('access_pins').select('role').eq('role', role).maybeSingle();
      if (existing) return json(req, { error: 'already_claimed' }, 409);

      const name = String(body.display_name ?? '').trim().slice(0, 40) || DEFAULT_NAMES[role as 'alessia' | 'phill'];
      const randomPassword = crypto.randomUUID() + crypto.randomUUID(); // nessuno la conosce: si entra solo dal PIN
      const { data: created, error: createError } = await sb.auth.admin.createUser({
        email: internalEmail(role), password: randomPassword, email_confirm: true,
        user_metadata: { role, display_name: name },
      });
      if (createError || !created?.user) return json(req, { error: 'create_failed' }, 500);

      const salt = newSalt();
      const { error: pinError } = await sb.from('access_pins').insert({ role, user_id: created.user.id, salt, hash: await hashPin(pin, salt) });
      if (pinError) { await sb.auth.admin.deleteUser(created.user.id); return json(req, { error: 'already_claimed' }, 409); }

      // Collegamento automatico 1:1 quando entrambi i profili esistono.
      const { data: others } = await sb.from('access_pins').select('role, user_id').neq('role', role);
      if (others?.length) {
        const a = role === 'alessia' ? created.user.id : others[0].user_id;
        const p = role === 'phill' ? created.user.id : others[0].user_id;
        await sb.from('partnerships').insert({ alessia_id: a, phill_id: p });
      }
      return json(req, await issueToken(sb, role));
    }

    if (action === 'enter') {
      const role = String(body.role ?? '');
      if (!ROLES.includes(role)) return json(req, { error: 'invalid_role' }, 400);
      const result = await attemptPin(sb, role, String(body.pin ?? ''));
      if (result.status !== 200) return json(req, result.body, result.status);
      return json(req, await issueToken(sb, role));
    }

    if (action === 'change_pin') {
      const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data: u } = await sb.auth.getUser(jwt);
      if (!u?.user) return json(req, { error: 'unauthenticated' }, 401);
      if (!isValidPin(String(body.new_pin ?? ''))) return json(req, { error: 'invalid_pin' }, 400);
      const { data: row } = await sb.from('access_pins').select('role').eq('user_id', u.user.id).maybeSingle();
      if (!row) return json(req, { error: 'not_claimed' }, 404);
      const result = await attemptPin(sb, row.role, String(body.old_pin ?? ''));
      if (result.status !== 200) return json(req, result.body, result.status);
      const salt = newSalt();
      await sb.from('access_pins').update({ salt, hash: await hashPin(String(body.new_pin), salt), updated_at: new Date().toISOString() }).eq('role', row.role);
      return json(req, { ok: true });
    }

    return json(req, { error: 'unknown_action' }, 400);
  } catch (err) {
    console.error('access error', err);
    return json(req, { error: 'server_error' }, 500);
  }
});
