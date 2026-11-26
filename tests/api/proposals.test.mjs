// Integrazione reale: proposte di Phill (allenamenti ed eventi) e sezione "Condiviso con te".
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, cleanup, link } from './helpers.mjs';

let ale; let phill; let stranger;
const ex = [{ exercise_key: 'squat', name: 'Squat a corpo libero', sets: 3, reps: '12', rest_seconds: 60, notes: null }];
const propose = (u, owner, over = {}) => u.client.from('workout_proposals').insert({ owner_id: owner.id, proposer_id: u.id, title: 'Mattina leggera', exercises: ex, ...over }).select().single();

before(async () => {
  ale = await makeUser('alessia', 'Alessia');
  phill = await makeUser('phill', 'Phill');
  stranger = await makeUser('phill', 'Estraneo');
  await link(ale, phill);
});
after(cleanup);

test('Phill propone un allenamento; Alessia lo vede, lo accetta e diventa una sua scheda', async () => {
  const p = await propose(phill, ale);
  assert.equal(p.error, null, p.error?.message);
  assert.equal(p.data.status, 'proposed');
  const seen = await ale.client.from('workout_proposals').select('id, title, status').eq('id', p.data.id);
  assert.equal(seen.data.length, 1);
  const acc = await ale.client.rpc('accept_workout_proposal', { p_id: p.data.id });
  assert.equal(acc.data.ok, true);
  const w = await ale.client.from('workouts').select('title, source, workout_exercises(name)').eq('source', 'proposal');
  assert.equal(w.data.length, 1);
  assert.equal(w.data[0].workout_exercises[0].name, 'Squat a corpo libero');
  const mine = await phill.client.from('workout_proposals').select('status').eq('id', p.data.id).single();
  assert.equal(mine.data.status, 'accepted', 'Phill vede lo stato aggiornato');
  assert.equal((await phill.client.from('workouts').select('id').eq('owner_id', ale.id)).data.length, 0, 'ma non vede la scheda di Alessia se non la condivide');
});

test('Phill non può decidere al posto di Alessia, né accettare, né ritirare una proposta già decisa', async () => {
  const p = (await propose(phill, ale, { title: 'Seconda' })).data;
  assert.ok((await phill.client.rpc('accept_workout_proposal', { p_id: p.id })).data?.ok !== true);
  assert.ok((await phill.client.from('workout_proposals').update({ status: 'accepted' }).eq('id', p.id)).error);
  assert.equal((await phill.client.from('workout_proposals').update({ status: 'withdrawn' }).eq('id', p.id)).error, null, 'può ritirare la propria proposta in attesa');
  assert.ok((await phill.client.from('workout_proposals').update({ status: 'proposed' }).eq('id', p.id)).error, 'non si riapre');
});

test('Alessia può rifiutare; un estraneo non può proporre né leggere', async () => {
  const p = (await propose(phill, ale, { title: 'Da rifiutare' })).data;
  assert.equal((await ale.client.from('workout_proposals').update({ status: 'rejected' }).eq('id', p.id)).error, null);
  assert.equal((await phill.client.from('workout_proposals').select('status').eq('id', p.id).single()).data.status, 'rejected');
  assert.ok((await propose(stranger, ale)).error, 'senza collegamento non si propone');
  assert.equal((await stranger.client.from('workout_proposals').select('id').eq('owner_id', ale.id)).data.length, 0);
  assert.ok((await propose(phill, ale, { exercises: Array.from({ length: 51 }, () => ex[0]) })).error, 'limite di esercizi');
});

test('eventi proposti: restano "proposed" finché Alessia non li conferma', async () => {
  const starts = new Date(Date.now() + 2 * 864e5).toISOString();
  const ins = await phill.client.from('calendar_events').insert({ owner_id: ale.id, created_by: phill.id, title: 'Passeggiata insieme', category: 'walk', starts_at: starts, status: 'proposed' }).select().single();
  assert.equal(ins.error, null, ins.error?.message);
  assert.ok((await phill.client.from('calendar_events').insert({ owner_id: ale.id, created_by: phill.id, title: 'Forzato', category: 'walk', starts_at: starts, status: 'confirmed' })).error, 'non può confermare da solo');
  assert.equal((await ale.client.from('calendar_events').select('id').eq('id', ins.data.id)).data.length, 1);
  assert.equal((await ale.client.from('calendar_events').update({ status: 'confirmed' }).eq('id', ins.data.id)).error, null);
  // confermato ma calendario non condiviso: Phill vede comunque la propria proposta? la RLS decide; mai gli altri eventi
  await ale.client.from('calendar_events').insert({ owner_id: ale.id, created_by: ale.id, title: 'Privato', category: 'personal', starts_at: starts });
  const vis = (await phill.client.from('calendar_events').select('title').eq('owner_id', ale.id)).data.map((e) => e.title);
  assert.ok(!vis.includes('Privato'));
});

test('"Condiviso con te": ogni categoria compare solo dopo la condivisione e sparisce con la revoca', async () => {
  const day = new Date().toISOString().slice(0, 10);
  const h = (await ale.client.from('habits').insert({ owner_id: ale.id, name: 'Acqua' }).select().single()).data;
  await ale.client.from('habit_logs').insert({ owner_id: ale.id, habit_id: h.id, day, done: true });
  await ale.client.from('goals').insert({ owner_id: ale.id, title: 'Camminare di più' });
  const seeHabits = async () => (await phill.client.from('habits').select('id').eq('owner_id', ale.id)).data.length;
  const seeGoals = async () => (await phill.client.from('goals').select('id').eq('owner_id', ale.id)).data.length;
  assert.deepEqual([await seeHabits(), await seeGoals()], [0, 0]);
  assert.equal((await ale.client.rpc('set_sharing', { p_category: 'habits', p_enabled: true })).data?.ok ?? true, true);
  await ale.client.rpc('set_sharing', { p_category: 'progress', p_enabled: true });
  assert.deepEqual([await seeHabits(), await seeGoals()], [1, 1]);
  assert.equal((await phill.client.from('habit_logs').select('day').eq('owner_id', ale.id)).data.length, 1);
  await ale.client.rpc('revoke_all_sharing');
  assert.deepEqual([await seeHabits(), await seeGoals()], [0, 0]);
});

test('notifiche sulle proposte: testi naturali', async () => {
  const p = (await propose(phill, ale, { title: 'Per le notifiche' })).data;
  const toAle = (await ale.client.from('notifications').select('title, body').eq('body', 'Per le notifiche')).data;
  assert.match(toAle[0].title, /ti ha proposto un allenamento$/);
  await ale.client.from('workout_proposals').update({ status: 'rejected' }).eq('id', p.id);
  const toPhill = (await phill.client.from('notifications').select('title').eq('body', 'Per le notifiche')).data;
  assert.match(toPhill[0].title, /non ha accettato la tua proposta$/);
  assert.ok(!toPhill[0].title.includes('declinato'));
});
