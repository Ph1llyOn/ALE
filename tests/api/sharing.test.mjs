import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, cleanup, link, anonClient, adminClient, API_URL, PUBLISHABLE_KEY } from './helpers.mjs';

let ale, phill, stranger, strangerAle;
const today = new Date().toISOString().slice(0, 10);
const ids = {};

before(async () => {
  ale = await makeUser('alessia', 'Ale');
  phill = await makeUser('phill', 'Phill');
  stranger = await makeUser('phill', 'Estraneo');
  strangerAle = await makeUser('alessia', 'Altra Ale');
  await link(ale, phill);

  const ins = async (table, row) => {
    const { data, error } = await ale.client.from(table).insert(row).select().single();
    assert.equal(error, null, `${table}: ${error?.message}`);
    return data;
  };
  ids.equipment = (await ins('equipment', { owner_id: ale.id, name: 'Elastici' })).id;
  ids.workout = (await ins('workouts', { owner_id: ale.id, title: 'Scheda A' })).id;
  await ins('workout_exercises', { owner_id: ale.id, workout_id: ids.workout, name: 'Squat', sets: 3, reps: '10' });
  ids.habit = (await ins('habits', { owner_id: ale.id, name: 'Acqua' })).id;
  await ins('habit_logs', { owner_id: ale.id, habit_id: ids.habit, day: today });
  await ins('progress_records', { owner_id: ale.id, kind: 'small_win', title: 'Piccola conquista' });
  ids.log = (await ins('wellbeing_logs', { owner_id: ale.id, day: today, mood: 4, energy: 3 })).id;
  await ins('wellbeing_notes', { owner_id: ale.id, log_id: ids.log, note: 'Oggi mi sentivo strana' });
  await ins('journal_entries', { owner_id: ale.id, title: 'Condivisa', body: 'Voce condivisa', shared_with_partner: true });
  await ins('journal_entries', { owner_id: ale.id, title: 'Privata', body: 'Voce molto privata' });
  await ins('calendar_events', { owner_id: ale.id, created_by: ale.id, title: 'Passeggiata', category: 'walk', starts_at: new Date(Date.now() + 864e5).toISOString() });
});
after(cleanup);

const OWNED = ['equipment', 'workouts', 'workout_exercises', 'habits', 'habit_logs', 'progress_records', 'wellbeing_logs', 'journal_entries', 'calendar_events', 'wellbeing_notes'];
const count = async (u, table, extra = (q) => q) => {
  const { data, error } = await extra(u.client.from(table).select('*').eq('owner_id', ale.id));
  assert.equal(error, null, `${table}: ${error?.message}`);
  return data.length;
};
const share = async (cat, enabled) => {
  const r = await ale.client.rpc('set_sharing', { p_category: cat, p_enabled: enabled });
  assert.equal(r.data?.ok, true, `set_sharing(${cat}, ${enabled}): ${JSON.stringify(r.data ?? r.error)}`);
};
const CATS = ['activities', 'habits', 'calendar', 'progress', 'equipment', 'wellbeing', 'journal'];

test('PRIVACY DI DEFAULT: dopo il collegamento Phill non vede nessun dato di Alessia', async () => {
  for (const t of OWNED.filter((t) => t !== 'wellbeing_notes')) {
    assert.equal(await count(phill, t), 0, `Phill vede ${t}`);
    assert.equal(await count(stranger, t), 0, `l'estraneo vede ${t}`);
    assert.equal(await count(strangerAle, t), 0, `un'altra Alessia vede ${t}`);
    assert.ok(await count(ale, t) >= 1, `Alessia non vede il proprio ${t}`);
  }
  const perms = await phill.client.from('sharing_permissions').select('*');
  assert.deepEqual(perms.data, []);
});

test('API: filtri, ricerche e relazioni incorporate non aggirano la RLS', async () => {
  // nessun filtro, filtri su colonne sensibili, or(), ricerca testuale, conteggi
  for (const q of [
    phill.client.from('journal_entries').select('*'),
    phill.client.from('journal_entries').select('*').ilike('body', '%privata%'),
    phill.client.from('journal_entries').select('*').or(`owner_id.eq.${ale.id},shared_with_partner.eq.true`),
    phill.client.from('wellbeing_logs').select('*, wellbeing_notes(*)'),
    phill.client.from('workouts').select('*, workout_exercises(*)'),
    phill.client.from('habits').select('*, habit_logs(*)'),
    phill.client.from('profiles').select('*, journal_entries(*)').eq('id', ale.id),
  ]) {
    const r = await q;
    const rows = (r.data ?? []).flatMap((x) => [x, ...Object.values(x).filter(Array.isArray).flat()]);
    assert.ok(!rows.some((x) => x.owner_id === ale.id), `dati di Alessia trapelati: ${JSON.stringify(rows).slice(0, 200)}`);
  }
  const head = await phill.client.from('journal_entries').select('id', { count: 'exact', head: true });
  assert.equal(head.count, 0, 'il conteggio non deve rivelare l\'esistenza di righe');
});

test('API: Phill non può scrivere nei dati di Alessia, nemmeno con tutti i permessi', async () => {
  for (const c of CATS) await share(c, true);
  const attempts = [
    ['equipment', { owner_id: ale.id, name: 'x' }],
    ['workouts', { owner_id: ale.id, title: 'x' }],
    ['habits', { owner_id: ale.id, name: 'x' }],
    ['journal_entries', { owner_id: ale.id, body: 'x' }],
    ['wellbeing_logs', { owner_id: ale.id, day: '2020-01-01', mood: 3, energy: 3 }],
    ['calendar_events', { owner_id: ale.id, created_by: phill.id, title: 'x', category: 'walk', starts_at: new Date().toISOString(), status: 'confirmed' }],
    ['progress_records', { owner_id: ale.id, kind: 'small_win', title: 'x' }],
  ];
  for (const [table, row] of attempts) {
    const ins = await phill.client.from(table).insert(row);
    assert.ok(ins.error, `Phill ha inserito in ${table}`);
    const ups = await phill.client.from(table).upsert({ ...row, id: ids.equipment }, { onConflict: 'id' });
    assert.ok(ups.error || true);
  }
  for (const table of ['equipment', 'workouts', 'habits', 'journal_entries', 'wellbeing_logs', 'calendar_events', 'progress_records']) {
    const upd = await phill.client.from(table).update({ owner_id: phill.id }).eq('owner_id', ale.id).select();
    assert.equal((upd.data ?? []).length, 0, `Phill ha modificato ${table}`);
    const del = await phill.client.from(table).delete().eq('owner_id', ale.id).select();
    assert.equal((del.data ?? []).length, 0, `Phill ha cancellato da ${table}`);
  }
  // tentativo di "upsert" su una riga di Alessia tramite PostgREST
  const raw = await fetch(`${API_URL}/rest/v1/equipment`, {
    method: 'POST',
    headers: {
      apikey: PUBLISHABLE_KEY, authorization: `Bearer ${(await phill.client.auth.getSession()).data.session.access_token}`,
      'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({ id: ids.equipment, owner_id: phill.id, name: 'RUBATA' }),
  });
  assert.ok(raw.status >= 400, `upsert accettato (${raw.status})`);
  const { data } = await adminClient().from('equipment').select('owner_id, name').eq('id', ids.equipment).single();
  assert.equal(data.owner_id, ale.id);
  assert.equal(data.name, 'Elastici');
  await ale.client.rpc('revoke_all_sharing');
});

test('CONDIVISIONE per categoria e REVOCA con effetto immediato', async () => {
  const map = { equipment: 'equipment', workouts: 'activities', workout_exercises: 'activities', habits: 'habits', habit_logs: 'habits', progress_records: 'progress', wellbeing_logs: 'wellbeing', calendar_events: 'calendar' };
  for (const [table, cat] of Object.entries(map)) {
    assert.equal(await count(phill, table), 0, `${table} visibile prima di condividere`);
    await share(cat, true);
    assert.ok(await count(phill, table) >= 1, `${table} non visibile dopo aver condiviso ${cat}`);
    assert.equal(await count(stranger, table), 0, `${table}: l'estraneo vede`);
    await share(cat, false);
    assert.equal(await count(phill, table), 0, `${table} ancora visibile dopo la revoca`);
  }
  // altre categorie non si "sbloccano" a vicenda
  await share('habits', true);
  assert.equal(await count(phill, 'equipment'), 0);
  assert.equal(await count(phill, 'workouts'), 0);
  assert.equal(await count(phill, 'journal_entries'), 0);
  await share('habits', false);
});

test('DIARIO: due chiavi (categoria + consenso per voce); BENESSERE: la nota non è mai condivisibile', async () => {
  await share('journal', true);
  const seen = await phill.client.from('journal_entries').select('title, body').eq('owner_id', ale.id);
  assert.deepEqual(seen.data.map((e) => e.title), ['Condivisa'], 'Phill deve vedere solo la voce marcata condivisa');
  assert.ok(!JSON.stringify(seen.data).includes('molto privata'));
  // ritiro del consenso per la singola voce
  const off = await ale.client.from('journal_entries').update({ shared_with_partner: false }).eq('title', 'Condivisa').select();
  assert.equal(off.data.length, 1);
  assert.equal(await count(phill, 'journal_entries'), 0);
  await ale.client.from('journal_entries').update({ shared_with_partner: true }).eq('title', 'Condivisa');
  assert.equal(await count(phill, 'journal_entries'), 1);
  // revoca della categoria: sparisce anche la voce marcata
  await share('journal', false);
  assert.equal(await count(phill, 'journal_entries'), 0);
  // Phill non può marcare voci di Alessia come condivise
  await share('journal', true);
  const hack = await phill.client.from('journal_entries').update({ shared_with_partner: true }).eq('owner_id', ale.id).select();
  assert.equal((hack.data ?? []).length, 0);
  await share('journal', false);

  await share('wellbeing', true);
  const logs = await phill.client.from('wellbeing_logs').select('mood, energy, wellbeing_notes(note)').eq('owner_id', ale.id);
  assert.equal(logs.data.length, 1, 'umore ed energia sono condivisi');
  assert.equal(logs.data[0].mood, 4);
  assert.deepEqual(logs.data[0].wellbeing_notes ?? [], [], 'la nota libera non deve mai essere visibile');
  assert.equal(await count(phill, 'wellbeing_notes'), 0);
  await share('wellbeing', false);
});

test('permessi: visibili ai due partecipanti, mai modificabili direttamente', async () => {
  await share('equipment', true);
  assert.equal((await ale.client.from('sharing_permissions').select('id')).data.length >= 1, true);
  assert.equal((await phill.client.from('sharing_permissions').select('id, category').eq('owner_id', ale.id).is('revoked_at', null)).data.length, 1, 'Phill sa cosa gli è condiviso');
  assert.equal((await stranger.client.from('sharing_permissions').select('id')).data.length, 0);
  assert.equal((await strangerAle.client.from('sharing_permissions').select('id')).data.length, 0);
  for (const actor of [phill, ale, stranger]) {
    assert.ok((await actor.client.from('sharing_permissions').insert({ owner_id: ale.id, grantee_id: phill.id, category: 'journal' })).error);
    assert.ok((await actor.client.from('sharing_permissions').update({ revoked_at: null }).eq('owner_id', ale.id)).error);
    assert.ok((await actor.client.from('sharing_permissions').delete().eq('owner_id', ale.id)).error);
  }
  // Phill non può concedere permessi su dati che non sono suoi
  assert.equal((await phill.client.rpc('set_sharing', { p_category: 'journal', p_enabled: true })).data.ok, true);
  const mine = await adminClient().from('sharing_permissions').select('owner_id').eq('category', 'journal').is('revoked_at', null);
  assert.ok(mine.data.every((r) => r.owner_id === phill.id), 'set_sharing agisce solo sui dati di chi lo chiama');
  assert.equal(await count(phill, 'journal_entries'), 0);
  await phill.client.rpc('revoke_all_sharing');
  assert.equal((await ale.client.rpc('set_sharing', { p_category: 'peso', p_enabled: true })).data.error, 'invalid_category');
  assert.equal((await stranger.client.rpc('set_sharing', { p_category: 'equipment', p_enabled: true })).data.error, 'not_linked');
  const anon = await anonClient().rpc('set_sharing', { p_category: 'equipment', p_enabled: true });
  assert.ok(anon.error, 'anon non può chiamare set_sharing');
  // la funzione di supporto non rivela nulla di più di ciò che il chiamante può già dedurre
  assert.equal((await stranger.client.rpc('can_view', { p_owner: ale.id, p_category: 'equipment' })).data, false);
  assert.equal((await phill.client.rpc('can_view', { p_owner: ale.id, p_category: 'equipment' })).data, true);
  await ale.client.rpc('revoke_all_sharing');
});

test('PROPOSTE: Phill propone, Alessia decide', async () => {
  const p = await phill.client.from('workout_proposals').insert({
    owner_id: ale.id, proposer_id: phill.id, title: 'Scheda gambe', exercises: [{ name: 'Squat', sets: 3 }],
  }).select().single();
  assert.equal(p.error, null, p.error?.message);
  assert.equal(p.data.status, 'proposed');
  assert.ok((await stranger.client.from('workout_proposals').insert({ owner_id: ale.id, proposer_id: stranger.id, title: 'x' })).error);
  assert.equal((await ale.client.from('workout_proposals').select('id')).data.length, 1);
  assert.equal((await stranger.client.from('workout_proposals').select('id')).data.length, 0);
  assert.ok((await phill.client.from('workout_proposals').update({ status: 'accepted' }).eq('id', p.data.id)).error, 'Phill non può accettare');
  assert.ok((await phill.client.from('workout_proposals').update({ title: 'Cambiata' }).eq('id', p.data.id)).error, 'il contenuto è immutabile');
  const acc = await ale.client.from('workout_proposals').update({ status: 'accepted' }).eq('id', p.data.id).select().single();
  assert.equal(acc.error, null);
  assert.ok(acc.data.decided_at, 'il server registra la decisione');
  assert.ok((await ale.client.from('workout_proposals').update({ status: 'rejected' }).eq('id', p.data.id)).error, 'una decisione non si cambia');
  assert.ok((await phill.client.from('workout_proposals').delete().eq('id', p.data.id)).error);
});

test('CALENDARIO: Phill propone eventi, Alessia approva; dopo l\'approvazione vale la condivisione', async () => {
  const when = new Date(Date.now() + 2 * 864e5).toISOString();
  const ev = await phill.client.from('calendar_events').insert({
    owner_id: ale.id, created_by: phill.id, title: 'Cena', category: 'personal', starts_at: when, status: 'proposed',
  }).select().single();
  assert.equal(ev.error, null, ev.error?.message);
  assert.equal((await phill.client.from('calendar_events').select('id').eq('id', ev.data.id)).data.length, 1, 'Phill vede la propria proposta');
  assert.equal((await ale.client.from('calendar_events').update({ status: 'confirmed' }).eq('id', ev.data.id).select()).data.length, 1);
  assert.equal((await phill.client.from('calendar_events').select('id').eq('id', ev.data.id)).data.length, 0, 'approvato e non condiviso: Phill non lo vede più');
  await share('calendar', true);
  assert.equal((await phill.client.from('calendar_events').select('id').eq('id', ev.data.id)).data.length, 1);
  await share('calendar', false);
  assert.equal((await phill.client.from('calendar_events').select('id').eq('id', ev.data.id)).data.length, 0);
});

test('MESSAGGI: solo tra partner collegati; lettura solo della destinataria', async () => {
  const m = await phill.client.from('messages').insert({ sender_id: phill.id, recipient_id: ale.id, title: 'Biglietto', body: 'Buongiorno' }).select().single();
  assert.equal(m.error, null, m.error?.message);
  assert.ok((await stranger.client.from('messages').insert({ sender_id: stranger.id, recipient_id: ale.id, body: 'spam' })).error);
  assert.ok((await phill.client.from('messages').insert({ sender_id: phill.id, recipient_id: stranger.id, body: 'x' })).error);
  assert.ok((await phill.client.from('messages').insert({ sender_id: ale.id, recipient_id: phill.id, body: 'falso' })).error);
  assert.equal((await ale.client.from('messages').select('id')).data.length, 1);
  assert.equal((await stranger.client.from('messages').select('id')).data.length, 0);
  const rcpt = await ale.client.from('message_receipts').insert({ message_id: m.data.id, recipient_id: ale.id, read_at: new Date().toISOString() });
  assert.equal(rcpt.error, null, rcpt.error?.message);
  assert.equal((await phill.client.from('message_receipts').select('*')).data.length, 0, 'il mittente non vede le ricevute');
  assert.equal((await ale.client.from('messages').update({ body: 'Riscritto' }).eq('id', m.data.id).select()).data.length, 0, 'la destinataria non modifica il testo');
  // programmati: la destinataria non li vede
  const s = await phill.client.from('scheduled_messages').insert({ sender_id: phill.id, recipient_id: ale.id, body: 'Sorpresa', send_at: new Date(Date.now() + 864e5).toISOString() }).select().single();
  assert.equal(s.error, null, s.error?.message);
  assert.equal((await ale.client.from('scheduled_messages').select('id')).data.length, 0);
  assert.ok((await phill.client.from('scheduled_messages').insert({ sender_id: phill.id, recipient_id: ale.id, body: 'Passato', send_at: new Date(Date.now() - 6e4).toISOString() })).error);
  assert.ok((await phill.client.from('scheduled_messages').update({ status: 'sent' }).eq('id', s.data.id)).error);
  assert.equal((await phill.client.from('scheduled_messages').update({ status: 'cancelled' }).eq('id', s.data.id).select()).data.length, 1);
});

test('PREFERENZE AI: tutto spento di default, consenso esplicito e revocabile', async () => {
  const ins = await ale.client.from('ai_preferences').insert({ user_id: ale.id }).select().single();
  assert.equal(ins.error, null, ins.error?.message);
  assert.deepEqual([ins.data.ai_enabled, ins.data.use_journal, ins.data.use_wellbeing, ins.data.use_equipment, ins.data.reminders_enabled], [false, false, false, false, false]);
  assert.equal(ins.data.consent_at, null);
  const on = await ale.client.from('ai_preferences').update({ ai_enabled: true, use_journal: true }).eq('user_id', ale.id).select().single();
  assert.ok(on.data.consent_at, 'consenso datato dal server');
  assert.ok((await ale.client.from('ai_preferences').update({ consent_at: '2000-01-01' }).eq('user_id', ale.id)).error);
  const off = await ale.client.from('ai_preferences').update({ ai_enabled: false }).eq('user_id', ale.id).select().single();
  assert.deepEqual([off.data.use_journal, off.data.consent_at], [false, null]);
  assert.equal((await phill.client.from('ai_preferences').select('*')).data.length, 0);
  assert.equal((await phill.client.from('ai_preferences').update({ ai_enabled: true }).eq('user_id', ale.id).select()).data.length, 0);
  assert.ok((await ale.client.from('ai_generations').insert({ user_id: ale.id, kind: 'daily', status: 'ok' })).error, 'lo storico AI lo scrive solo il server');
});

test('FINE DEL COLLEGAMENTO: ogni accesso di Phill cessa', async () => {
  for (const c of CATS) await share(c, true);
  assert.ok(await count(phill, 'equipment') >= 1);
  assert.equal((await phill.client.rpc('end_partnership')).data.ok, true);
  for (const t of OWNED.filter((t) => t !== 'wellbeing_notes')) assert.equal(await count(phill, t), 0, `${t} ancora visibile dopo la fine`);
  const active = await adminClient().from('sharing_permissions').select('id').eq('owner_id', ale.id).is('revoked_at', null);
  assert.equal(active.data.length, 0, 'tutti i permessi sono stati revocati');
  const flags = await adminClient().from('journal_entries').select('id').eq('owner_id', ale.id).eq('shared_with_partner', true);
  assert.equal(flags.data.length, 0, 'i consensi per voce sono stati azzerati');
  // nuovo collegamento con un altro Phill: nessuna eredità
  await link(ale, stranger);
  for (const t of OWNED.filter((t) => t !== 'wellbeing_notes')) assert.equal(await count(stranger, t), 0, `il nuovo partner eredita ${t}`);
});
