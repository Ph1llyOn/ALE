// Accesso privato senza email e password: identità persistenti, PIN, blocco, impersonificazione, collegamento automatico.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  callFunction, resetAccess, sessionFrom, adminClient, anonClient, PUBLISHABLE_KEY, API_URL, cleanup,
} from './helpers.mjs';

const ALE_PIN = '246810';
const PHILL_PIN = '135790';
let ale; let phill;

before(resetAccess);
after(async () => { await resetAccess(); await cleanup(); });

const unlock = (role) => adminClient().from('access_pins').update({ locked_until: null, failed_attempts: 0 }).eq('role', role);

test('stato iniziale: nessun profilo configurato, nessun dato sensibile esposto', async () => {
  const r = await callFunction('access', { action: 'status' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { alessia: false, phill: false, setup_code_required: false });
});

test('prima configurazione: dati non validi rifiutati', async () => {
  for (const body of [
    { action: 'claim', role: 'admin', pin: ALE_PIN }, { action: 'claim', role: 'alessia', pin: '123' },
    { action: 'claim', role: 'alessia', pin: 'abcdef' }, { action: 'claim', pin: ALE_PIN }, { action: 'nope' },
  ]) {
    const r = await callFunction('access', body);
    assert.ok([400].includes(r.status), `${JSON.stringify(body)} → ${r.status}`);
  }
  const r = await callFunction('access', { action: 'status' });
  assert.equal(r.body.alessia, false, 'nessun profilo creato da richieste non valide');
});

test('claim di ALE: crea l\'identità, restituisce un token che diventa una sessione vera', async () => {
  const r = await callFunction('access', { action: 'claim', role: 'alessia', pin: ALE_PIN, display_name: 'Alessia' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.type, 'magiclink');
  assert.ok(r.body.token_hash);
  ale = await sessionFrom(r.body);
  assert.ok(ale.session.access_token);
  const prof = await ale.client.from('profiles').select('id, role, display_name').single();
  assert.equal(prof.data.role, 'alessia');
  assert.equal(prof.data.display_name, 'Alessia');
  assert.equal(prof.data.id, ale.user.id);
  // il token è monouso
  const again = await anonClient().auth.verifyOtp({ token_hash: r.body.token_hash, type: 'magiclink' });
  assert.ok(again.error, 'un token d\'accesso non si riusa');
});

test('un profilo già configurato non si può "riconfigurare" da altri', async () => {
  const r = await callFunction('access', { action: 'claim', role: 'alessia', pin: '999999' });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'already_claimed');
  const st = await callFunction('access', { action: 'status' });
  assert.deepEqual([st.body.alessia, st.body.phill], [true, false]);
  assert.ok(!JSON.stringify(st.body).match(/hash|salt|pin/i) || !st.body.hash, 'lo stato non espone hash');
});

test('PIN errato: tentativi limitati, poi blocco, anche per il PIN giusto', async () => {
  const wrong = await callFunction('access', { action: 'enter', role: 'alessia', pin: '000000' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error, 'wrong_pin');
  assert.equal(wrong.body.attempts_left, 4);
  for (let i = 0; i < 3; i++) assert.equal((await callFunction('access', { action: 'enter', role: 'alessia', pin: '111111' })).status, 401);
  const last = await callFunction('access', { action: 'enter', role: 'alessia', pin: '222222' });
  assert.equal(last.status, 429, 'al quinto errore scatta il blocco');
  assert.ok(last.body.retry_after > 0);
  const right = await callFunction('access', { action: 'enter', role: 'alessia', pin: ALE_PIN });
  assert.equal(right.status, 429, 'con il blocco attivo nemmeno il PIN giusto entra');
  assert.equal(right.body.error, 'locked');
});

test('ingresso da un secondo dispositivo: stessa identità di sempre, dati persistenti', async () => {
  await unlock('alessia');
  const before = await ale.client.from('journal_entries').insert({ owner_id: ale.user.id, body: 'Pensiero di Alessia' }).select().single();
  assert.equal(before.error, null, before.error?.message);
  const r = await callFunction('access', { action: 'enter', role: 'alessia', pin: ALE_PIN });
  assert.equal(r.status, 200);
  const device2 = await sessionFrom(r.body);
  assert.equal(device2.user.id, ale.user.id, 'stessa identità Supabase su un altro dispositivo');
  const mine = await device2.client.from('journal_entries').select('body');
  assert.deepEqual(mine.data.map((x) => x.body), ['Pensiero di Alessia'], 'gli stessi dati');
  // un successo azzera i contatori
  const row = await adminClient().from('access_pins').select('failed_attempts, lock_level').eq('role', 'alessia').single();
  assert.deepEqual(row.data, { failed_attempts: 0, lock_level: 0 });
});

test('claim di PHILL: collegamento automatico 1:1 con ALE, senza inviti', async () => {
  const r = await callFunction('access', { action: 'claim', role: 'phill', pin: PHILL_PIN, display_name: 'Phill' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  phill = await sessionFrom(r.body);
  const p = await phill.client.from('partnerships').select('alessia_id, phill_id, status').single();
  assert.equal(p.data.status, 'active');
  assert.equal(p.data.alessia_id, ale.user.id);
  assert.equal(p.data.phill_id, phill.user.id);
  const partner = await phill.client.from('profiles').select('id, role').eq('id', ale.user.id).single();
  assert.equal(partner.data.role, 'alessia', 'Phill vede il profilo di Alessia (nome e foto), niente di più');
});

test('IMPERSONIFICAZIONE: i PIN sono per profilo; le identità non si scambiano', async () => {
  // il PIN di Alessia non apre Phill e viceversa
  assert.equal((await callFunction('access', { action: 'enter', role: 'phill', pin: ALE_PIN })).status, 401);
  assert.equal((await callFunction('access', { action: 'enter', role: 'alessia', pin: PHILL_PIN })).status, 401);
  await unlock('phill'); await unlock('alessia');
  // il ruolo non si sceglie "a parole": non esiste un parametro per farsi emettere il token di un altro utente
  for (const extra of [{ user_id: ale.user.id }, { email: 'alessia@ale-app.local' }, { admin: true }]) {
    const r = await callFunction('access', { action: 'enter', role: 'phill', pin: ALE_PIN, ...extra });
    assert.equal(r.status, 401, `parametro ${Object.keys(extra)[0]} ignorato`);
  }
  // la sessione di Phill non dà accesso ai dati privati di Alessia (RLS)
  assert.deepEqual((await phill.client.from('journal_entries').select('*')).data, []);
  assert.ok((await phill.client.from('journal_entries').insert({ owner_id: ale.user.id, body: 'finto' })).error);
  const upd = await phill.client.from('journal_entries').update({ body: 'hack' }).eq('owner_id', ale.user.id).select();
  assert.equal((upd.data ?? []).length, 0);
  // e un JWT modificato non vale
  const [h, p, s] = phill.session.access_token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), sub: ale.user.id })).toString('base64url');
  const res = await fetch(`${API_URL}/rest/v1/journal_entries?select=*`, { headers: { apikey: PUBLISHABLE_KEY, authorization: `Bearer ${h}.${forged}.${s}` } });
  assert.ok([401, 403].includes(res.status), `JWT manomesso accettato (${res.status})`);
});

test('PIN e configurazione interna non sono raggiungibili dal client', async () => {
  for (const c of [ale.client, phill.client, anonClient()]) {
    for (const table of ['access_pins', 'internal_config']) {
      const r = await c.from(table).select('*');
      assert.ok(r.error || (r.data ?? []).length === 0, `${table} leggibile`);
      assert.ok((await c.from(table).insert({ role: 'alessia' })).error, `${table} scrivibile`);
    }
  }
  const raw = await fetch(`${API_URL}/rest/v1/access_pins?select=hash,salt`, { headers: { apikey: PUBLISHABLE_KEY, authorization: `Bearer ${ale.session.access_token}` } });
  assert.ok(raw.status >= 400, 'hash e sale non si leggono nemmeno con la propria sessione');
});

test('cambio PIN: serve la sessione e il PIN attuale; il vecchio smette di funzionare', async () => {
  assert.equal((await callFunction('access', { action: 'change_pin', old_pin: ALE_PIN, new_pin: '654321' })).status, 401, 'senza sessione');
  const bad = await callFunction('access', { action: 'change_pin', old_pin: '000000', new_pin: '654321' }, { jwt: ale.session.access_token });
  assert.equal(bad.status, 401);
  assert.equal((await callFunction('access', { action: 'change_pin', old_pin: ALE_PIN, new_pin: '12' }, { jwt: ale.session.access_token })).status, 400);
  await unlock('alessia');
  const ok = await callFunction('access', { action: 'change_pin', old_pin: ALE_PIN, new_pin: '654321' }, { jwt: ale.session.access_token });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await callFunction('access', { action: 'enter', role: 'alessia', pin: ALE_PIN })).status, 401);
  assert.equal((await callFunction('access', { action: 'enter', role: 'alessia', pin: '654321' })).status, 200);
  // Phill non può cambiare il PIN di Alessia usando il PIN di lei
  const cross = await callFunction('access', { action: 'change_pin', old_pin: '654321', new_pin: '111222' }, { jwt: phill.session.access_token });
  assert.equal(cross.status, 401, 'il PIN verificato è sempre quello del chiamante');
});

test('browser: la richiesta preliminare (CORS) del sito funziona e la risposta è leggibile', async () => {
  // Il CORS lo gestisce il gateway di Supabase (non è una difesa: la difesa è il PIN con blocco progressivo).
  const pre = await fetch(`${API_URL}/functions/v1/access`, { method: 'OPTIONS', headers: { origin: 'https://ph1llyon.github.io', 'access-control-request-method': 'POST', 'access-control-request-headers': 'apikey, content-type' } });
  assert.ok([200, 204].includes(pre.status));
  assert.ok(pre.headers.get('access-control-allow-origin'));
  const post = await callFunction('access', { action: 'status' }, { origin: 'https://ph1llyon.github.io' });
  assert.ok(post.headers.get('access-control-allow-origin'));
});

test('eliminare un profilo libera il ruolo e un nuovo ingresso con PIN riconfigura tutto', async () => {
  const re = await callFunction('access', { action: 'enter', role: 'phill', pin: PHILL_PIN });
  const fresh = await sessionFrom(re.body);
  const del = await fresh.client.rpc('delete_my_account', { p_confirm: 'ELIMINA ACCOUNT' });
  assert.equal(del.data?.ok, true, JSON.stringify(del.data ?? del.error));
  const st = await callFunction('access', { action: 'status' });
  assert.deepEqual([st.body.alessia, st.body.phill], [true, false], 'solo il profilo eliminato torna libero');
  const again = await callFunction('access', { action: 'claim', role: 'phill', pin: '555555', display_name: 'Phill' });
  assert.equal(again.status, 200);
  const p2 = await sessionFrom(again.body);
  assert.notEqual(p2.user.id, phill.user.id, 'una nuova identità, dati vecchi spariti');
  const link = await p2.client.from('partnerships').select('status');
  assert.equal(link.data.length, 1, 'collegamento ricreato automaticamente');
});
