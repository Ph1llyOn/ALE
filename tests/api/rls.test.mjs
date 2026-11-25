import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, cleanup, link, anonClient, adminClient } from './helpers.mjs';

let ale, phill, stranger, strangerAle;
before(async () => {
  ale = await makeUser('alessia', 'Ale');
  phill = await makeUser('phill', 'Phill');
  stranger = await makeUser('phill', 'Estraneo');
  strangerAle = await makeUser('alessia', 'Altra Ale');
  await link(ale, phill);
});
after(cleanup);

const ids = (rows) => rows.map((r) => r.id).sort();

test('profili: ognuno legge il proprio, il partner legge il partner, gli estranei no', async () => {
  const mine = await ale.client.from('profiles').select('id');
  assert.deepEqual(ids(mine.data), ids([{ id: ale.id }, { id: phill.id }]));
  const theirs = await phill.client.from('profiles').select('id');
  assert.deepEqual(ids(theirs.data), ids([{ id: ale.id }, { id: phill.id }]));
  const outsider = await stranger.client.from('profiles').select('id');
  assert.deepEqual(ids(outsider.data), [stranger.id]);
  const outsider2 = await strangerAle.client.from('profiles').select('id');
  assert.deepEqual(ids(outsider2.data), [strangerAle.id]);
  assert.deepEqual((await anonClient().from('profiles').select('id')).data ?? null, null);
});

test('profili: modifica del proprio nome ok, di altri impossibile', async () => {
  const own = await ale.client.from('profiles').update({ display_name: 'Alessia' }).eq('id', ale.id).select();
  assert.equal(own.error, null);
  assert.equal(own.data[0].display_name, 'Alessia');

  for (const [actor, target] of [[ale, phill], [phill, ale], [stranger, ale], [stranger, phill], [ale, strangerAle]]) {
    const r = await actor.client.from('profiles').update({ display_name: 'HACK' }).eq('id', target.id).select();
    assert.equal(r.error, null);
    assert.equal(r.data.length, 0, `${actor.role} ha modificato il profilo di ${target.role}`);
  }
  const { data } = await adminClient().from('profiles').select('id, display_name').in('id', [ale.id, phill.id, stranger.id]);
  assert.ok(data.every((p) => p.display_name !== 'HACK'));
});

test('profili: ruolo e id non modificabili, niente insert/delete diretti', async () => {
  const role = await ale.client.from('profiles').update({ role: 'phill' }).eq('id', ale.id);
  assert.ok(role.error, 'il ruolo non deve essere modificabile');
  const idc = await ale.client.from('profiles').update({ id: stranger.id }).eq('id', ale.id);
  assert.ok(idc.error);
  const ins = await ale.client.from('profiles').insert({ id: crypto.randomUUID(), role: 'alessia', display_name: 'Fake' });
  assert.ok(ins.error);
  const del = await ale.client.from('profiles').delete().eq('id', ale.id).select();
  assert.ok(del.error);
  const { data } = await adminClient().from('profiles').select('role').eq('id', ale.id).single();
  assert.equal(data.role, 'alessia');
});

test('profili: validazione nome e avatar_path', async () => {
  assert.ok((await ale.client.from('profiles').update({ display_name: '   ' }).eq('id', ale.id)).error);
  assert.ok((await ale.client.from('profiles').update({ display_name: 'x'.repeat(41) }).eq('id', ale.id)).error);
  assert.ok((await ale.client.from('profiles').update({ avatar_path: `${phill.id}/a.png` }).eq('id', ale.id)).error);
  assert.ok((await ale.client.from('profiles').update({ avatar_path: '../../etc/passwd' }).eq('id', ale.id)).error);
});

test('inviti: Alessia vede i propri senza hash; Phill e gli estranei non li vedono', async () => {
  const inv = await strangerAle.client.rpc('create_invitation');
  assert.equal(inv.data.ok, true);
  const mine = await strangerAle.client.from('invitations').select('id, status, expires_at');
  assert.equal(mine.data.length, 1);
  assert.ok((await strangerAle.client.from('invitations').select('code_hash')).error, 'code_hash non deve essere leggibile');
  assert.ok((await strangerAle.client.from('invitations').select('*')).error, 'select * include code_hash: negato');
  for (const other of [phill, stranger]) {
    const r = await other.client.from('invitations').select('id');
    assert.deepEqual(r.data, [], `${other.role} vede inviti altrui`);
  }
  // Alessia (collegata) vede solo il proprio invito già usato, non quello dell'altra Alessia.
  const aleInv = await ale.client.from('invitations').select('id, status');
  assert.equal(aleInv.data.length, 1);
  assert.equal(aleInv.data[0].status, 'used');
  assert.notEqual(aleInv.data[0].id, mine.data[0].id);
  assert.equal((await strangerAle.client.rpc('revoke_invitation')).data.ok, true);
});

test('collegamenti: visibili solo ai due partecipanti, nessuna scrittura diretta', async () => {
  assert.equal((await ale.client.from('partnerships').select('id')).data.length, 1);
  assert.equal((await phill.client.from('partnerships').select('id')).data.length, 1);
  assert.equal((await stranger.client.from('partnerships').select('id')).data.length, 0);
  assert.equal((await strangerAle.client.from('partnerships').select('id')).data.length, 0);

  assert.ok((await stranger.client.from('partnerships').insert({ alessia_id: strangerAle.id, phill_id: stranger.id })).error);
  assert.ok((await ale.client.from('partnerships').update({ status: 'ended' }).eq('alessia_id', ale.id)).error);
  assert.ok((await ale.client.from('partnerships').delete().eq('alessia_id', ale.id)).error);
  const upd = await stranger.client.from('partnerships').update({ phill_id: stranger.id }).eq('alessia_id', ale.id);
  assert.ok(upd.error || (upd.data ?? []).length === 0);
  const { data } = await adminClient().from('partnerships').select('status').eq('alessia_id', ale.id).single();
  assert.equal(data.status, 'active');
});

test('tabelle interne: invitation_attempts inaccessibile', async () => {
  assert.ok((await ale.client.from('invitation_attempts').select('*')).error);
  assert.ok((await phill.client.from('invitation_attempts').insert({ user_id: phill.id })).error);
});

test('API: le funzioni di scrittura rispettano il ruolo', async () => {
  assert.equal((await phill.client.rpc('create_invitation')).data.error, 'not_alessia');
  assert.equal((await ale.client.rpc('redeem_invitation', { p_code: 'AAAAAAAAAA' })).data.error, 'not_phill');
  assert.equal((await stranger.client.rpc('end_partnership')).data.error, 'no_partnership');
  // la funzione non accetta un utente come parametro: non si può agire "a nome di" altri
  const spoof = await stranger.client.rpc('end_partnership', { uid: ale.id });
  assert.ok(spoof.error, 'parametri non previsti devono essere rifiutati');
});
