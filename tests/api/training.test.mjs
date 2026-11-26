// Integrazione reale su Supabase locale: sessioni guidate, feedback privati, piano settimanale nel calendario, impostazioni di allenamento.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, cleanup, link } from './helpers.mjs';

let ale; let phill; let stranger;
const PLAN = { title: 'Forza e movimento', items: [
  { exercise_key: 'squat', name: 'Squat a corpo libero', phase: 'main', mode: 'reps', sets: 3, n: 12, rest_seconds: 60 },
  { exercise_key: 'plank-knees', name: 'Plank sulle ginocchia', phase: 'main', mode: 'time', sets: 2, seconds: 15, rest_seconds: 45 },
] };
const STATE = { v: 1, index: 0, stage: 'prepare', setNo: 1, startedAt: Date.now(), paused: false, pausedAt: null, pausedTotal: 0, since: null, elapsedBefore: 0, target: 0, lastDone: null,
  progress: [{ status: 'pending', setsDone: 0, setsSkipped: 0 }, { status: 'pending', setsDone: 0, setsSkipped: 0 }] };

async function newSession(owner = ale, extra = {}) {
  const s = await owner.client.from('workout_sessions').insert({ owner_id: owner.id, title: PLAN.title, plan: PLAN, run_state: STATE, ...extra }).select().single();
  assert.equal(s.error, null, s.error?.message);
  const rows = PLAN.items.map((i, k) => ({ session_id: s.data.id, owner_id: owner.id, position: k, name: i.name, exercise_key: i.exercise_key, sets_total: i.sets }));
  const p = await owner.client.from('session_exercise_progress').insert(rows).select();
  assert.equal(p.error, null, p.error?.message);
  return { session: s.data, progress: p.data };
}

before(async () => {
  ale = await makeUser('alessia', 'Alessia');
  phill = await makeUser('phill', 'Phill');
  stranger = await makeUser('phill', 'Estraneo');
  await link(ale, phill);
});
after(cleanup);

test('sessione guidata: stato e avanzamento si salvano passo per passo e si rileggono identici', async () => {
  const { session, progress } = await newSession();
  assert.equal(session.status, 'in_progress');
  const state = { ...STATE, stage: 'rest', index: 0, setNo: 2, since: 123456, target: 60000, progress: [{ status: 'active', setsDone: 1, setsSkipped: 0 }, STATE.progress[1]] };
  assert.equal((await ale.client.from('workout_sessions').update({ run_state: state }).eq('id', session.id)).error, null);
  assert.equal((await ale.client.from('session_exercise_progress').update({ status: 'active', sets_done: 1 }).eq('id', progress[0].id)).error, null);
  const back = (await ale.client.from('workout_sessions').select('run_state, session_exercise_progress(status, sets_done, sets_total, exercise_key, position)').eq('id', session.id).single()).data;
  assert.deepEqual(back.run_state, state, 'lo stato si riprende esattamente');
  const rows = back.session_exercise_progress.sort((a, b) => a.position - b.position);
  assert.deepEqual([rows[0].status, rows[0].sets_done, rows[0].sets_total, rows[0].exercise_key], ['active', 1, 3, 'squat']);
});

test('serie e esercizi saltati non possono risultare "fatti": coerenza imposta dal database', async () => {
  const { progress } = await newSession();
  const id = progress[0].id;
  assert.ok((await ale.client.from('session_exercise_progress').update({ status: 'skipped', done: true }).eq('id', id)).error, 'saltato ma done=true: rifiutato');
  assert.ok((await ale.client.from('session_exercise_progress').update({ status: 'done', done: false }).eq('id', id)).error, 'done senza done=true: rifiutato');
  assert.equal((await ale.client.from('session_exercise_progress').update({ status: 'skipped', done: false, sets_skipped: 3 }).eq('id', id)).error, null);
  assert.equal((await ale.client.from('session_exercise_progress').update({ status: 'done', done: true, sets_done: 3 }).eq('id', id)).error, null);
  assert.ok((await ale.client.from('session_exercise_progress').update({ status: 'boh' }).eq('id', id)).error);
  assert.ok((await ale.client.from('session_exercise_progress').update({ sets_done: 99 }).eq('id', id)).error);
});

test('chiusura: completata o interrotta richiedono la data di fine; stato incoerente rifiutato', async () => {
  const { session } = await newSession();
  assert.ok((await ale.client.from('workout_sessions').update({ status: 'stopped' }).eq('id', session.id)).error, 'senza ended_at');
  assert.equal((await ale.client.from('workout_sessions').update({ status: 'stopped', ended_at: new Date().toISOString() }).eq('id', session.id)).error, null);
  assert.ok((await ale.client.from('workout_sessions').update({ status: 'volato' }).eq('id', session.id)).error);
  const big = { ...STATE, junk: 'x'.repeat(5000) };
  assert.ok((await ale.client.from('workout_sessions').update({ run_state: big }).eq('id', session.id)).error, 'stato troppo grande');
});

test('FEEDBACK PRIVATI: Phill non li vede mai, nemmeno se Alessia condivide attività e progressi', async () => {
  const { session } = await newSession();
  const ins = await ale.client.from('exercise_feedback').insert({ owner_id: ale.id, session_id: session.id, exercise_key: 'squat', rating: 'pain', note: 'NOTA-PRIVATA-FEEDBACK' }).select().single();
  assert.equal(ins.error, null, ins.error?.message);
  for (const c of ['activities', 'progress', 'habits', 'calendar', 'wellbeing', 'journal', 'equipment']) await ale.client.rpc('set_sharing', { p_category: c, p_enabled: true });
  assert.equal((await phill.client.from('exercise_feedback').select('*')).data.length, 0, 'Phill non legge i feedback');
  assert.equal((await phill.client.from('exercise_feedback').select('*').eq('owner_id', ale.id)).data.length, 0);
  assert.equal((await stranger.client.from('exercise_feedback').select('*')).data.length, 0);
  assert.ok((await phill.client.from('exercise_feedback').insert({ owner_id: ale.id, session_id: session.id, exercise_key: 'plank-knees', rating: 'right' })).error, 'Phill non scrive feedback per Alessia');
  assert.equal((await phill.client.from('exercise_feedback').update({ rating: 'right' }).eq('id', ins.data.id).select()).data.length, 0);
  assert.equal((await phill.client.from('exercise_feedback').delete().eq('id', ins.data.id).select()).data.length, 0);
  // con le attività condivise Phill vede l'avanzamento (stato) ma non il feedback né le note
  const seen = (await phill.client.from('session_exercise_progress').select('name, status').eq('owner_id', ale.id)).data;
  assert.ok(seen.length >= 2);
  assert.ok(!JSON.stringify(seen).includes('NOTA-PRIVATA'));
  await ale.client.rpc('revoke_all_sharing');
  assert.equal((await ale.client.from('exercise_feedback').select('note').eq('id', ins.data.id).single()).data.note, 'NOTA-PRIVATA-FEEDBACK', 'Alessia continua a vederli');
});

test('feedback: uno per esercizio e sessione, modificabile; valori e lunghezze controllati; spariscono con la sessione', async () => {
  const { session } = await newSession();
  const row = (over = {}) => ({ owner_id: ale.id, session_id: session.id, exercise_key: 'squat', rating: 'right', ...over });
  assert.equal((await ale.client.from('exercise_feedback').insert(row())).error, null);
  assert.ok((await ale.client.from('exercise_feedback').insert(row({ rating: 'hard' }))).error, 'doppione per lo stesso esercizio');
  const up = await ale.client.from('exercise_feedback').upsert(row({ rating: 'too_easy', note: 'più leggera' }), { onConflict: 'session_id,exercise_key' }).select();
  assert.equal(up.error, null, up.error?.message);
  assert.equal(up.data[0].rating, 'too_easy');
  for (const rating of ['too_easy', 'right', 'hard', 'too_hard', 'pain', 'not_completed']) assert.equal((await ale.client.from('exercise_feedback').upsert(row({ rating }), { onConflict: 'session_id,exercise_key' })).error, null, rating);
  assert.ok((await ale.client.from('exercise_feedback').insert(row({ exercise_key: 'plank-knees', rating: 'bene' }))).error);
  assert.ok((await ale.client.from('exercise_feedback').insert(row({ exercise_key: 'Plank!!', rating: 'right' }))).error);
  assert.ok((await ale.client.from('exercise_feedback').insert(row({ exercise_key: 'plank-knees', note: 'x'.repeat(501) }))).error);
  assert.equal((await ale.client.from('workout_sessions').delete().eq('id', session.id)).error, null);
  assert.equal((await ale.client.from('exercise_feedback').select('id').eq('session_id', session.id)).data.length, 0, 'i feedback seguono la sessione');
});

test('esportazione dati: include i feedback (28 tabelle)', async () => {
  const exp = await ale.client.rpc('export_my_data');
  assert.equal(exp.data.ok, true);
  assert.equal(Object.keys(exp.data.data).length, 28);
  assert.ok(Array.isArray(exp.data.data.exercise_feedback));
});

test('PIANO nel calendario: chiave unica (niente duplicati), eventi manuali non toccati, regole di coerenza', async () => {
  const when = (h) => new Date(Date.UTC(2030, 0, 7, h)).toISOString();
  const ev = (over = {}) => ({ owner_id: ale.id, created_by: ale.id, title: 'Forza e movimento · 30 min', category: 'workout', starts_at: when(17), source: 'plan', plan_key: '2030-W02:1:plan', plan_data: { kind: 'strength', minutes: 30 }, ...over });
  const one = await ale.client.from('calendar_events').insert(ev()).select().single();
  assert.equal(one.error, null, one.error?.message);
  assert.equal(one.data.user_modified, false);
  const dup = await ale.client.from('calendar_events').insert(ev({ starts_at: when(18) }));
  assert.equal(dup.error?.code, '23505', 'stessa chiave: duplicato rifiutato');
  const ignore = await ale.client.from('calendar_events').upsert(ev({ starts_at: when(19) }), { onConflict: 'owner_id,plan_key', ignoreDuplicates: true });
  assert.equal(ignore.error, null, 'il piano può essere riapplicato senza errori e senza duplicati');
  assert.equal((await ale.client.from('calendar_events').select('id').eq('owner_id', ale.id).eq('plan_key', '2030-W02:1:plan')).data.length, 1);
  assert.ok((await ale.client.from('calendar_events').insert(ev({ plan_key: null }))).error, 'evento del piano senza chiave');
  assert.ok((await ale.client.from('calendar_events').insert(ev({ source: 'manual', plan_key: '2030-W02:2:plan' }))).error, 'evento manuale con chiave del piano');
  assert.ok((await ale.client.from('calendar_events').insert(ev({ plan_key: 'inventata' }))).error, 'chiave in formato sbagliato');
  // più eventi manuali senza chiave restano possibili, e uno stesso formato di chiave vale per un\'altra persona
  for (let i = 0; i < 2; i++) assert.equal((await ale.client.from('calendar_events').insert({ owner_id: ale.id, created_by: ale.id, title: 'Cena', category: 'personal', starts_at: when(20 + i) })).error, null);
  // modifica da parte di Alessia: l'evento resta suo e viene segnato come modificato
  assert.equal((await ale.client.from('calendar_events').update({ user_modified: true, title: 'Allenamento spostato' }).eq('id', one.data.id)).error, null);
  // Phill non può creare né modificare eventi del piano di Alessia
  assert.ok((await phill.client.from('calendar_events').insert(ev({ plan_key: '2030-W02:3:plan', created_by: phill.id, status: 'proposed' }))).error, 'Phill non può creare eventi del piano');
  assert.equal((await phill.client.from('calendar_events').update({ title: 'hack' }).eq('id', one.data.id).select()).data.length, 0);
});

test('impostazioni di allenamento: valori validi, limiti controllati, private', async () => {
  const ok = await ale.client.from('user_settings').insert({
    user_id: ale.id, fitness_level: 'intermediate', session_minutes: 40, weekly_sessions: 4, available_days: [1, 3, 5, 6], avoid_flags: ['lumbar', 'impact'],
    preferences: { treadmill: true, abs: true, treadmill_speed: 3.5, treadmill_incline: 1 }, auto_plan: false,
  }).select().single();
  assert.equal(ok.error, null, ok.error?.message);
  assert.deepEqual(ok.data.available_days, [1, 3, 5, 6]);
  const patch = (p) => ale.client.from('user_settings').update(p).eq('user_id', ale.id);
  for (const bad of [{ fitness_level: 'esperta' }, { session_minutes: 5 }, { session_minutes: 500 }, { weekly_sessions: 0 }, { weekly_sessions: 9 }, { available_days: [] }, { available_days: [0, 8] },
    { avoid_flags: ['ginocchio-inventato'] }, { avoid_flags: Array(11).fill('lumbar') }, { preferences: [] }, { preferences: { x: 'y'.repeat(2000) } }]) {
    assert.ok((await patch(bad)).error, `valore non valido accettato: ${JSON.stringify(bad).slice(0, 60)}`);
  }
  assert.equal((await patch({ weekly_sessions: 2, avoid_flags: [] })).error, null);
  assert.equal((await phill.client.from('user_settings').select('*').eq('user_id', ale.id)).data.length, 0, 'impostazioni, limitazioni e preferenze: private');
  assert.ok((await phill.client.from('user_settings').update({ fitness_level: 'advanced' }).eq('user_id', ale.id).select()).data.length === 0);
});
