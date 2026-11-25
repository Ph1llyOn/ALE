import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, cleanup, adminClient } from './helpers.mjs';

after(cleanup);

const fmt = (code) => `${code.slice(0, 5)}-${code.slice(5)}`;

test('flusso completo: invito → riscatto → collegamento → fine → nuovo invito', async () => {
  const ale = await makeUser('alessia');
  const phill = await makeUser('phill');

  const inv = (await ale.client.rpc('create_invitation')).data;
  assert.equal(inv.ok, true);
  assert.match(inv.code, /^[A-Z0-9]{10}$/);
  const hours = (new Date(inv.expires_at) - Date.now()) / 36e5;
  assert.ok(hours > 47 && hours <= 48, `scadenza ${hours}h`);

  const red = (await phill.client.rpc('redeem_invitation', { p_code: fmt(inv.code).toLowerCase() })).data;
  assert.equal(red.ok, true);

  const p = (await ale.client.from('partnerships').select('*').single()).data;
  assert.equal(p.alessia_id, ale.id);
  assert.equal(p.phill_id, phill.id);
  assert.equal(p.status, 'active');

  // il codice è monouso
  const other = await makeUser('phill');
  assert.equal((await other.client.rpc('redeem_invitation', { p_code: inv.code })).data.error, 'invalid_code');

  // fine del collegamento: o l'uno o l'altro può terminarlo
  assert.equal((await phill.client.rpc('end_partnership')).data.ok, true);
  assert.deepEqual((await phill.client.from('profiles').select('id')).data.map((r) => r.id), [phill.id]);
  assert.deepEqual((await ale.client.from('profiles').select('id')).data.map((r) => r.id), [ale.id]);
  assert.equal((await ale.client.rpc('end_partnership')).data.error, 'no_partnership');

  // il vecchio invito resta inutilizzabile; ne serve uno nuovo
  assert.equal((await other.client.rpc('redeem_invitation', { p_code: inv.code })).data.error, 'invalid_code');
  const inv2 = (await ale.client.rpc('create_invitation')).data;
  assert.equal((await other.client.rpc('redeem_invitation', { p_code: inv2.code })).data.ok, true);
});

test('1:1: nessun secondo collegamento per Alessia né per Phill', async () => {
  const ale = await makeUser('alessia');
  const phill = await makeUser('phill');
  const ale2 = await makeUser('alessia');
  const phill2 = await makeUser('phill');

  const inv = (await ale.client.rpc('create_invitation')).data;
  assert.equal((await phill.client.rpc('redeem_invitation', { p_code: inv.code })).data.ok, true);

  assert.equal((await ale.client.rpc('create_invitation')).data.error, 'already_linked');
  const inv2 = (await ale2.client.rpc('create_invitation')).data;
  assert.equal((await phill.client.rpc('redeem_invitation', { p_code: inv2.code })).data.error, 'already_linked');

  // Alessia già collegata non può essere collegata da un altro Phill nemmeno con un codice vecchio
  assert.equal((await phill2.client.rpc('redeem_invitation', { p_code: inv.code })).data.error, 'invalid_code');

  const rows = (await adminClient().from('partnerships').select('id').in('alessia_id', [ale.id, ale2.id]).eq('status', 'active')).data;
  assert.equal(rows.length, 1);
});

test('concorrenza: 8 Phill riscattano lo stesso codice insieme, ne vince uno solo', async () => {
  const ale = await makeUser('alessia');
  const phills = await Promise.all(Array.from({ length: 8 }, () => makeUser('phill')));
  const { code } = (await ale.client.rpc('create_invitation')).data;

  const results = await Promise.all(phills.map((p) => p.client.rpc('redeem_invitation', { p_code: code })));
  const wins = results.filter((r) => r.data?.ok === true);
  assert.equal(wins.length, 1, `vincitori: ${wins.length}`);
  assert.ok(results.filter((r) => r.data?.ok !== true).every((r) => ['invalid_code', 'already_linked'].includes(r.data?.error)));

  const active = (await adminClient().from('partnerships').select('phill_id').eq('alessia_id', ale.id).eq('status', 'active')).data;
  assert.equal(active.length, 1);
});

test('concorrenza: lo stesso Phill con due inviti di due Alessia contemporanei → un solo collegamento', async () => {
  const a1 = await makeUser('alessia');
  const a2 = await makeUser('alessia');
  const phill = await makeUser('phill');
  const c1 = (await a1.client.rpc('create_invitation')).data.code;
  const c2 = (await a2.client.rpc('create_invitation')).data.code;
  const rs = await Promise.all([phill.client.rpc('redeem_invitation', { p_code: c1 }), phill.client.rpc('redeem_invitation', { p_code: c2 })]);
  assert.equal(rs.filter((r) => r.data?.ok === true).length, 1);
  const active = (await adminClient().from('partnerships').select('id').eq('phill_id', phill.id).eq('status', 'active')).data;
  assert.equal(active.length, 1);
});

test('inviti: scadenza, revoca e rigenerazione', async () => {
  const admin = adminClient();
  const ale = await makeUser('alessia');
  const phill = await makeUser('phill');

  const first = (await ale.client.rpc('create_invitation')).data;
  await admin.from('invitations').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq('inviter_id', ale.id).eq('status', 'pending');
  assert.equal((await phill.client.rpc('redeem_invitation', { p_code: first.code })).data.error, 'invalid_code');

  const second = (await ale.client.rpc('create_invitation')).data;
  assert.notEqual(second.code, first.code);
  assert.equal((await ale.client.rpc('revoke_invitation')).data.ok, true);
  assert.equal((await phill.client.rpc('redeem_invitation', { p_code: second.code })).data.error, 'invalid_code');

  const third = (await ale.client.rpc('create_invitation')).data;
  const pending = (await ale.client.from('invitations').select('id').eq('status', 'pending')).data;
  assert.equal(pending.length, 1);
  assert.equal((await phill.client.rpc('redeem_invitation', { p_code: third.code })).data.ok, true);
});

test('rate limit: dopo 5 codici sbagliati anche quello giusto è bloccato', async () => {
  const ale = await makeUser('alessia');
  const phill = await makeUser('phill');
  const { code } = (await ale.client.rpc('create_invitation')).data;
  for (let i = 0; i < 5; i++) {
    assert.equal((await phill.client.rpc('redeem_invitation', { p_code: `ZZZZZZZZZ${i}` })).data.error, 'invalid_code');
  }
  assert.equal((await phill.client.rpc('redeem_invitation', { p_code: code })).data.error, 'too_many_attempts');
  // un altro Phill non è influenzato
  const other = await makeUser('phill');
  assert.equal((await other.client.rpc('redeem_invitation', { p_code: code })).data.ok, true);
});

test('codici: input malformati non rompono nulla e non rivelano dettagli', async () => {
  const phill = await makeUser('phill');
  for (const bad of ['', ' ', "'; drop table profiles; --", 'é'.repeat(50), null]) {
    const r = await phill.client.rpc('redeem_invitation', { p_code: bad });
    assert.ok(r.data?.error === 'invalid_code' || r.data?.error === 'too_many_attempts' || r.error, `risposta inattesa per ${JSON.stringify(bad)}`);
  }
});
