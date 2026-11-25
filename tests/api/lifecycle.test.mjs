import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, cleanup, link, anonClient, adminClient, TINY_PNG, PASSWORD } from './helpers.mjs';

after(cleanup);

const TABLES = ['profiles', 'partnerships', 'invitations', 'sharing_permissions', 'equipment', 'workouts', 'workout_exercises',
  'workout_sessions', 'session_exercise_progress', 'workout_proposals', 'habits', 'habit_logs', 'calendar_events', 'journal_entries',
  'wellbeing_logs', 'wellbeing_notes', 'progress_records', 'messages', 'message_receipts', 'scheduled_messages', 'notifications', 'push_subscriptions',
  'ai_preferences', 'ai_generations'];

async function fill(u, partner) {
  const c = u.client;
  const must = (r, what) => { assert.equal(r.error, null, `${what}: ${r.error?.message}`); return r.data; };
  const w = must(await c.from('workouts').insert({ owner_id: u.id, title: 'Scheda' }).select().single(), 'workouts');
  must(await c.from('workout_exercises').insert({ owner_id: u.id, workout_id: w.id, name: 'Squat' }), 'workout_exercises');
  const h = must(await c.from('habits').insert({ owner_id: u.id, name: 'Acqua' }).select().single(), 'habits');
  must(await c.from('habit_logs').insert({ owner_id: u.id, habit_id: h.id, day: '2026-11-01' }), 'habit_logs');
  must(await c.from('journal_entries').insert({ owner_id: u.id, body: `Diario privato di ${u.role}` }), 'journal');
  const l = must(await c.from('wellbeing_logs').insert({ owner_id: u.id, day: '2026-11-01', mood: 3, energy: 3 }).select().single(), 'wellbeing');
  must(await c.from('wellbeing_notes').insert({ owner_id: u.id, log_id: l.id, note: `Nota di ${u.role}` }), 'notes');
  must(await c.from('messages').insert({ sender_id: u.id, recipient_id: partner.id, body: `Messaggio di ${u.role}` }), 'messages');
  must(await c.from('ai_preferences').insert({ user_id: u.id, ai_enabled: true }), 'ai');
  must(await c.from('push_subscriptions').insert({ user_id: u.id, endpoint: `https://push.example.test/${u.id}`, p256dh: 'k', auth: 'a' }), 'push');
  must(await c.rpc('set_sharing', { p_category: 'journal', p_enabled: true }), 'sharing');
  must(await c.storage.from('avatars').upload(`${u.id}/foto.png`, TINY_PNG, { contentType: 'image/png' }), 'avatar');
}

async function leftovers(userId) {
  const admin = adminClient();
  const found = [];
  for (const [table, cols] of [
    ['profiles', ['id']], ['partnerships', ['alessia_id', 'phill_id']], ['invitations', ['inviter_id', 'used_by']],
    ['sharing_permissions', ['owner_id', 'grantee_id']], ['workout_proposals', ['owner_id', 'proposer_id']],
    ['calendar_events', ['owner_id', 'created_by']], ['messages', ['sender_id', 'recipient_id']],
    ['scheduled_messages', ['sender_id', 'recipient_id']], ['notifications', ['user_id']], ['push_subscriptions', ['user_id']],
    ['ai_preferences', ['user_id']], ['ai_generations', ['user_id']], ['equipment', ['owner_id']], ['workouts', ['owner_id']],
    ['workout_exercises', ['owner_id']], ['workout_sessions', ['owner_id']], ['session_exercise_progress', ['owner_id']],
    ['habits', ['owner_id']], ['habit_logs', ['owner_id']], ['journal_entries', ['owner_id']], ['wellbeing_logs', ['owner_id']],
    ['wellbeing_notes', ['owner_id']], ['progress_records', ['owner_id']],
  ]) {
    for (const col of cols) {
      const { data, error } = await admin.from(table).select('*').eq(col, userId);
      assert.equal(error, null, `${table}.${col}: ${error?.message}`);
      if (data.length) found.push(`${table}.${col}=${data.length}`);
    }
  }
  const files = await admin.storage.from('avatars').list(userId);
  if (files.data?.length) found.push(`storage=${files.data.length}`);
  const { data: u } = await admin.auth.admin.getUserById(userId);
  if (u?.user) found.push('auth.users');
  return found;
}

test('esportazione: ognuno ottiene solo i propri dati, completi e senza segreti', async () => {
  const ale = await makeUser('alessia', 'Ale');
  const phill = await makeUser('phill', 'Phill');
  await link(ale, phill);
  await fill(ale, phill);
  await fill(phill, ale);

  const exp = (await phill.client.rpc('export_my_data')).data;
  assert.equal(exp.ok, true);
  assert.deepEqual(Object.keys(exp.data).sort(), [...TABLES].sort(), 'tutte le tabelle personali sono incluse');
  const text = JSON.stringify(exp);
  assert.ok(text.includes('Diario privato di phill'));
  assert.ok(!text.includes('Diario privato di alessia'), 'dati di Alessia nell\'export di Phill');
  assert.ok(!text.includes('Nota di alessia'));
  assert.ok(!text.includes('code_hash'));
  assert.equal(exp.data.messages.length, 2, 'messaggi inviati e ricevuti');
  assert.ok(exp.data.push_subscriptions.every((p) => !('auth' in p) && !('p256dh' in p)));
  assert.ok(exp.data.profiles.length === 1 && exp.data.profiles[0].id === phill.id);

  const anon = await anonClient().rpc('export_my_data');
  assert.ok(anon.error, 'anon non può esportare');
});

test('eliminazione account: conferma, riautenticazione, Storage, poi nessun dato orfano', async () => {
  const ale = await makeUser('alessia', 'Ale');
  const phill = await makeUser('phill', 'Phill');
  const byA = await makeUser('alessia', 'Altra coppia A');
  const byP = await makeUser('phill', 'Altra coppia P');
  await link(ale, phill);
  await link(byA, byP);
  await fill(ale, phill);
  await fill(phill, ale);
  await fill(byA, byP);
  await fill(byP, byA);
  const admin = adminClient();

  // --- Phill elimina il proprio account
  const del = (u, confirm = 'ELIMINA ACCOUNT') => u.client.rpc('delete_my_account', { p_confirm: confirm });
  assert.equal((await del(phill, 'ELIMINA')).data.error, 'confirmation_required');
  assert.ok((await anonClient().rpc('delete_my_account', { p_confirm: 'ELIMINA ACCOUNT' })).error, 'anon non può eliminare');
  assert.equal((await del(phill)).data.error, 'storage_not_empty', 'i file vanno rimossi prima: niente file orfani');
  assert.equal((await admin.auth.admin.getUserById(phill.id)).data.user.id, phill.id, "l'account esiste ancora");

  // la riautenticazione recente è obbligatoria: la sessione appena creata (password) è valida; si verifica anche un nuovo accesso
  const fresh = anonClient();
  assert.equal((await fresh.auth.signInWithPassword({ email: phill.email, password: PASSWORD })).error, null);
  const rm = await fresh.storage.from('avatars').remove([`${phill.id}/foto.png`]);
  assert.equal(rm.error, null);
  assert.equal(rm.data.length, 1);
  const res = await fresh.rpc('delete_my_account', { p_confirm: 'ELIMINA ACCOUNT' });
  assert.equal(res.data?.ok, true, JSON.stringify(res.data ?? res.error));

  assert.deepEqual(await leftovers(phill.id), [], "dati di Phill rimasti dopo l'eliminazione");
  // il vecchio token non apre niente e non permette di ricreare dati
  assert.deepEqual((await phill.client.from('profiles').select('id')).data ?? [], []);
  assert.ok((await phill.client.from('journal_entries').insert({ owner_id: phill.id, body: 'fantasma' })).error);
  assert.ok((await anonClient().auth.signInWithPassword({ email: phill.email, password: PASSWORD })).error, 'non si può più accedere');

  // --- Alessia: i suoi dati restano, quelli condivisi con Phill spariscono
  assert.equal((await ale.client.from('journal_entries').select('id')).data.length, 1, 'il diario di Alessia è intatto');
  assert.equal((await ale.client.from('wellbeing_notes').select('log_id')).data.length, 1, 'le note di Alessia sono intatte');
  assert.equal((await ale.client.from('messages').select('id')).data.length, 0, 'la conversazione con Phill non esiste più');
  assert.equal((await ale.client.from('partnerships').select('id').eq('status', 'active')).data.length, 0);
  assert.equal((await ale.client.from('sharing_permissions').select('id')).data.length, 0);
  assert.equal((await ale.client.rpc('create_invitation')).data.ok, true, 'Alessia può invitare di nuovo');

  // --- l'altra coppia non è toccata
  assert.equal((await byA.client.from('messages').select('id')).data.length, 2);
  assert.equal((await byA.client.from('partnerships').select('id').eq('status', 'active')).data.length, 1);
  assert.equal((await byP.client.from('journal_entries').select('id')).data.length, 1);

  // --- Alessia elimina il proprio account
  const aleFresh = anonClient();
  await aleFresh.auth.signInWithPassword({ email: ale.email, password: PASSWORD });
  assert.equal((await aleFresh.rpc('delete_my_account', { p_confirm: 'ELIMINA ACCOUNT' })).data.error, 'storage_not_empty');
  await aleFresh.storage.from('avatars').remove([`${ale.id}/foto.png`]);
  assert.equal((await aleFresh.rpc('delete_my_account', { p_confirm: 'ELIMINA ACCOUNT' })).data.ok, true);
  assert.deepEqual(await leftovers(ale.id), [], "dati di Alessia rimasti dopo l'eliminazione");
  assert.equal((await byA.client.from('journal_entries').select('id')).data.length, 1, 'ancora intatto: altra coppia');
});
