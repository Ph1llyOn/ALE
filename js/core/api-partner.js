// Dati del partner visibili a Phill: SOLO ciò che Alessia ha condiviso. La RLS restituisce righe vuote per il resto,
// quindi queste funzioni non "filtrano" nulla da sole: leggono e il database decide.
import { sb } from './supabase.js';
import { fail, AppError } from './api-base.js';

/** Categorie che il partner ha condiviso con me. */
export async function sharedWithMe(ownerId, myId) {
  const { data, error } = await sb.from('sharing_permissions')
    .select('category').eq('owner_id', ownerId).eq('grantee_id', myId).is('revoked_at', null);
  if (error) fail(error);
  return new Set(data.map((r) => r.category));
}

export async function sharedWellbeing(ownerId, fromDay) {
  const { data, error } = await sb.from('wellbeing_logs')
    .select('day, mood, energy').eq('owner_id', ownerId).gte('day', fromDay).order('day', { ascending: false });
  if (error) fail(error);
  return data;
}

export async function sharedProgress(ownerId, limit = 10) {
  const { data, error } = await sb.from('progress_records')
    .select('id, kind, title, achieved_on').eq('owner_id', ownerId).order('achieved_on', { ascending: false }).limit(limit);
  if (error) fail(error);
  return data;
}

export async function sharedEquipment(ownerId) {
  const { data, error } = await sb.from('equipment')
    .select('id, name, notes, avoid').eq('owner_id', ownerId).order('created_at', { ascending: true });
  if (error) fail(error);
  return data;
}

// --- Dati condivisi in più (sempre filtrati dalla RLS) ------------------------------------------------
export async function sharedHabits(ownerId, sinceDay) {
  const { data, error } = await sb.from('habits').select('id, name, habit_logs(day, done)')
    .eq('owner_id', ownerId).eq('archived', false).order('created_at', { ascending: true });
  if (error) fail(error);
  return data.map((x) => ({ id: x.id, name: x.name, days: x.habit_logs.filter((l) => l.done && l.day >= sinceDay).map((l) => l.day) }));
}

export async function sharedGoals(ownerId) {
  const { data, error } = await sb.from('goals').select('id, title, status, target_date, completed_at')
    .eq('owner_id', ownerId).neq('status', 'dropped').order('created_at', { ascending: false }).limit(20);
  if (error) fail(error);
  return data;
}

export async function sharedSessions(ownerId, limit = 8) {
  const { data, error } = await sb.from('workout_sessions')
    .select('id, title, started_at, ended_at, session_exercise_progress(done)')
    .eq('owner_id', ownerId).eq('status', 'completed').order('started_at', { ascending: false }).limit(limit);
  if (error) fail(error);
  return data.map((s) => ({ ...s, total: s.session_exercise_progress.length, done: s.session_exercise_progress.filter((p) => p.done).length }));
}

// --- Proposte di allenamento (Phill propone, decide sempre Alessia) -----------------------------------
export async function proposeWorkout(userId, ownerId, { title, notes, exercises }) {
  const t = String(title ?? '').trim();
  if (!t) throw new AppError('Dai un nome alla proposta.');
  if (!exercises.length) throw new AppError('Scegli almeno un esercizio.');
  const { error } = await sb.from('workout_proposals').insert({
    owner_id: ownerId, proposer_id: userId, title: t, notes: String(notes ?? '').trim() || null,
    exercises: exercises.map((e) => ({ exercise_key: e.exercise_key, name: e.name, sets: e.sets, reps: e.reps, rest_seconds: e.rest_seconds, notes: e.notes ?? null })),
  });
  if (error) fail(error);
}

export async function listMyWorkoutProposals(userId) {
  const { data, error } = await sb.from('workout_proposals').select('id, title, status, created_at, decided_at, exercises')
    .eq('proposer_id', userId).order('created_at', { ascending: false }).limit(30);
  if (error) fail(error);
  return data;
}

export async function withdrawWorkoutProposal(id) {
  const { error } = await sb.from('workout_proposals').update({ status: 'withdrawn' }).eq('id', id);
  if (error) fail(error);
}
