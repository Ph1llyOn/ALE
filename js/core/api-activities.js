// Attività di Alessia: schede, sessioni di allenamento, abitudini, obiettivi, proposte di Phill. Tutto su Supabase (RLS).
import { sb } from './supabase.js';
import { fail, AppError } from './api-base.js';
import { rpc } from './api.js';
import { localDay } from './format.js';

const clean = (v) => { const t = String(v ?? '').trim(); return t === '' ? null : t; };
const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

// --- Schede -----------------------------------------------------------------
export async function listWorkouts(userId) {
  const { data, error } = await sb.from('workouts')
    .select('id, title, notes, source, created_at, workout_exercises(id, exercise_key)')
    .eq('owner_id', userId).eq('archived', false).order('created_at', { ascending: false });
  if (error) fail(error);
  return data.map((w) => ({ ...w, exerciseCount: w.workout_exercises.length, keys: w.workout_exercises.map((e) => e.exercise_key).filter(Boolean) }));
}

export async function getWorkout(id) {
  const { data, error } = await sb.from('workouts')
    .select('id, title, notes, source, workout_exercises(id, position, name, exercise_key, sets, reps, rest_seconds, notes)').eq('id', id).maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  data.workout_exercises.sort((a, b) => a.position - b.position);
  return data;
}

/** Salva una scheda con i suoi esercizi (ordine = posizione). exercises: [{ exercise_key?, name, sets, reps, rest_seconds, notes }] */
export async function saveWorkout(userId, { id, title, notes, exercises }) {
  const t = String(title ?? '').trim();
  if (!t) throw new AppError('Dai un nome alla scheda.');
  if (!exercises.length) throw new AppError('Aggiungi almeno un esercizio.');
  let wid = id;
  if (wid) {
    const { error } = await sb.from('workouts').update({ title: t, notes: clean(notes) }).eq('id', wid);
    if (error) fail(error);
    const { error: e2 } = await sb.from('workout_exercises').delete().eq('workout_id', wid);
    if (e2) fail(e2);
  } else {
    const { data, error } = await sb.from('workouts').insert({ owner_id: userId, title: t, notes: clean(notes) }).select('id').single();
    if (error) fail(error);
    wid = data.id;
  }
  const rows = exercises.map((e, i) => ({
    workout_id: wid, owner_id: userId, position: i, name: String(e.name).trim(), exercise_key: e.exercise_key || null,
    sets: num(e.sets), reps: clean(e.reps), rest_seconds: num(e.rest_seconds), notes: clean(e.notes),
  }));
  const { error: e3 } = await sb.from('workout_exercises').insert(rows);
  if (e3) fail(e3);
  return wid;
}

export async function deleteWorkout(id) {
  const { error } = await sb.from('workouts').delete().eq('id', id);
  if (error) fail(error);
}

// --- Sessioni -----------------------------------------------------------------
export async function inProgressSession(userId) {
  const { data, error } = await sb.from('workout_sessions').select('id, title, started_at')
    .eq('owner_id', userId).eq('status', 'in_progress').order('started_at', { ascending: false }).limit(1);
  if (error) fail(error);
  return data[0] ?? null;
}

/** Avvia una sessione: dalla scheda (workoutId) o libera (workoutId null). I progressi nascono già salvati. */
export async function startSession(userId, { workoutId = null, title, exercises = [] }) {
  const { data: s, error } = await sb.from('workout_sessions')
    .insert({ owner_id: userId, workout_id: workoutId, title: title || 'Allenamento libero' }).select('id').single();
  if (error) fail(error);
  if (exercises.length) {
    const { error: e2 } = await sb.from('session_exercise_progress').insert(exercises.map((e, i) => ({
      session_id: s.id, owner_id: userId, position: i, name: e.name,
    })));
    if (e2) fail(e2);
  }
  return s.id;
}

export async function getSession(id) {
  const { data, error } = await sb.from('workout_sessions')
    .select('id, title, status, started_at, ended_at, notes, workout_id, session_exercise_progress(id, position, name, done, done_at)').eq('id', id).maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  data.session_exercise_progress.sort((a, b) => a.position - b.position);
  return data;
}

/** Salvataggio automatico: ogni spunta è scritta subito. */
export async function setExerciseDone(progressId, done) {
  const { error } = await sb.from('session_exercise_progress').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', progressId);
  if (error) fail(error);
}

export async function addSessionExercise(userId, sessionId, name, position) {
  const { data, error } = await sb.from('session_exercise_progress')
    .insert({ session_id: sessionId, owner_id: userId, position, name }).select('id, position, name, done, done_at').single();
  if (error) fail(error);
  return data;
}

export async function saveSessionNotes(id, notes) {
  const { error } = await sb.from('workout_sessions').update({ notes: clean(notes) }).eq('id', id);
  if (error) fail(error);
}

export async function finishSession(userId, session, notes) {
  const { error } = await sb.from('workout_sessions')
    .update({ status: 'completed', ended_at: new Date().toISOString(), notes: clean(notes) }).eq('id', session.id);
  if (error) fail(error);
  await addWin(userId, 'workout_completed', `Allenamento completato: ${session.title}`);
}

export async function discardSession(id) {
  const { error } = await sb.from('workout_sessions').delete().eq('id', id);
  if (error) fail(error);
}

export async function listSessions(userId, { limit = 40 } = {}) {
  const { data, error } = await sb.from('workout_sessions')
    .select('id, title, status, started_at, ended_at, session_exercise_progress(done)')
    .eq('owner_id', userId).eq('status', 'completed').order('started_at', { ascending: false }).limit(limit);
  if (error) fail(error);
  return data.map((s) => ({
    ...s, total: s.session_exercise_progress.length, done: s.session_exercise_progress.filter((p) => p.done).length,
    minutes: Math.max(1, Math.round((new Date(s.ended_at) - new Date(s.started_at)) / 60000)),
  }));
}

// --- Piccole conquiste (senza duplicati) ----------------------------------------
export async function addWin(userId, kind, title) {
  const { error } = await sb.from('progress_records')
    .upsert({ owner_id: userId, kind, title: title.slice(0, 120), achieved_on: localDay() }, { onConflict: 'owner_id,kind,title,achieved_on', ignoreDuplicates: true });
  if (error) fail(error);
}

// --- Abitudini ------------------------------------------------------------------
export async function listHabits(userId, sinceDay) {
  const { data, error } = await sb.from('habits').select('id, name, preset_key, archived, habit_logs(day, done)')
    .eq('owner_id', userId).eq('archived', false).order('created_at', { ascending: true });
  if (error) fail(error);
  return data.map((h) => ({ ...h, logs: h.habit_logs.filter((l) => l.day >= sinceDay && l.done).map((l) => l.day) }));
}

export async function addHabit(userId, { name, presetKey }) {
  const { data, error } = await sb.from('habits').insert({ owner_id: userId, name: name.trim(), preset_key: presetKey || null }).select().single();
  if (error) fail(error);
  return data;
}

export async function setHabitDone(userId, habitId, day, done) {
  if (done) {
    const { error } = await sb.from('habit_logs').upsert({ habit_id: habitId, owner_id: userId, day, done: true }, { onConflict: 'habit_id,day' });
    if (error) fail(error);
  } else {
    const { error } = await sb.from('habit_logs').delete().eq('habit_id', habitId).eq('day', day);
    if (error) fail(error);
  }
}

export async function archiveHabit(id) {
  const { error } = await sb.from('habits').update({ archived: true }).eq('id', id);
  if (error) fail(error);
}

/** Un'abitudine è "consolidata" quando è stata svolta almeno 21 giorni degli ultimi 30. Nessuna serie da non spezzare. */
export const isConsolidated = (logs) => logs.length >= 21;

// --- Obiettivi --------------------------------------------------------------------
export async function listGoals(ownerId) {
  const { data, error } = await sb.from('goals').select('id, title, notes, target_date, status, completed_at, created_at')
    .eq('owner_id', ownerId).neq('status', 'dropped').order('created_at', { ascending: false });
  if (error) fail(error);
  return data;
}

export async function addGoal(userId, { title, notes, targetDate }) {
  const { data, error } = await sb.from('goals').insert({ owner_id: userId, title: title.trim(), notes: clean(notes), target_date: targetDate || null }).select().single();
  if (error) fail(error);
  return data;
}

export async function setGoalDone(userId, goal, done) {
  const { error } = await sb.from('goals').update(done ? { status: 'done', completed_at: new Date().toISOString() } : { status: 'active', completed_at: null }).eq('id', goal.id);
  if (error) fail(error);
  if (done) await addWin(userId, 'goal_achieved', `Obiettivo raggiunto: ${goal.title}`);
}

export async function deleteGoal(id) {
  const { error } = await sb.from('goals').delete().eq('id', id);
  if (error) fail(error);
}

// --- Proposte di Phill --------------------------------------------------------------
export async function listProposals(ownerId, { status = 'proposed' } = {}) {
  const { data, error } = await sb.from('workout_proposals').select('id, title, notes, exercises, status, created_at, decided_at, proposer_id')
    .eq('owner_id', ownerId).eq('status', status).order('created_at', { ascending: false });
  if (error) fail(error);
  return data;
}

export const acceptProposal = (id, title, exercises) => rpc('accept_workout_proposal', { p_id: id, p_title: title ?? null, p_exercises: exercises ?? null });

export async function rejectProposal(id) {
  const { error } = await sb.from('workout_proposals').update({ status: 'rejected' }).eq('id', id);
  if (error) fail(error);
}
