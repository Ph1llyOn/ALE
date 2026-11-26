// Macchina a stati dell'allenamento guidato (PURA: nessun DOM, nessun timer reale). Il tempo si ricostruisce SEMPRE dai timestamp
// salvati, non da un setInterval: se la PWA viene sospesa o ricaricata, il conteggio resta esatto.
//
// Regole non negoziabili (e testate):
//  - nulla parte da solo: né il primo esercizio né quello successivo; si aspetta sempre che Alessia prema «Inizia esercizio»;
//  - una serie a ripetizioni si conferma con UN solo tocco ("Serie completata"), nessun contatore;
//  - una serie a tempo ha il timer, ma la fine del timer NON la segna come completata: serve la conferma;
//  - dopo ogni serie con altre serie da fare parte da solo il recupero (se previsto), mai la serie successiva;
//  - serie/esercizi saltati non diventano mai "completati".
//
// plan = { items: [{ exercise_key, name, mode: 'reps'|'time', sets, n?, seconds?, rest_seconds, per_side, phase }] }
// stage: prepare | ready | running | timeup | rest | rested | finished | stopped

export const STAGES = ['prepare', 'ready', 'running', 'timeup', 'rest', 'rested', 'finished', 'stopped'];

export function initialState(plan, now) {
  return {
    v: 1, index: 0, stage: 'prepare', setNo: 1, startedAt: now, paused: false, pausedAt: null, pausedTotal: 0,
    since: null, elapsedBefore: 0, target: 0, lastDone: null,
    progress: plan.items.map(() => ({ status: 'pending', setsDone: 0, setsSkipped: 0 })),
  };
}

const clone = (s) => ({ ...s, progress: s.progress.map((p) => ({ ...p })), lastDone: s.lastDone ? { ...s.lastDone } : null });
const item = (s, plan) => plan.items[s.index];
const startTimer = (s, ms, now) => { s.since = now; s.elapsedBefore = 0; s.target = ms; };
const clearTimer = (s) => { s.since = null; s.elapsedBefore = 0; s.target = 0; };

/** Millisecondi trascorsi nel timer corrente (si ferma durante la pausa). */
export const timerElapsed = (s, now) => (s.since === null ? s.elapsedBefore : s.elapsedBefore + (s.paused ? 0 : Math.max(0, now - s.since)));
/** Millisecondi rimanenti (mai negativi). */
export const remainingMs = (s, now) => Math.max(0, s.target - timerElapsed(s, now));
/** Tempo totale effettivo dell'allenamento, senza le pause. */
export function totalElapsedMs(s, now) {
  const pausedNow = s.paused && s.pausedAt !== null ? Math.max(0, now - s.pausedAt) : 0;
  return Math.max(0, now - s.startedAt - s.pausedTotal - pausedNow);
}

export const isActive = (s) => s.stage !== 'finished' && s.stage !== 'stopped';

/** Risolve i timer scaduti. Non avvia mai nulla: al massimo passa da "in corso" a "in attesa di conferma". */
export function tick(state, plan, now) {
  if (state.paused || !isActive(state) || state.since === null) return state;
  if (state.stage === 'running' && remainingMs(state, now) <= 0) { const s = clone(state); s.stage = 'timeup'; clearTimer(s); return s; }
  if (state.stage === 'rest' && remainingMs(state, now) <= 0) { const s = clone(state); s.stage = 'rested'; clearTimer(s); return s; }
  return state;
}

/** «Inizia esercizio»: l'unico modo di passare dalla preparazione all'esecuzione. */
export function startExercise(state, plan, now) {
  if (state.stage !== 'prepare' || state.paused) return state;
  const s = clone(state); const it = item(s, plan);
  s.progress[s.index].status = 'active'; s.setNo = 1; s.lastDone = null;
  if (it.mode === 'time') { s.stage = 'running'; startTimer(s, it.seconds * 1000, now); } else { s.stage = 'ready'; clearTimer(s); }
  return s;
}

/** «Inizia serie» (solo per gli esercizi a tempo, dopo il recupero o una serie saltata). */
export function startSet(state, plan, now) {
  const it = item(state, plan);
  if (state.paused || it.mode !== 'time' || !['ready', 'rested'].includes(state.stage)) return state;
  const s = clone(state); s.stage = 'running'; startTimer(s, it.seconds * 1000, now); return s;
}

function afterSet(s, plan, now, { restAllowed }) {
  const it = item(s, plan); const p = s.progress[s.index];
  if (s.setNo >= it.sets) return finishExercise(s, plan, now);
  s.setNo += 1;
  if (restAllowed && it.rest_seconds > 0) { s.stage = 'rest'; startTimer(s, it.rest_seconds * 1000, now); } else { s.stage = 'ready'; clearTimer(s); }
  void p;
  return s;
}

/** «Serie completata»: un solo tocco. Valida per serie a ripetizioni (da 'ready') e a tempo (da 'timeup', o 'running' se ha finito prima). */
export function completeSet(state, plan, now) {
  const it = item(state, plan);
  const ok = (it.mode === 'reps' && ['ready', 'rested'].includes(state.stage)) || (it.mode === 'time' && ['timeup', 'running'].includes(state.stage));
  if (state.paused || !ok) return state;
  const s = clone(state); s.progress[s.index].setsDone += 1;
  return afterSet(s, plan, now, { restAllowed: true });
}

/** «Salta la serie» (non la segna come fatta). */
export function skipSet(state, plan, now) {
  if (state.paused || !['ready', 'rested', 'running', 'timeup'].includes(state.stage)) return state;
  const s = clone(state); s.progress[s.index].setsSkipped += 1;
  return afterSet(s, plan, now, { restAllowed: false });
}

function finishExercise(s, plan, now) {
  const p = s.progress[s.index]; const it = item(s, plan);
  const remaining = Math.max(0, it.sets - p.setsDone - p.setsSkipped);
  p.setsSkipped += remaining;
  p.status = p.setsDone >= it.sets ? 'done' : p.setsDone > 0 ? 'partial' : 'skipped';
  s.lastDone = { index: s.index, status: p.status };
  clearTimer(s);
  if (s.index + 1 < plan.items.length) { s.index += 1; s.stage = 'prepare'; s.setNo = 1; } else { s.stage = 'finished'; }
  return s;
}

/** «Salta esercizio» (anche dalla schermata di preparazione). Le serie rimaste non vengono contate come fatte. */
export function skipExercise(state, plan, now) {
  if (state.paused || !isActive(state)) return state;
  const s = clone(state); return finishExercise(s, plan, now);
}

export function pause(state, now) {
  if (state.paused || !isActive(state)) return state;
  const s = clone(state);
  if (s.since !== null) s.elapsedBefore += Math.max(0, now - s.since);
  s.paused = true; s.pausedAt = now; s.since = null;
  return s;
}

export function resume(state, now) {
  if (!state.paused) return state;
  const s = clone(state);
  s.pausedTotal += Math.max(0, now - (s.pausedAt ?? now));
  s.paused = false; s.pausedAt = null;
  if (s.target > 0 && ['running', 'rest'].includes(s.stage)) s.since = now; // il timer riprende da dove si era fermato
  return s;
}

/** Salta il recupero (l'utente è pronta prima). Non avvia la serie: resta in attesa. */
export function skipRest(state) {
  if (state.stage !== 'rest') return state;
  const s = clone(state); s.stage = 'rested'; clearTimer(s); return s;
}

/** «Interrompi allenamento»: ciò che è stato fatto resta, il resto non è completato. */
export function stopSession(state, now) {
  if (!isActive(state)) return state;
  let s = state.paused ? resume(state, now) : state;
  s = clone(s);
  const p = s.progress[s.index];
  if (p.status === 'active') p.status = p.setsDone > 0 ? 'partial' : 'stopped';
  s.stage = 'stopped'; clearTimer(s);
  return s;
}

export function summarize(state, plan) {
  const count = (st) => state.progress.filter((p) => p.status === st).length;
  return {
    done: count('done'), partial: count('partial'), skipped: count('skipped'), stopped: count('stopped'), pending: count('pending'),
    total: plan.items.length, setsDone: state.progress.reduce((t, p) => t + p.setsDone, 0), setsSkipped: state.progress.reduce((t, p) => t + p.setsSkipped, 0),
  };
}

/** Controllo di coerenza di uno stato letto dal database (può essere vecchio o corrotto): se non torna, si riparte dalla preparazione sicura. */
export function sanitize(state, plan, now) {
  if (!state || state.v !== 1 || !STAGES.includes(state.stage) || !Array.isArray(state.progress) || state.progress.length !== plan.items.length
    || !Number.isInteger(state.index) || state.index < 0 || state.index > plan.items.length) return initialState(plan, now);
  return state;
}
