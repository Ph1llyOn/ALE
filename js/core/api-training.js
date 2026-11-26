// Allenamento intelligente: contesto per il motore, sessioni guidate salvate passo per passo, feedback privati, piano settimanale.
// Tutto su Supabase (RLS): i feedback hanno una tabella a parte, leggibile solo da Alessia.
import { sb } from './supabase.js';
import { fail, AppError } from './api-base.js';
import { listEquipment } from './api-personal.js';
import { getSettings } from './api-settings.js';
import { addWin } from './api-activities.js';
import { localDay } from './format.js';
import { exercise, normalizeCtx, planWeek, reconcilePlan, weekStartOf, addDaysStr, dayNum } from '../data/planner-core.js';
import { initialState } from '../features/activities/session-core.js';
import { toIso } from '../data/calendar-util.js';

const HISTORY_DAYS = 90;
const dayOf = (iso) => localDay(new Date(iso));

// --- storico e feedback --------------------------------------------------------------------------------------
/** Esercizi svolti negli ultimi giorni: [{ day, key, setsDone, seconds }]. Solo serie davvero fatte. */
export async function listHistory(userId, days = HISTORY_DAYS) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data, error } = await sb.from('workout_sessions')
    .select('id, started_at, plan, session_exercise_progress(exercise_key, status, sets_done)')
    .eq('owner_id', userId).in('status', ['completed', 'stopped']).gte('started_at', since).order('started_at', { ascending: false }).limit(200);
  if (error) fail(error);
  const out = [];
  for (const s of data) {
    const items = new Map((s.plan?.items ?? []).map((i) => [i.exercise_key, i]));
    for (const p of s.session_exercise_progress) {
      if (!p.exercise_key || !(p.sets_done > 0)) continue;
      const it = items.get(p.exercise_key);
      out.push({ day: dayOf(s.started_at), key: p.exercise_key, setsDone: p.sets_done, seconds: it?.mode === 'time' ? it.seconds * p.sets_done : null });
    }
  }
  return out;
}

export async function listFeedback(userId, days = HISTORY_DAYS) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data, error } = await sb.from('exercise_feedback').select('exercise_key, rating, created_at').eq('owner_id', userId).gte('created_at', since).order('created_at', { ascending: false });
  if (error) fail(error);
  return data.map((f) => ({ key: f.exercise_key, rating: f.rating, day: dayOf(f.created_at) }));
}

/** Feedback su un esercizio di una sessione (uno per esercizio, modificabile). Privato: nessuna categoria di condivisione lo include. */
export async function saveFeedback(userId, sessionId, key, rating, note) {
  const row = { owner_id: userId, session_id: sessionId, exercise_key: key, rating, note: String(note ?? '').trim() || null };
  const { error } = await sb.from('exercise_feedback').upsert(row, { onConflict: 'session_id,exercise_key' });
  if (error) fail(error);
}

export async function getSessionFeedback(sessionId) {
  const { data, error } = await sb.from('exercise_feedback').select('exercise_key, rating, note').eq('session_id', sessionId);
  if (error) fail(error);
  return new Map(data.map((f) => [f.exercise_key, f]));
}

// --- contesto per il motore -------------------------------------------------------------------------------------
/** Tutto ciò che serve al motore, letto da Supabase: impostazioni, attrezzi, storico, feedback. */
export async function loadTrainingContext(userId, { seed = 0 } = {}) {
  const [settings, items, history, feedback] = await Promise.all([getSettings(userId), listEquipment(userId), listHistory(userId), listFeedback(userId)]);
  const ctx = normalizeCtx({
    items, prefersNoEquipment: settings.prefers_no_equipment, level: settings.fitness_level, minutes: settings.session_minutes,
    avoidFlags: settings.avoid_flags, prefs: settings.preferences, history, feedback, today: localDay(), seed,
  });
  return { ctx, settings };
}

// --- sessioni guidate -----------------------------------------------------------------------------------------------
/** Crea una sessione guidata da un piano ({ title, items }). Lo stato iniziale è "preparazione": non parte nulla da solo. */
export async function createGuidedSession(userId, plan, { eventId = null, workoutId = null } = {}) {
  if (!plan?.items?.length) throw new AppError('Non c’è nessun esercizio da fare.');
  const now = Date.now();
  const slim = { kind: plan.kind ?? null, title: plan.title, items: plan.items.map((i) => ({
    exercise_key: i.exercise_key ?? null, name: i.name, phase: i.phase ?? 'main', mode: i.mode, sets: i.sets, n: i.n ?? null, seconds: i.seconds ?? null,
    reps: i.reps ?? null, rest_seconds: i.rest_seconds ?? 0, per_side: Boolean(i.per_side), notes: i.notes ?? null, why: (i.why ?? []).slice(0, 3), equipment: i.equipment ?? [], treadmill: i.treadmill ?? null,
  })) };
  const { data: s, error } = await sb.from('workout_sessions').insert({
    owner_id: userId, workout_id: workoutId, event_id: eventId, title: plan.title || 'Allenamento', plan: slim, run_state: initialState(slim, now),
  }).select('id').single();
  if (error) fail(error);
  const rows = slim.items.map((i, k) => ({ session_id: s.id, owner_id: userId, position: k, name: i.name, exercise_key: i.exercise_key, sets_total: i.sets }));
  const { error: e2 } = await sb.from('session_exercise_progress').insert(rows);
  if (e2) fail(e2);
  return s.id;
}

export async function loadGuidedSession(id) {
  const { data, error } = await sb.from('workout_sessions')
    .select('id, title, status, started_at, ended_at, plan, run_state, event_id, session_exercise_progress(id, position, name, exercise_key, status, sets_done, sets_skipped, sets_total, done)').eq('id', id).maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  data.session_exercise_progress.sort((a, b) => a.position - b.position);
  return data;
}

/** Salva lo stato della sessione. Aggiorna le righe di avanzamento solo dove qualcosa è cambiato. */
export async function saveRunState(session, prev, next) {
  const { error } = await sb.from('workout_sessions').update({ run_state: next }).eq('id', session.id);
  if (error) fail(error);
  for (let i = 0; i < next.progress.length; i++) {
    const a = prev?.progress?.[i]; const b = next.progress[i]; const row = session.session_exercise_progress[i];
    if (!row || (a && a.status === b.status && a.setsDone === b.setsDone && a.setsSkipped === b.setsSkipped)) continue;
    const { error: e2 } = await sb.from('session_exercise_progress').update({
      status: b.status, sets_done: b.setsDone, sets_skipped: b.setsSkipped, done: b.status === 'done', done_at: b.status === 'done' ? new Date().toISOString() : null,
    }).eq('id', row.id);
    if (e2) fail(e2);
  }
}

/** Chiude la sessione: 'completed' (tutto il percorso) o 'stopped' (interrotta). Collega il calendario e registra una piccola conquista. */
export async function closeGuidedSession(userId, session, status, state) {
  const { error } = await sb.from('workout_sessions').update({ status, ended_at: new Date().toISOString(), run_state: state }).eq('id', session.id);
  if (error) fail(error);
  if (status === 'completed' && session.event_id) await sb.from('calendar_events').update({ completed: true }).eq('id', session.event_id);
  if (status === 'completed' && state.progress.some((p) => p.status === 'done')) await addWin(userId, 'workout_completed', `Allenamento finito: ${session.title}`);
}

/** Itinerario di una scheda salvata come piano guidato (ricava modalità e durata dal catalogo o dal testo). */
export function planFromWorkout(workout) {
  return {
    title: workout.title,
    items: workout.workout_exercises.map((e) => {
      const cat = e.exercise_key ? exercise(e.exercise_key) : null;
      const text = String(e.reps ?? '');
      const sec = /(\d+)\s*minut/i.exec(text) ? +/(\d+)\s*minut/i.exec(text)[1] * 60 : /(\d+)\s*second/i.exec(text) ? +/(\d+)\s*second/i.exec(text)[1] : null;
      const time = cat ? cat.mode === 'time' : sec !== null;
      return {
        exercise_key: e.exercise_key ?? null, name: e.name, phase: cat?.phases?.[0] === 'warmup' ? 'warmup' : 'main', mode: time ? 'time' : 'reps', sets: e.sets ?? 1,
        n: time ? null : (parseInt(text, 10) || cat?.n || 10), seconds: time ? (sec ?? cat?.seconds ?? 30) : null, reps: text || null, rest_seconds: e.rest_seconds ?? 0,
        per_side: /per lato/i.test(text), notes: e.notes ?? null, why: [], equipment: [],
      };
    }),
  };
}

// --- piano settimanale nel calendario ---------------------------------------------------------------------------------
const toEv = (r) => ({ id: r.id, day: dayOf(r.starts_at), start: r.all_day ? null : new Date(r.starts_at).toTimeString().slice(0, 5), end: r.ends_at ? new Date(r.ends_at).toTimeString().slice(0, 5) : null,
  all_day: r.all_day, source: r.source, category: r.category, completed: r.completed, status: r.status, plan_key: r.plan_key, plan_data: r.plan_data, user_modified: r.user_modified });

export async function listWeekEvents(userId, today) {
  const from = toIso(weekStartOf(today), '00:00'); const to = toIso(addDaysStr(weekStartOf(today), 7), '00:00');
  const { data, error } = await sb.from('calendar_events')
    .select('id, starts_at, ends_at, all_day, source, category, completed, status, plan_key, plan_data, user_modified, title')
    .eq('owner_id', userId).gte('starts_at', from).lt('starts_at', to).order('starts_at', { ascending: true });
  if (error) fail(error);
  return data.map((r) => ({ ...toEv(r), title: r.title }));
}

/** Calcola il piano della settimana e lo confronta con quello già nel calendario. */
export async function computeWeekPlan(userId, { ctx, settings }) {
  const today = ctx.today;
  const events = (await listWeekEvents(userId, today)).filter((e) => e.status !== 'proposed');
  const week = weekStartOf(today);
  const plan = planWeek({
    today, availableDays: settings.available_days, sessionsPerWeek: settings.weekly_sessions, minutes: settings.session_minutes,
    events, history: ctx.history.map((h) => ({ day: h.day, key: h.key })),
    doneDays: events.filter((e) => e.source === 'plan' && e.completed).map((e) => e.day),
  });
  const existing = events.filter((e) => e.source === 'plan');
  const diff = reconcilePlan(existing, plan, today);
  return { plan, diff, events, week, weekEnd: addDaysStr(week, 6), dayNum };
}

/** Inserisce nel calendario gli eventi nuovi del piano (mai duplicati: la chiave è unica) e, se confermato, toglie quelli superati. */
export async function applyWeekPlan(userId, diff, { removeStale = false } = {}) {
  if (diff.toAdd.length) {
    const rows = diff.toAdd.map((e) => ({
      owner_id: userId, created_by: userId, title: e.title, category: e.category, starts_at: toIso(e.day, e.start), ends_at: toIso(e.day, addMinutes(e.start, e.plan_data.minutes)),
      status: 'confirmed', source: 'plan', plan_key: e.plan_key, plan_data: e.plan_data,
    }));
    const { error } = await sb.from('calendar_events').upsert(rows, { onConflict: 'owner_id,plan_key', ignoreDuplicates: true });
    if (error) fail(error);
  }
  if (removeStale && diff.toRemove.length) {
    const { error } = await sb.from('calendar_events').delete().in('id', diff.toRemove.map((e) => e.id)).eq('source', 'plan').eq('user_modified', false);
    if (error) fail(error);
  }
}

function addMinutes(hm, m) { const t = +hm.slice(0, 2) * 60 + +hm.slice(3, 5) + m; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }

/** Rifiuta una sessione del piano: resta nel calendario come "messa da parte" e non viene riproposta. */
export async function declinePlanEvent(id) {
  const { error } = await sb.from('calendar_events').update({ status: 'declined' }).eq('id', id).eq('source', 'plan');
  if (error) fail(error);
}
