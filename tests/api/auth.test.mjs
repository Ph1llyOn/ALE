import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { API_URL, PUBLISHABLE_KEY, PASSWORD, anonClient, makeUser, cleanup, uniqueEmail, lastMailTo } from './helpers.mjs';

after(cleanup);

test('registrazione: crea il profilo con ruolo e nome scelti', async () => {
  const u = await makeUser('alessia', 'Ale Test');
  const { data, error } = await u.client.from('profiles').select('*').eq('id', u.id).single();
  assert.equal(error, null);
  assert.equal(data.role, 'alessia');
  assert.equal(data.display_name, 'Ale Test');
  assert.equal(data.avatar_path, null);
});

test('registrazione: ruolo inventato o mancante rifiutato', async () => {
  for (const meta of [{ role: 'admin' }, { display_name: 'x' }, {}]) {
    const { data, error } = await anonClient().auth.signUp({ email: uniqueEmail('bad'), password: PASSWORD, options: { data: meta } });
    assert.ok(error, `doveva fallire con ${JSON.stringify(meta)}`);
    assert.equal(data.session, null);
  }
});

test('registrazione: password corta rifiutata (minimo 10 caratteri)', async () => {
  const { error } = await anonClient().auth.signUp({
    email: uniqueEmail('weak'), password: 'corta123', options: { data: { role: 'alessia' } },
  });
  assert.ok(error);
  assert.match(error.message, /password|weak|short|least/i);
});

test('registrazione: email già usata non crea un secondo account', async () => {
  const u = await makeUser('phill');
  const { data, error } = await anonClient().auth.signUp({
    email: u.email, password: PASSWORD, options: { data: { role: 'phill' } },
  });
  // Con conferma email attiva Supabase non rivela l'esistenza (utente "offuscato" senza sessione);
  // senza conferma restituisce un errore. In entrambi i casi non ci deve essere una sessione.
  assert.ok(error || data.session === null);
});

test('login: password errata rifiutata, corretta accettata', async () => {
  const u = await makeUser('alessia');
  const c = anonClient();
  const bad = await c.auth.signInWithPassword({ email: u.email, password: PASSWORD + 'x' });
  assert.ok(bad.error);
  assert.equal(bad.data.session, null);
  const ok = await c.auth.signInWithPassword({ email: u.email, password: PASSWORD });
  assert.equal(ok.error, null);
  assert.ok(ok.data.session.access_token);
});

test('sessione: refresh funziona; dopo il logout il refresh token non vale più', async () => {
  const u = await makeUser('phill');
  const { data: s1 } = await u.client.auth.getSession();
  const refresh = s1.session.refresh_token;
  const r = await u.client.auth.refreshSession();
  assert.equal(r.error, null);
  const { error: outErr } = await u.client.auth.signOut();
  assert.equal(outErr, null);
  const { data: after } = await u.client.auth.getSession();
  assert.equal(after.session, null);
  const retry = await anonClient().auth.refreshSession({ refresh_token: r.data.session.refresh_token });
  assert.ok(retry.error, 'il refresh token dopo logout deve essere revocato');
  const old = await anonClient().auth.refreshSession({ refresh_token: refresh });
  assert.ok(old.error);
});

test('API diretta senza login: nessun dato, nessuna funzione', async () => {
  const headers = { apikey: PUBLISHABLE_KEY };
  for (const table of ['profiles', 'invitations', 'partnerships', 'invitation_attempts']) {
    const r = await fetch(`${API_URL}/rest/v1/${table}?select=*`, { headers });
    assert.ok([401, 403].includes(r.status), `${table}: atteso 401/403, ottenuto ${r.status}`);
  }
  for (const fn of ['create_invitation', 'redeem_invitation', 'end_partnership', 'revoke_invitation']) {
    const r = await fetch(`${API_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ p_code: 'AAAAAAAAAA' }),
    });
    assert.ok([401, 403, 404].includes(r.status), `${fn}: atteso 401/403/404, ottenuto ${r.status}`);
  }
});

test('API diretta con JWT manomesso o scaduto: rifiutata', async () => {
  const u = await makeUser('alessia');
  const { data } = await u.client.auth.getSession();
  const [h, p, s] = data.session.access_token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), sub: '00000000-0000-0000-0000-000000000000', role: 'service_role' })).toString('base64url');
  for (const token of [`${h}.${forgedPayload}.${s}`, `${h}.${p}.${s}x`, 'non-un-jwt']) {
    const r = await fetch(`${API_URL}/rest/v1/profiles?select=*`, { headers: { apikey: PUBLISHABLE_KEY, authorization: `Bearer ${token}` } });
    assert.ok(r.status === 401 || r.status === 403, `token falso accettato (${r.status})`);
  }
});

test('recupero password: email, link, nuova password; la vecchia non vale più', async () => {
  const u = await makeUser('alessia');
  const c = anonClient();
  const { error } = await c.auth.resetPasswordForEmail(u.email, { redirectTo: 'http://localhost:8080/ALE/' });
  assert.equal(error, null);
  const mail = await lastMailTo(u.email);
  const link = (mail.Text + ' ' + mail.HTML).match(/https?:\/\/[^\s"'<>]*\/auth\/v1\/verify\?[^\s"'<>]+/)?.[0]?.replaceAll('&amp;', '&');
  assert.ok(link, 'link di recupero non trovato nell\'email');
  assert.match(link, /type=recovery/);
  const res = await fetch(link, { redirect: 'manual' });
  const loc = res.headers.get('location');
  assert.ok(loc?.startsWith('http://localhost:8080/ALE/'), `redirect inatteso: ${loc}`);
  const frag = new URLSearchParams(loc.split('#')[1]);
  assert.equal(frag.get('type'), 'recovery');
  const rec = anonClient();
  const set = await rec.auth.setSession({ access_token: frag.get('access_token'), refresh_token: frag.get('refresh_token') });
  assert.equal(set.error, null);
  const NEW = 'Nuova-passw0rd-987654';
  const upd = await rec.auth.updateUser({ password: NEW });
  assert.equal(upd.error, null);
  assert.ok((await anonClient().auth.signInWithPassword({ email: u.email, password: PASSWORD })).error, 'la vecchia password non deve più funzionare');
  assert.equal((await anonClient().auth.signInWithPassword({ email: u.email, password: NEW })).error, null);
  // il link è monouso
  const again = await fetch(link, { redirect: 'manual' });
  assert.match(again.headers.get('location') || '', /error/i);
});

test('recupero password: un indirizzo sconosciuto non rivela nulla', async () => {
  const { error } = await anonClient().auth.resetPasswordForEmail(uniqueEmail('nessuno'), { redirectTo: 'http://localhost:8080/ALE/' });
  assert.equal(error, null);
});
