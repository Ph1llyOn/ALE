import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../../js/features/activities/session-core.js';

const T0 = 1_800_000_000_000;
const s = (n) => n * 1000;
const plan = {
  items: [
    { exercise_key: 'squat', name: 'Squat', mode: 'reps', sets: 3, n: 12, rest_seconds: 60, phase: 'main' },
    { exercise_key: 'plank', name: 'Plank', mode: 'time', sets: 2, seconds: 20, rest_seconds: 30, phase: 'main' },
    { exercise_key: 'march', name: 'Marcia', mode: 'time', sets: 1, seconds: 60, rest_seconds: 0, phase: 'cooldown' },
  ],
};

test('inizio: si aspetta sempre «Inizia esercizio», nessun timer parte da solo', () => {
  let st = core.initialState(plan, T0);
  assert.equal(st.stage, 'prepare');
  assert.equal(st.since, null);
  // anche dopo ore di attesa non succede nulla
  for (const dt of [s(5), s(3600), s(86400)]) assert.equal(core.tick(st, plan, T0 + dt), st);
  assert.equal(core.remainingMs(st, T0 + s(3600)), 0);
  // senza la pressione di «Inizia» non si può completare nulla
  assert.equal(core.completeSet(st, plan, T0), st);
  assert.equal(core.startSet(st, plan, T0), st);
  st = core.startExercise(st, plan, T0 + s(40));
  assert.equal(st.stage, 'ready');
  assert.equal(st.progress[0].status, 'active');
});

test('serie a ripetizioni: UN solo tocco per serie, nessun contatore di ripetizioni', () => {
  assert.ok(!Object.keys(core).some((k) => /rep(s|etition)?(count|counter)|incrementRep|addRep|countRep/i.test(k)), 'non esiste un contatore di ripetizioni');
  let st = core.startExercise(core.initialState(plan, T0), plan, T0);
  assert.equal(st.stage, 'ready');
  assert.equal(st.since, null, 'nessun timer per le ripetizioni');
  st = core.completeSet(st, plan, T0 + s(30));            // una sola chiamata = una serie
  assert.equal(st.progress[0].setsDone, 1);
  assert.equal(st.setNo, 2);
});

test('recupero: parte da solo dopo una serie, ma NON parte la serie successiva', () => {
  let st = core.startExercise(core.initialState(plan, T0), plan, T0);
  st = core.completeSet(st, plan, T0 + s(30));
  assert.equal(st.stage, 'rest');
  assert.equal(core.remainingMs(st, T0 + s(30)), s(60));
  assert.equal(core.remainingMs(st, T0 + s(50)), s(40));
  st = core.tick(st, plan, T0 + s(95));                    // recupero scaduto
  assert.equal(st.stage, 'rested', 'finito il recupero si aspetta: la serie non parte da sola');
  assert.equal(st.progress[0].setsDone, 1);
  st = core.completeSet(st, plan, T0 + s(110));
  assert.equal(st.progress[0].setsDone, 2);
  assert.equal(st.stage, 'rest');
});

test('recupero: si può saltare, ma poi si resta in attesa', () => {
  let st = core.startExercise(core.initialState(plan, T0), plan, T0);
  st = core.skipRest(core.completeSet(st, plan, T0 + s(30)));
  assert.equal(st.stage, 'rested');
  assert.equal(st.since, null);
});

test('FONDAMENTALE: finito un esercizio NON parte il successivo; resta in preparazione senza limiti di tempo', () => {
  let st = core.startExercise(core.initialState(plan, T0), plan, T0);
  for (let i = 0; i < 3; i++) { st = core.completeSet(st, plan, T0 + s(30 * (i + 1))); if (st.stage === 'rest') st = core.skipRest(st); }
  assert.equal(st.progress[0].status, 'done');
  assert.equal(st.stage, 'prepare', 'schermata «Prossimo esercizio»');
  assert.equal(st.index, 1);
  assert.deepEqual(st.lastDone, { index: 0, status: 'done' });
  assert.equal(st.since, null, 'nessun timer in corso');
  assert.equal(st.progress[1].status, 'pending');
  for (const dt of [s(1), s(600), s(7200), s(86400 * 3)]) {
    const t = core.tick(st, plan, T0 + s(100) + dt);
    assert.equal(t.stage, 'prepare');
    assert.equal(t.progress[1].status, 'pending', 'attende all\'infinito');
  }
  st = core.startExercise(st, plan, T0 + s(5000));
  assert.equal(st.stage, 'running', 'solo ora parte il timer dell\'esercizio a tempo');
  assert.equal(core.remainingMs(st, T0 + s(5000)), s(20));
});

test('esercizio a tempo: il timer scade ma NON conferma la serie; serve la conferma', () => {
  let st = core.startExercise({ ...core.initialState(plan, T0), index: 1 }, plan, T0);
  assert.equal(st.stage, 'running');
  st = core.tick(st, plan, T0 + s(19));
  assert.equal(st.stage, 'running');
  st = core.tick(st, plan, T0 + s(21));
  assert.equal(st.stage, 'timeup');
  assert.equal(st.progress[1].setsDone, 0, 'la fine del timer non è un completamento');
  const confirmed = core.completeSet(st, plan, T0 + s(25));
  assert.equal(confirmed.progress[1].setsDone, 1);
  assert.equal(confirmed.stage, 'rest');
  const skipped = core.skipSet(st, plan, T0 + s(25));
  assert.equal(skipped.progress[1].setsDone, 0);
  assert.equal(skipped.progress[1].setsSkipped, 1);
  assert.equal(skipped.stage, 'ready', 'dopo una serie saltata si aspetta, senza recupero');
});

test('serie a tempo successive: dopo il recupero serve «Inizia serie»', () => {
  let st = core.startExercise({ ...core.initialState(plan, T0), index: 1 }, plan, T0);
  st = core.completeSet(core.tick(st, plan, T0 + s(21)), plan, T0 + s(22));
  st = core.tick(st, plan, T0 + s(60));
  assert.equal(st.stage, 'rested');
  assert.equal(core.tick(st, plan, T0 + s(9999)).stage, 'rested');
  st = core.startSet(st, plan, T0 + s(100));
  assert.equal(st.stage, 'running');
  assert.equal(st.setNo, 2);
});

test('pausa e ripresa: il tempo si ferma e riprende da dove era', () => {
  let st = core.startExercise({ ...core.initialState(plan, T0), index: 1 }, plan, T0);
  st = core.pause(st, T0 + s(8));
  assert.equal(core.remainingMs(st, T0 + s(8)), s(12));
  assert.equal(core.remainingMs(st, T0 + s(500)), s(12), 'in pausa non scorre');
  assert.equal(core.tick(st, plan, T0 + s(500)).stage, 'running', 'in pausa non scade');
  st = core.resume(st, T0 + s(500));
  assert.equal(core.remainingMs(st, T0 + s(505)), s(7));
  assert.equal(core.tick(st, plan, T0 + s(513)).stage, 'timeup');
  assert.equal(core.totalElapsedMs(st, T0 + s(505)), s(13), 'il tempo totale non conta la pausa (505 − 492)');
  // da in pausa non si può confermare nulla
  const p = core.pause(core.startExercise(core.initialState(plan, T0), plan, T0), T0 + s(1));
  assert.equal(core.completeSet(p, plan, T0 + s(2)), p);
});

test('ricarica / app sospesa: stato salvato e ricostruito dai timestamp, senza avviare nulla', () => {
  const reload = (st) => JSON.parse(JSON.stringify(st));
  // 1) preparazione: resta preparazione
  let st = core.initialState(plan, T0);
  assert.equal(core.tick(reload(st), plan, T0 + s(3600)).stage, 'prepare');
  // 2) timer in corso, app chiusa per 5 minuti → scaduto, in attesa di conferma (non completato)
  st = core.startExercise({ ...core.initialState(plan, T0), index: 1 }, plan, T0);
  const back = core.tick(reload(st), plan, T0 + s(300));
  assert.equal(back.stage, 'timeup');
  assert.equal(back.progress[1].setsDone, 0);
  // 3) timer ancora valido dopo 5 secondi: continua con il tempo giusto
  const mid = core.tick(reload(st), plan, T0 + s(5));
  assert.equal(core.remainingMs(mid, T0 + s(5)), s(15));
  // 4) recupero scaduto mentre l'app era chiusa → in attesa
  let r = core.startExercise(core.initialState(plan, T0), plan, T0);
  r = core.completeSet(r, plan, T0 + s(10));
  assert.equal(core.tick(reload(r), plan, T0 + s(10 + 3600)).stage, 'rested');
  // 5) in pausa durante la sospensione: resta in pausa e il tempo non avanza
  const paused = core.pause(st, T0 + s(4));
  const afterPause = core.tick(reload(paused), plan, T0 + s(4000));
  assert.equal(afterPause.paused, true);
  assert.equal(core.remainingMs(afterPause, T0 + s(4000)), s(16));
});

test('saltare: serie ed esercizi saltati non risultano mai completati', () => {
  let st = core.startExercise(core.initialState(plan, T0), plan, T0);
  st = core.skipSet(st, plan, T0 + s(5));
  assert.equal(st.progress[0].setsSkipped, 1);
  st = core.completeSet(st, plan, T0 + s(30));
  st = core.skipExercise(core.skipRest(st), plan, T0 + s(40));
  assert.equal(st.progress[0].status, 'partial', 'una serie fatta e le altre saltate: in parte');
  assert.equal(st.progress[0].setsDone, 1);
  assert.equal(st.progress[0].setsSkipped, 2);
  assert.equal(st.stage, 'prepare');
  st = core.skipExercise(st, plan, T0 + s(50));          // salta l'esercizio dalla schermata di preparazione
  assert.equal(st.progress[1].status, 'skipped');
  assert.equal(st.progress[1].setsDone, 0);
  const sum = core.summarize(st, plan);
  assert.equal(sum.done, 0);
  assert.equal(sum.skipped, 1);
  assert.equal(sum.partial, 1);
});

test('fine della sessione e interruzione', () => {
  let st = core.initialState(plan, T0);
  for (let i = 0; i < 3; i++) st = core.skipExercise(st, plan, T0 + s(i));
  assert.equal(st.stage, 'finished');
  assert.equal(core.summarize(st, plan).done, 0, 'tutto saltato: nulla di completato');
  assert.equal(core.startExercise(st, plan, T0), st);
  let p = core.startExercise(core.initialState(plan, T0), plan, T0);
  p = core.completeSet(p, plan, T0 + s(20));
  const stopped = core.stopSession(p, T0 + s(30));
  assert.equal(stopped.stage, 'stopped');
  assert.equal(stopped.progress[0].status, 'partial');
  assert.equal(stopped.progress[0].setsDone, 1);
  assert.equal(stopped.progress[1].status, 'pending', 'ciò che non è iniziato resta non iniziato');
  assert.equal(core.completeSet(stopped, plan, T0 + s(40)), stopped);
});

test('stati corrotti o vecchi: si riparte dalla preparazione sicura', () => {
  assert.equal(core.sanitize(null, plan, T0).stage, 'prepare');
  assert.equal(core.sanitize({ v: 2 }, plan, T0).stage, 'prepare');
  assert.equal(core.sanitize({ ...core.initialState(plan, T0), stage: 'boh' }, plan, T0).stage, 'prepare');
  assert.equal(core.sanitize({ ...core.initialState(plan, T0), progress: [] }, plan, T0).progress.length, 3);
  const ok = core.initialState(plan, T0);
  assert.equal(core.sanitize(ok, plan, T0), ok);
});
