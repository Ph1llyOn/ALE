import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSession, validateSession, eligibleExercises, adaptation, planWeek, reconcilePlan, sessionsCap, exercise, planSeconds,
  weekdayOf, weekStartOf, isoWeekKey, addDaysStr, chainRoot,
} from '../../js/data/planner-core.js';
import { EXERCISES, equipmentKeysFrom } from '../../js/data/exercises-core.js';

const named = (...n) => n.map((name) => ({ name }));
const BIG = named('Tappetino fitness', 'Manubri', 'Kettlebell', 'Elastici fitness', 'Pedana fitness (step)', 'Palla da ginnastica', 'Tapis roulant', 'Cyclette', 'Cavigliere con pesi');
const base = (over = {}) => ({ items: BIG, level: 'intermediate', minutes: 40, today: '2026-12-02', seed: 1, ...over });
const SEEDS = Array.from({ length: 40 }, (_, i) => i);
const keys = (plan) => plan.items.map((i) => i.exercise_key);
const hasNonMat = (e) => e.equipment.some((k) => k !== 'mat');

test('MAI un esercizio con attrezzi che Alessia non ha (tutte le sessioni, tutti i tipi, molti semi)', () => {
  for (const inv of [[], named('Manubri'), named('Tappetino fitness', 'Elastici fitness'), named('Tapis roulant'), BIG]) {
    const have = equipmentKeysFrom(inv);
    for (const kind of ['strength', 'cardio', 'mobility']) for (const seed of SEEDS) {
      const plan = generateSession(base({ items: inv, seed }), { kind });
      for (const it of plan.items) assert.ok(exercise(it.exercise_key).equipment.every((k) => have.has(k)), `${it.exercise_key} richiede attrezzi che mancano (${kind}/${seed})`);
    }
  }
});

test('«Preferisco allenarmi senza attrezzi»: nessun attrezzo (il tappetino non conta) anche se in inventario', () => {
  for (const seed of SEEDS) for (const kind of ['strength', 'cardio', 'mobility']) {
    const plan = generateSession(base({ prefersNoEquipment: true, seed, minutes: 45 }), { kind });
    for (const it of plan.items) assert.ok(!hasNonMat(exercise(it.exercise_key)), `${it.exercise_key} usa un attrezzo (${seed})`);
  }
});

test('l\'inventario viene davvero sfruttato (senza obbligo): con manubri, kettlebell, elastici ecc. spesso compaiono gli attrezzi', () => {
  let withGear = 0; const used = new Set();
  for (const seed of SEEDS) {
    const plan = generateSession(base({ seed, minutes: 45 }), { kind: 'strength' });
    const gear = plan.items.filter((i) => hasNonMat(exercise(i.exercise_key)));
    if (gear.length) withGear++;
    for (const g of gear) for (const k of exercise(g.exercise_key).equipment) used.add(k);
  }
  assert.ok(withGear >= SEEDS.length * 0.7, `attrezzi usati solo in ${withGear}/${SEEDS.length} sessioni`);
  assert.ok(used.size >= 4, `si usa una sola famiglia di attrezzi: ${[...used]}`);
  // ma non tutti gli attrezzi in ogni sessione
  const plan = generateSession(base({ seed: 3 }), { kind: 'strength' });
  const families = new Set(plan.items.flatMap((i) => exercise(i.exercise_key).equipment).filter((k) => k !== 'mat'));
  assert.ok(families.size < 6);
});

test('struttura: riscaldamento → parte principale → (cardio) → defaticamento, e passa la verifica di qualità', () => {
  const order = { warmup: 0, main: 1, cardio: 2, cooldown: 3 };
  for (const seed of SEEDS) {
    const plan = generateSession(base({ seed }), { kind: 'strength' });
    assert.equal(plan.items[0].phase, 'warmup');
    assert.equal(plan.items.at(-1).phase, 'cooldown');
    for (let i = 1; i < plan.items.length; i++) assert.ok(order[plan.items[i].phase] >= order[plan.items[i - 1].phase], 'ordine delle fasi');
    assert.equal(validateSession(plan, base({ seed })).ok, true, JSON.stringify(validateSession(plan, base({ seed })).problems));
    assert.ok(plan.summary.main >= 3);
  }
});

test('ogni esercizio ha un perché, non è casuale', () => {
  const plan = generateSession(base(), { kind: 'strength' });
  for (const it of plan.items) assert.ok(it.why.length && it.why[0].length > 5, `manca il motivo per ${it.exercise_key}`);
});

test('non solo addominali e tapis roulant: programma equilibrato', () => {
  for (const seed of SEEDS) for (const kind of ['strength', 'cardio']) {
    const plan = generateSession(base({ seed, items: named('Tappetino fitness', 'Tapis roulant') }), { kind });
    const patterns = new Set(plan.items.filter((i) => i.phase === 'main').map((i) => exercise(i.exercise_key).pattern));
    assert.ok(patterns.size >= 2, `poca varietà (${seed}): ${[...patterns]}`);
    assert.ok(plan.items.filter((i) => i.phase === 'main' && exercise(i.exercise_key).pattern === 'core').length <= 2, 'troppi addominali');
  }
});

test('tapis roulant: ha una funzione (riscaldamento o parte cardio), non è in ogni sessione e non parte a velocità alta', () => {
  let withTreadmill = 0;
  for (const seed of SEEDS) {
    const plan = generateSession(base({ seed, items: named('Tappetino fitness', 'Tapis roulant'), prefs: { treadmill_speed: 3.5 } }), { kind: 'strength' });
    const t = plan.items.find((i) => i.exercise_key === 'treadmill-walk');
    if (!t) continue;
    withTreadmill++;
    assert.ok(['warmup', 'cardio'].includes(t.phase));
    assert.ok(t.treadmill.speed <= 3.8, `velocità troppo alta: ${t.treadmill.speed}`);
    assert.equal(t.treadmill.incline, 0);
  }
  assert.ok(withTreadmill > 0 && withTreadmill < SEEDS.length, `tapis roulant in ${withTreadmill}/${SEEDS.length}`);
  const cardio = generateSession(base({ items: named('Tappetino fitness', 'Tapis roulant'), level: 'beginner' }), { kind: 'cardio' });
  assert.ok(cardio.items.some((i) => i.phase === 'cardio' && i.exercise_key === 'treadmill-walk'));
  assert.ok(cardio.items.find((i) => i.phase === 'cardio').seconds <= 900, 'principiante: cardio contenuto');
});

test('preferenze: senza tapis roulant nelle preferenze non compare mai; addominali opzionali', () => {
  for (const seed of SEEDS) {
    const plan = generateSession(base({ seed, prefs: { treadmill: false, abs: false } }), { kind: 'strength' });
    assert.ok(!keys(plan).includes('treadmill-walk'));
    assert.ok(plan.items.filter((i) => i.phase === 'main' && exercise(i.exercise_key).pattern === 'core').length <= 1);
  }
  let absCount = 0;
  for (const seed of SEEDS) { const plan = generateSession(base({ seed }), { kind: 'strength' }); if (plan.items.some((i) => ['dead-bug', 'reverse-crunch', 'toe-taps', 'leg-raise-crunch', 'crunch'].includes(i.exercise_key))) absCount++; }
  assert.ok(absCount >= SEEDS.length * 0.5, 'gli addominali piacciono: compaiono spesso');
  assert.ok(absCount < SEEDS.length + 1);
});

test('addominali con gambe sollevate: per principianti solo la base (dead bug); le altre dopo i requisiti', () => {
  const abs = ['reverse-crunch', 'leg-raise-crunch', 'toe-taps'];
  for (const seed of SEEDS) assert.ok(!keys(generateSession(base({ level: 'beginner', seed }), { kind: 'strength' })).some((k) => abs.includes(k)), 'esercizio difficile a una principiante');
  const hist = [{ day: '2026-11-20', key: 'dead-bug', setsDone: 2 }, { day: '2026-11-25', key: 'dead-bug', setsDone: 2 }];
  assert.ok(eligibleExercises(base({ level: 'beginner', history: hist })).some((e) => e.id === 'reverse-crunch'), 'sbloccato dopo due volte');
  assert.ok(eligibleExercises(base({ level: 'intermediate' })).some((e) => e.id === 'toe-taps'));
  assert.ok(!eligibleExercises(base({ level: 'intermediate' })).some((e) => e.id === 'leg-raise-crunch'), 'livello avanzato: richiede reverse crunch');
});

test('limitazioni indicate dal professionista: mai esercizi con quell\'attenzione', () => {
  for (const flag of ['lumbar', 'knees', 'wrists', 'shoulders', 'impact', 'neck']) for (const seed of SEEDS.slice(0, 15)) for (const kind of ['strength', 'cardio', 'mobility']) {
    const plan = generateSession(base({ avoidFlags: [flag], seed, minutes: 45 }), { kind });
    for (const it of plan.items) assert.ok(!exercise(it.exercise_key).flags.includes(flag), `${it.exercise_key} ha l'attenzione "${flag}"`);
  }
});

test('durata: il tempo disponibile viene rispettato', () => {
  for (const minutes of [15, 20, 30, 45, 60]) for (const seed of SEEDS.slice(0, 12)) {
    const plan = generateSession(base({ minutes, seed }), { kind: 'strength' });
    const est = planSeconds(plan.items) / 60;
    assert.ok(est <= minutes * 1.25, `${minutes} min: stimati ${est.toFixed(1)}`);
    assert.ok(est >= minutes * 0.5, `${minutes} min: stimati solo ${est.toFixed(1)}`);
  }
});

test('varietà: giorno dopo giorno non si ripropongono gli stessi esercizi', () => {
  let history = []; let prev = new Set(); const counts = {}; let day = '2026-12-01';
  for (let d = 0; d < 8; d++) {
    const plan = generateSession(base({ history, today: day, seed: 100 + d, level: 'intermediate' }), { kind: 'strength' });
    const mains = plan.items.filter((i) => i.phase === 'main').map((i) => chainRoot(i.exercise_key));
    const exact = plan.items.filter((i) => i.phase === 'main').map((i) => i.exercise_key);
    const overlap = mains.filter((k) => prev.has(k)).length / mains.length;
    if (d > 0) assert.ok(overlap <= 0.5, `giorno ${d}: ${Math.round(overlap * 100)}% uguale al precedente`);
    for (const m of exact) counts[m] = (counts[m] ?? 0) + 1;
    prev = new Set(mains);
    history = history.concat(plan.items.filter((i) => i.phase === 'main').map((i) => ({ day, key: i.exercise_key, setsDone: i.sets })));
    day = addDaysStr(day, 1);
  }
  assert.ok(Math.max(...Object.values(counts)) <= 5, `un esercizio ripetuto troppo: ${JSON.stringify(counts)}`);
  assert.ok(Object.keys(counts).length >= 10, 'poca varietà complessiva');
});

test('zone che hanno riposato più a lungo hanno la precedenza (recupero e bilanciamento)', () => {
  // ieri solo gambe e glutei: oggi la sessione non deve essere ancora tutta su gambe
  const history = ['squat', 'glute-bridge', 'lunge', 'calf-raise', 'wall-sit'].map((key) => ({ day: '2026-12-01', key, setsDone: 3 }));
  for (const seed of SEEDS.slice(0, 15)) {
    const plan = generateSession(base({ history, seed }), { kind: 'strength' });
    const lower = plan.items.filter((i) => i.phase === 'main' && ['squat', 'lunge', 'calf', 'hinge'].includes(exercise(i.exercise_key).pattern)).length;
    assert.ok(lower <= 3, `troppo lavoro sulle gambe dopo ieri (${lower})`);
  }
});

test('livello: una principiante non riceve esercizi avanzati', () => {
  for (const seed of SEEDS) {
    const plan = generateSession(base({ level: 'beginner', seed }), { kind: 'strength' });
    for (const it of plan.items) assert.ok(exercise(it.exercise_key).level <= 1, `${it.exercise_key} è di livello ${exercise(it.exercise_key).level}`);
  }
  const adv = new Set(); for (const seed of SEEDS) for (const k of keys(generateSession(base({ level: 'advanced', seed, minutes: 50 }), { kind: 'strength' }))) adv.add(exercise(k).level);
  assert.ok(adv.has(3) || adv.has(2));
});

// ------------------------------------------------------------------------------------------------ feedback
const fb = (key, rating, day) => ({ key, rating, day });

test('feedback: una sola indicazione "facile" NON fa salire di livello; due di fila sì, gradualmente', () => {
  const ctx = base({ today: '2026-12-10' });
  assert.equal(adaptation('squat', { ...ctx, feedback: [fb('squat', 'too_easy', '2026-12-08')] }).action, 'keep');
  assert.equal(adaptation('squat', { ...ctx, feedback: [fb('squat', 'too_easy', '2026-12-08'), fb('squat', 'right', '2026-12-05')] }).action, 'keep');
  assert.equal(adaptation('squat', { ...ctx, feedback: [fb('squat', 'too_easy', '2026-12-08'), fb('squat', 'too_easy', '2026-12-05')] }).action, 'harder');
  assert.equal(adaptation('squat', { ...ctx, feedback: [fb('squat', 'too_easy', '2026-12-08'), fb('squat', 'too_easy', '2026-10-01')] }).action, 'keep', 'feedback troppo vecchio');
  assert.equal(adaptation('squat', { ...ctx, feedback: [fb('squat', 'right', '2026-12-08')] }).action, 'keep');
});

test('feedback "troppo facile" ripetuto → variante più impegnativa quando disponibile e consentita', () => {
  const feedback = [fb('wall-push-up', 'too_easy', '2026-12-08'), fb('wall-push-up', 'too_easy', '2026-12-05')];
  let step = 0;
  for (const seed of SEEDS) {
    const withStep = generateSession(base({ level: 'beginner', items: named('Tappetino fitness', 'Pedana fitness (step)'), feedback, seed, today: '2026-12-10' }), { kind: 'strength' });
    if (keys(withStep).includes('incline-push-up')) step++;
    assert.ok(!keys(withStep).includes('wall-push-up') || !keys(withStep).includes('incline-push-up'));
  }
  assert.ok(step > 0, 'la variante inclinata viene proposta quando sono stati due "facile" e c\'è lo step');
  // senza step non si inventa la variante: si aumenta solo un poco il volume
  const noStep = generateSession(base({ level: 'beginner', items: named('Tappetino fitness'), feedback, today: '2026-12-10', seed: 5 }), { kind: 'strength' });
  const it = noStep.items.find((i) => i.exercise_key === 'wall-push-up');
  if (it) assert.ok(it.n <= 12 && it.n >= 10);
});

test('feedback "troppo difficile": variante più semplice o meno volume', () => {
  const hard2 = [fb('squat', 'hard', '2026-12-08'), fb('squat', 'too_hard', '2026-12-05')];
  assert.equal(adaptation('squat', base({ feedback: hard2, today: '2026-12-10' })).action, 'easier');
  assert.equal(adaptation('squat', base({ feedback: [fb('squat', 'too_hard', '2026-12-09')], today: '2026-12-10' })).action, 'reduce');
  assert.equal(adaptation('squat', base({ feedback: [fb('squat', 'not_completed', '2026-12-09')], today: '2026-12-10' })).action, 'reduce');
  assert.equal(adaptation('squat', base({ feedback: [fb('squat', 'hard', '2026-12-09')], today: '2026-12-10' })).action, 'keep', 'una sola "abbastanza difficile" va bene così');
  let chair = 0;
  for (const seed of SEEDS) { const plan = generateSession(base({ level: 'beginner', feedback: hard2, today: '2026-12-10', seed }), { kind: 'strength' }); if (keys(plan).includes('chair-squat')) chair++; assert.ok(!keys(plan).includes('squat')); }
  assert.ok(chair > 0);
  // volume ridotto dopo un "troppo difficile"
  const plan = generateSession(base({ level: 'beginner', feedback: [fb('wall-push-up', 'too_hard', '2026-12-09')], today: '2026-12-10', seed: 2 }), { kind: 'strength' });
  const it = plan.items.find((i) => i.exercise_key === 'wall-push-up');
  if (it) assert.ok(it.sets < exercise('wall-push-up').sets || it.n < exercise('wall-push-up').n);
});

test('DOLORE o fastidio: l\'esercizio non viene riproposto (né aumentato) per un po\'', () => {
  const pain = [fb('squat', 'pain', '2026-12-08')];
  const ctx = base({ feedback: pain, today: '2026-12-10', level: 'beginner' });
  assert.equal(adaptation('squat', ctx).action, 'block');
  assert.ok(adaptation('squat', ctx).reason.includes('fastidio'));
  assert.ok(!eligibleExercises(ctx).some((e) => e.id === 'squat'));
  for (const seed of SEEDS) assert.ok(!keys(generateSession({ ...ctx, seed }, { kind: 'strength' })).includes('squat'));
  // dopo 14 giorni torna possibile
  assert.equal(adaptation('squat', { ...ctx, today: '2026-12-30' }).action, 'keep');
  // un esercizio bloccato fa fallire la verifica
  assert.ok(validateSession({ kind: 'strength', minutes: 30, items: [{ exercise_key: 'squat', phase: 'main', sets: 2 }] }, ctx).problems.includes('recent_pain'));
});

test('requisiti: una variante avanzata non viene proposta senza aver fatto bene la precedente', () => {
  const ctx = base({ level: 'beginner', items: named('Tappetino fitness'), today: '2026-12-10' });
  assert.ok(!eligibleExercises(ctx).some((e) => e.id === 'push-up-knees'));
  const ok = { ...ctx, history: [{ day: '2026-12-01', key: 'wall-push-up', setsDone: 2 }, { day: '2026-12-05', key: 'wall-push-up', setsDone: 2 }] };
  assert.ok(eligibleExercises(ok).some((e) => e.id === 'push-up-knees'));
  const hard = { ...ok, feedback: [fb('wall-push-up', 'too_hard', '2026-12-08')] };
  assert.ok(!eligibleExercises(hard).some((e) => e.id === 'push-up-knees'), 'se la precedente è stata troppo difficile non si sale');
});

// ------------------------------------------------------------------------------------------------ verifica
test('validateSession ferma le sequenze sbagliate (anche se arrivano dall\'AI)', () => {
  const ctx = base({ items: named('Tappetino fitness'), level: 'beginner', avoidFlags: ['lumbar'] });
  const mk = (items, extra = {}) => ({ kind: 'strength', minutes: 30, items: items.map(([k, phase]) => ({ exercise_key: k, phase, sets: 2, rest_seconds: 45 })), ...extra });
  const v = (plan) => validateSession(plan, ctx).problems;
  assert.ok(v(mk([['inventato', 'main']])).includes('unknown_exercise'));
  assert.ok(v(mk([['march', 'warmup'], ['dumbbell-curl', 'main'], ['plank-knees', 'main'], ['squat', 'main'], ['deep-breathing', 'cooldown']])).includes('equipment_missing'));
  assert.ok(v(mk([['march', 'warmup'], ['superman', 'main'], ['squat', 'main'], ['wall-push-up', 'main'], ['deep-breathing', 'cooldown']])).includes('avoid_flag'));
  assert.ok(v(mk([['squat', 'main'], ['march', 'warmup']])).includes('bad_order'));
  assert.ok(v(mk([['squat', 'main'], ['wall-push-up', 'main'], ['glute-bridge', 'main'], ['deep-breathing', 'cooldown']])).includes('no_warmup'));
  assert.ok(v(mk([['march', 'warmup'], ['dead-bug', 'main'], ['crunch', 'main'], ['plank-knees', 'main'], ['deep-breathing', 'cooldown']])).includes('too_much_core'));
  assert.ok(v(mk([['march', 'warmup'], ['squat', 'main'], ['chair-squat', 'main'], ['wall-push-up', 'main'], ['deep-breathing', 'cooldown']])).includes('duplicate_chain'));
  assert.ok(v(mk([['march', 'warmup'], ['squat', 'main'], ['wall-push-up', 'main'], ['glute-bridge', 'main']])).includes('no_cooldown'));
  assert.ok(v({ kind: 'strength', minutes: 30, items: [] }).includes('empty'));
  assert.ok(validateSession(mk([['march', 'warmup'], ['squat', 'main'], ['plank', 'main'], ['wall-push-up', 'main'], ['deep-breathing', 'cooldown']]), ctx).problems.includes('level_too_high'));
});

// ------------------------------------------------------------------------------------------------ piano settimanale
const dayEv = (day, start, end, extra = {}) => ({ day, start, end, source: 'manual', category: 'personal', status: 'confirmed', ...extra });

test('date: settimana ISO e giorni della settimana', () => {
  assert.equal(weekdayOf('2026-12-01'), 2);
  assert.equal(weekdayOf('2026-12-06'), 7);
  assert.equal(weekStartOf('2026-12-06'), '2026-11-30');
  assert.equal(isoWeekKey('2026-12-02'), '2026-W49');
  assert.equal(isoWeekKey('2027-01-01'), '2026-W53');
  assert.equal(isoWeekKey('2026-12-28'), '2026-W53');
});

test('settimana: niente duplicati, niente sovrapposizioni con impegni personali, riposo previsto', () => {
  const events = [dayEv('2026-12-02', '17:00', '19:30'), dayEv('2026-12-03', '08:00', '23:00'), dayEv('2026-12-04', '00:00', '23:59', { all_day: true })];
  const plan = planWeek({ today: '2026-12-01', sessionsPerWeek: 4, minutes: 30, events, history: [{ day: '2026-11-20' }, { day: '2026-11-25' }, { day: '2026-11-27' }, { day: '2026-11-30' }, { day: '2026-11-18' }, { day: '2026-11-13' }, { day: '2026-11-11' }] });
  const keysSeen = plan.events.map((e) => e.plan_key);
  assert.equal(new Set(keysSeen).size, keysSeen.length, 'chiavi duplicate');
  for (const e of plan.events) {
    assert.match(e.plan_key, /^2026-W49:[1-7]:plan$/);
    for (const ev of events.filter((x) => x.day === e.day && !x.all_day)) {
      const s = +e.start.slice(0, 2) * 60 + +e.start.slice(3); const en = s + 30;
      const es = +ev.start.slice(0, 2) * 60 + +ev.start.slice(3); const ee = +ev.end.slice(0, 2) * 60 + +ev.end.slice(3);
      assert.ok(en <= es || s >= ee, `la sessione del ${e.day} ${e.start} si sovrappone a un impegno`);
    }
    assert.ok(e.day >= '2026-12-01');
  }
  assert.ok(plan.restDays >= 2, 'servono almeno due giorni di riposo');
  assert.ok(plan.events.length <= 5);
});

test('settimana: rispetta i giorni disponibili, non pianifica nel passato, mai forza in due giorni di fila', () => {
  for (const today of ['2026-12-01', '2026-12-03', '2026-12-05', '2026-12-07']) {
    const plan = planWeek({ today, availableDays: [2, 4, 6], sessionsPerWeek: 3, minutes: 30, history: [{ day: '2026-11-17' }, { day: '2026-11-19' }, { day: '2026-11-24' }, { day: '2026-11-26' }, { day: '2026-12-01' }] });
    for (const e of plan.events) { assert.ok([2, 4, 6].includes(weekdayOf(e.day))); assert.ok(e.day >= today); }
  }
  const plan = planWeek({ today: '2026-11-30', sessionsPerWeek: 6, minutes: 30, history: Array.from({ length: 30 }, (_, i) => ({ day: addDaysStr('2026-11-01', i) })) });
  const strength = plan.events.filter((e) => e.plan_data.kind === 'strength').map((e) => e.day);
  for (const d of strength) assert.ok(!strength.includes(addDaysStr(d, 1)), 'forza in due giorni consecutivi');
  const all = plan.events.map((e) => e.day); assert.equal(new Set(all).size, all.length, 'una sola attività al giorno');
  assert.ok(plan.events.length <= 5);
});

test('settimana: dopo una forza ieri, oggi niente forza', () => {
  const plan = planWeek({ today: '2026-12-02', sessionsPerWeek: 3, minutes: 30, availableDays: [3], history: [{ day: '2026-12-01', key: 'squat' }] });
  assert.ok(plan.events.every((e) => e.plan_data.kind !== 'strength'));
});

test('aumenti graduali: chi non si allenava non parte con troppe sessioni', () => {
  assert.equal(sessionsCap([], 5, '2026-12-01'), 2);
  const four = Array.from({ length: 12 }, (_, i) => ({ day: addDaysStr('2026-11-04', i * 2) }));
  assert.equal(sessionsCap(four, 6, '2026-12-01'), 4);
  assert.equal(sessionsCap(four, 2, '2026-12-01'), 2);
});

test('piano: non crea duplicati se rieseguito, non tocca eventi modificati, chiede conferma per le rimozioni', () => {
  const today = '2026-12-01';
  const plan = planWeek({ today, sessionsPerWeek: 3, minutes: 30, history: Array.from({ length: 12 }, (_, i) => ({ day: addDaysStr('2026-11-04', i * 2) })) });
  const first = reconcilePlan([], plan, today);
  assert.equal(first.toAdd.length, plan.events.length);
  assert.equal(first.needsConfirmation, false, 'aggiungere non richiede conferma');
  // il piano è già nel calendario: rieseguire non aggiunge nulla
  const existing = plan.events.map((e, i) => ({ ...e, id: `e${i}`, source: 'plan', plan_data: e.plan_data, completed: false, user_modified: false, status: 'confirmed' }));
  const replan = planWeek({ today, sessionsPerWeek: 3, minutes: 30, events: existing, history: Array.from({ length: 12 }, (_, i) => ({ day: addDaysStr('2026-11-04', i * 2) })) });
  const again = reconcilePlan(existing, replan, today);
  assert.equal(again.toAdd.length, 0, 'nessun duplicato');
  assert.equal(replan.events.length, 0, 'il piano esistente conta già nella quota');
  assert.equal(again.toRemove.length, 0, 'il piano esistente e valido non va mai tolto');
  assert.equal(again.needsConfirmation, false);
  // se cambia la disponibilità (un giorno non più libero) l'evento superato viene proposto per la rimozione, con conferma
  const dropDay = weekdayOf(existing[0].day);
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => d !== dropDay);
  const changed = planWeek({ today, availableDays: days, sessionsPerWeek: 3, minutes: 30, events: existing, history: Array.from({ length: 12 }, (_, i) => ({ day: addDaysStr('2026-11-04', i * 2) })) });
  assert.deepEqual(changed.stale.map((e) => e.plan_key), [existing[0].plan_key]);
  const diff = reconcilePlan(existing, changed, today);
  assert.equal(diff.toRemove.length, 1);
  assert.equal(diff.needsConfirmation, true, 'togliere qualcosa chiede conferma');
  // un nuovo impegno personale sopra una sessione: la sessione non viene sovrascritta né l'impegno spostato, si propone di toglierla
  const clash = planWeek({ today, sessionsPerWeek: 3, minutes: 30, events: [...existing, dayEv(existing[1].day, existing[1].start, '23:00')], history: Array.from({ length: 12 }, (_, i) => ({ day: addDaysStr('2026-11-04', i * 2) })) });
  assert.ok(clash.stale.some((e) => e.plan_key === existing[1].plan_key));
  // eventi svolti, rifiutati o modificati da Alessia non si toccano mai
  const protectedEvents = existing.map((e, i) => ({ ...e, completed: i === 0, user_modified: i === 1, status: i === 2 ? 'declined' : 'confirmed' }));
  const none = planWeek({ today, availableDays: [], sessionsPerWeek: 3, minutes: 30, events: protectedEvents, history: [] });
  assert.equal(none.stale.length, 0);
  assert.equal(reconcilePlan(protectedEvents, none, today).toRemove.length, 0);
  // frequenza sostenibile: se il tetto scende, le sessioni in più vengono proposte per la rimozione
  const tooMany = planWeek({ today, sessionsPerWeek: 3, minutes: 30, events: existing, history: [] });
  assert.ok(tooMany.cap <= 2 && tooMany.stale.length >= existing.length - tooMany.cap);
});

test('sessioni saltate: non si accumulano né si recuperano tutte insieme; una rifiutata non viene riproposta', () => {
  const hist = Array.from({ length: 12 }, (_, i) => ({ day: addDaysStr('2026-11-04', i * 2) }));
  const planned = [
    { day: '2026-12-01', start: '18:00', source: 'plan', plan_key: '2026-W49:2:plan', plan_data: { kind: 'strength' }, completed: false, status: 'confirmed' },   // saltata
    { day: '2026-12-03', start: '18:00', source: 'plan', plan_key: '2026-W49:4:plan', plan_data: { kind: 'cardio' }, completed: false, status: 'declined' },     // rifiutata
  ];
  const plan = planWeek({ today: '2026-12-04', sessionsPerWeek: 3, minutes: 30, events: planned, history: hist });
  assert.ok(plan.events.length <= 1, `troppe sessioni di recupero: ${plan.events.length}`);
  assert.ok(plan.events.every((e) => e.day >= '2026-12-04'));
  assert.ok(!plan.events.some((e) => e.day === '2026-12-03'));
});

test('catalogo coerente col motore: ogni variante esiste e rispetta il livello', () => {
  const ids = new Set(EXERCISES.map((e) => e.id));
  for (const e of EXERCISES) {
    for (const k of [e.easier, e.harder, ...e.prereq]) if (k) assert.ok(ids.has(k), `${e.id}: riferimento inesistente ${k}`);
    if (e.easier) assert.ok(exercise(e.easier).level <= e.level, `${e.id}: la variante più semplice è più difficile`);
    if (e.harder) assert.ok(exercise(e.harder).level >= e.level, `${e.id}: la variante più difficile è più facile`);
  }
});
