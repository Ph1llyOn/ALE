// Tutorial iniziale: stato salvato sull'account (PostgREST reale, stack locale).
// Copre: salvataggio, rilettura da una nuova sessione (altro dispositivo / nuovo login), valori non validi, isolamento da Phill.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, cleanup, anonClient, PASSWORD } from './helpers.mjs';

let ale; let phill;

// stessa logica di saveByUser in js/core/api-settings.js: aggiorna, altrimenti inserisce
async function saveTour(user, patch) {
  const { data, error } = await user.client.from('user_settings').update(patch).eq('user_id', user.id).select('user_id');
  assert.equal(error, null, error?.message);
  if (data.length) return;
  const ins = await user.client.from('user_settings').insert({ user_id: user.id, ...patch });
  assert.equal(ins.error, null, ins.error?.message);
}

async function readTour(client, userId) {
  const { data, error } = await client.from('user_settings').select('app_tour_status, app_tour_step, app_tour_at').eq('user_id', userId).maybeSingle();
  assert.equal(error, null, error?.message);
  return data;
}

before(async () => {
  ale = await makeUser('alessia', 'Alessia');
  phill = await makeUser('phill', 'Phill');
});
after(cleanup);

test('primo accesso: nessun tutorial visto (stato assente o null)', async () => {
  const t = await readTour(ale.client, ale.id);
  assert.ok(!t || t.app_tour_status === null);
});

test('Alessia salva il passo, poi lo rilegge', async () => {
  await saveTour(ale, { app_tour_status: 'in_progress', app_tour_step: 3, app_tour_at: new Date().toISOString() });
  const t = await readTour(ale.client, ale.id);
  assert.equal(t.app_tour_status, 'in_progress');
  assert.equal(t.app_tour_step, 3);
  assert.ok(t.app_tour_at);
});

test('nuovo login (altro dispositivo): il tutorial a metà si ritrova dov’era', async () => {
  const other = anonClient();
  const { error } = await other.auth.signInWithPassword({ email: ale.email, password: PASSWORD });
  assert.equal(error, null, error?.message);
  const t = await readTour(other, ale.id);
  assert.equal(t.app_tour_status, 'in_progress');
  assert.equal(t.app_tour_step, 3);
});

test('saltato: si registra come saltato, e resta tale dopo un nuovo login', async () => {
  await saveTour(ale, { app_tour_status: 'skipped', app_tour_step: 1, app_tour_at: new Date().toISOString() });
  const other = anonClient();
  await other.auth.signInWithPassword({ email: ale.email, password: PASSWORD });
  assert.equal((await readTour(other, ale.id)).app_tour_status, 'skipped');
});

test('completato: stato done, persistente', async () => {
  await saveTour(ale, { app_tour_status: 'done', app_tour_step: 6, app_tour_at: new Date().toISOString() });
  const other = anonClient();
  await other.auth.signInWithPassword({ email: ale.email, password: PASSWORD });
  assert.equal((await readTour(other, ale.id)).app_tour_status, 'done');
});

test('valori non validi rifiutati dal database', async () => {
  const bad = await ale.client.from('user_settings').update({ app_tour_status: 'forse' }).eq('user_id', ale.id).select('user_id');
  assert.ok(bad.error, 'uno stato non previsto deve essere rifiutato');
  const far = await ale.client.from('user_settings').update({ app_tour_step: 99 }).eq('user_id', ale.id).select('user_id');
  assert.ok(far.error, 'un passo fuori intervallo deve essere rifiutato');
});

test('Phill non vede il tutorial di Alessia e non può cambiarlo', async () => {
  const seen = await phill.client.from('user_settings').select('app_tour_status').eq('user_id', ale.id);
  assert.equal(seen.error, null);
  assert.equal(seen.data.length, 0, 'nessuna riga di Alessia visibile a Phill');
  const edit = await phill.client.from('user_settings').update({ app_tour_status: 'skipped' }).eq('user_id', ale.id).select('user_id');
  assert.equal(edit.data?.length ?? 0, 0, 'nessuna riga di Alessia modificabile da Phill');
});
