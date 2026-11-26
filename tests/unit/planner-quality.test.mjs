// Verifica QUALITATIVA del motore: non basta che gli esercizi siano compatibili, la sequenza deve avere una logica.
// Ogni test su una matrice di scenari × molti semi. I problemi trovati nella revisione del 26/11/2026 sono bloccati qui.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSession, validateSession, planSeconds, exercise, chainRoot } from '../../js/data/planner-core.js';
import { EXERCISES } from '../../js/data/exercises-core.js';

const n = (...names) => names.map((name) => ({ name }));
const ALL = n('Tappetino fitness', 'Manubri', 'Kettlebell', 'Elastici fitness', 'Pedana fitness (step)', 'Palla da ginnastica', 'Tapis roulant', 'Cyclette', 'Cavigliere con pesi');
const FLOOR = ['prone', 'side', 'supine', 'quadruped', 'kneeling'];
const ABS = ['dead-bug', 'reverse-crunch', 'leg-raise-crunch', 'toe-taps', 'crunch'];
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 13 + 1);
const SCENARIOS = [
  { name: 'corpo libero 20', ctx: { items: [], level: 'beginner', minutes: 20 } },
  { name: 'tappetino+elastici 30', ctx: { items: n('Tappetino fitness', 'Elastici fitness'), level: 'beginner', minutes: 30 } },
  { name: 'manubri+step 40', ctx: { items: n('Tappetino fitness', 'Manubri', 'Pedana fitness (step)'), level: 'intermediate', minutes: 40 } },
  { name: 'tapis 30', ctx: { items: n('Tappetino fitness', 'Tapis roulant'), level: 'beginner', minutes: 30 } },
  { name: 'tapis 45', ctx: { items: n('Tappetino fitness', 'Tapis roulant', 'Manubri'), level: 'intermediate', minutes: 45 } },
  { name: 'tutto 45', ctx: { items: ALL, level: 'intermediate', minutes: 45 } },
  { name: 'tutto 60 avanzata', ctx: { items: ALL, level: 'advanced', minutes: 60 } },
  { name: 'cyclette 35', ctx: { items: n('Tappetino fitness', 'Cyclette'), level: 'beginner', minutes: 35 } },
];
const plan = (ctx, seed, kind = 'strength') => generateSession({ today: '2026-12-08', seed, ...ctx }, { kind });
const pos = (it) => exercise(it.exercise_key).position;
const each = (fn, kinds = ['strength']) => { for (const sc of SCENARIOS) for (const kind of kinds) for (const seed of SEEDS) fn(plan(sc.ctx, seed, kind), `${sc.name}/${kind}/${seed}`, sc); };

test('riscaldamento ≠ cardio principale: mai la stessa macchina come riscaldamento e come parte cardio', () => {
  let machineWarm = 0; let cardio = 0;
  each((p, tag) => {
    const warm = p.items.filter((i) => i.phase === 'warmup' && pos(i) === 'machine');
    const car = p.items.filter((i) => i.phase === 'cardio');
    if (warm.length) { machineWarm++; assert.ok(!car.length, `${tag}: riscaldamento con macchina E parte cardio`); assert.ok(warm[0].seconds <= 300, `${tag}: riscaldamento troppo lungo`); }
    if (car.length) cardio++;
    assert.ok(car.length <= 1, `${tag}: più blocchi cardio`);
    assert.equal(planSeconds(p.items.filter((i) => i.phase === 'warmup')) <= 420, true, `${tag}: riscaldamento oltre 7 minuti`);
  }, ['strength', 'cardio']);
  assert.ok(machineWarm > 0 && cardio > 0, 'entrambe le situazioni si verificano');
});

test('cardio: dopo la parte principale, e dopo il cardio non si torna a terra', () => {
  each((p, tag) => {
    const idx = p.items.findIndex((i) => i.phase === 'cardio');
    if (idx < 0) return;
    assert.ok(p.items.slice(0, idx).every((i) => i.phase !== 'cooldown' && i.phase !== 'cardio'), `${tag}: cardio fuori posto`);
    assert.ok(p.items.slice(idx + 1).every((i) => i.phase === 'cooldown'), `${tag}: dopo il cardio solo defaticamento`);
    assert.ok(p.items.slice(idx + 1).every((i) => !FLOOR.includes(pos(i))), `${tag}: defaticamento a terra dopo il cardio in piedi o sulla macchina`);
    assert.equal(validateSession(p, { ...SCENARIOS[0].ctx, items: [] }).problems.includes('floor_after_cardio'), false);
  }, ['strength', 'cardio']);
});

test('TAPIS ROULANT: funzione precisa, non in ogni sessione, andatura dolce, defaticamento che rallenta', () => {
  let strengthWith = 0; let total = 0;
  for (const seed of SEEDS) {
    const p = plan({ items: n('Tappetino fitness', 'Tapis roulant'), level: 'beginner', minutes: 45 }, seed);
    total++;
    const t = p.items.filter((i) => i.exercise_key === 'treadmill-walk');
    if (t.length) strengthWith++;
    for (const it of t) {
      assert.ok(it.treadmill.speed <= 3.8 && it.treadmill.incline === 0, `velocità/inclinazione alte: ${JSON.stringify(it.treadmill)}`);
      assert.ok(['warmup', 'cardio', 'cooldown'].includes(it.phase));
      if (it.phase === 'warmup') assert.ok(it.treadmill.speed < 3.5, 'riscaldamento più lento del cardio');
      if (it.phase === 'cooldown') assert.ok(it.treadmill.speed < 3, 'defaticamento che rallenta');
    }
    const cardio = t.find((i) => i.phase === 'cardio');
    if (cardio) { assert.ok(cardio.seconds <= 600, 'chi non ha storico cardio parte da 10 minuti al massimo'); const cd = t.find((i) => i.phase === 'cooldown'); assert.ok(cd && cd.seconds === 120 && cd.treadmill.speed < cardio.treadmill.speed, 'dopo il cardio si rallenta 2 minuti'); }
  }
  assert.ok(strengthWith > total * 0.3 && strengthWith < total, `nelle sessioni di forza il tapis compare in ${strengthWith}/${total}: troppo poco o sempre`);
  // sessione di cardio: il tapis è il blocco principale e il riscaldamento è a corpo libero
  for (const seed of SEEDS.slice(0, 20)) {
    const p = plan({ items: n('Tappetino fitness', 'Tapis roulant'), level: 'beginner', minutes: 30 }, seed, 'cardio');
    assert.ok(p.items.some((i) => i.phase === 'cardio' && i.exercise_key === 'treadmill-walk'));
    assert.ok(p.items.filter((i) => i.phase === 'warmup').every((i) => pos(i) !== 'machine'));
    assert.ok(p.items.filter((i) => i.phase === 'main').length <= 2, 'in una sessione cardio la forza è poca');
  }
  // il cardio cresce con gradualità: dopo settimane di cardio può allungarsi, mai di colpo
  const hist = ['2026-11-24', '2026-11-26', '2026-11-30', '2026-12-02', '2026-12-04'].map((day) => ({ day, key: 'treadmill-walk', setsDone: 1, seconds: 600 }));
  const later = plan({ items: n('Tappetino fitness', 'Tapis roulant'), level: 'intermediate', minutes: 45, history: hist }, 3, 'cardio').items.find((i) => i.phase === 'cardio');
  assert.ok(later.seconds > 600 && later.seconds <= 600 * 1.2, `da 10 a ${later.seconds / 60} minuti: salto troppo grande o assente`);
});

test('ADDOMINALI: presenti con criterio (mai tutti insieme, mai le versioni difficili a chi non è pronta, non in ogni sessione)', () => {
  let withAbs = 0; let total = 0;
  each((p, tag, sc) => {
    const abs = p.items.filter((i) => i.phase === 'main' && ABS.includes(i.exercise_key));
    const core = p.items.filter((i) => i.phase === 'main' && exercise(i.exercise_key).pattern === 'core');
    assert.ok(core.length <= 2, `${tag}: più di due esercizi di core`);
    assert.ok(abs.length <= 2, `${tag}: troppi addominali`);
    if (sc.ctx.level === 'beginner') assert.ok(abs.every((i) => ['dead-bug', 'crunch'].includes(i.exercise_key)), `${tag}: addominale avanzato a una principiante`);
    // gli addominali non sono mai l'unico lavoro: serve almeno un movimento in piedi e uno diverso dal core
    const patterns = new Set(p.items.filter((i) => i.phase === 'main').map((i) => exercise(i.exercise_key).pattern));
    assert.ok(patterns.size >= (sc.ctx.items.length ? 3 : 2), `${tag}: poca varietà (${[...patterns]})`);
    if (sc.ctx.items.some((x) => /tappetino/i.test(x.name))) { total++; if (abs.length) withAbs++; }
  });
  assert.ok(withAbs / total > 0.3 && withAbs / total < 0.95, `addominali in ${withAbs}/${total} sessioni`);
});

test('preferenze: addominali e tapis roulant spenti non compaiono (o quasi), accesi non sono obbligatori', () => {
  let absOff = 0; let absOn = 0; let tmOn = 0; let tmOff = 0; let total = 0;
  for (const seed of SEEDS) {
    const off = plan({ items: ALL, level: 'intermediate', minutes: 45, prefs: { abs: false, treadmill: false } }, seed);
    const on = plan({ items: ALL, level: 'intermediate', minutes: 45 }, seed);
    total++;
    if (off.items.some((i) => ABS.includes(i.exercise_key))) absOff++;
    if (on.items.some((i) => ABS.includes(i.exercise_key))) absOn++;
    if (off.items.some((i) => i.exercise_key === 'treadmill-walk')) tmOff++;
    if (on.items.some((i) => i.exercise_key === 'treadmill-walk')) tmOn++;
  }
  assert.equal(tmOff, 0, 'tapis roulant spento: mai');
  assert.ok(absOff <= total * 0.25, `addominali spenti ma compaiono in ${absOff}/${total}`);
  assert.ok(absOn > total * 0.3 && absOn < total, `addominali accesi: ${absOn}/${total}`);
  assert.ok(tmOn > total * 0.15 && tmOn < total * 0.9, `tapis acceso: ${tmOn}/${total}`);
});

test('bilanciamento: gambe, spinta, tirata, glutei e zona centrale ci sono (se possibili) e nessuna zona domina', () => {
  let ok = 0; let total = 0;
  for (const seed of SEEDS) for (const minutes of [35, 45, 60]) {
    const p = plan({ items: ALL, level: 'intermediate', minutes, prefs: { abs: true } }, seed);
    const g = (pat) => p.items.filter((i) => i.phase === 'main' && pat.includes(exercise(i.exercise_key).pattern)).length;
    const counts = { lower: g(['squat', 'lunge', 'calf']), glute: g(['hinge']), push: g(['push']), pull: g(['pull']), core: g(['core']) };
    total++;
    if (Object.values(counts).every((c) => c >= 1)) ok++;
    for (const [grp, c] of Object.entries(counts)) assert.ok(c <= (minutes >= 50 ? 3 : 2), `${grp}: ${c} esercizi nella stessa sessione`);
  }
  assert.ok(ok / total >= 0.9, `cinque gruppi coperti solo in ${ok}/${total} sessioni`);
});

test('ordine e transizioni: in piedi → a terra, pochi cambi di posizione, nessun ritorno in piedi nella parte principale', () => {
  each((p, tag) => {
    const mains = p.items.filter((i) => i.phase === 'main');
    let changes = 0; let wasFloor = false;
    for (const it of mains) { const f = FLOOR.includes(pos(it)); if (wasFloor && !f) assert.fail(`${tag}: torna in piedi dopo essere andata a terra (${it.exercise_key})`); if (f !== wasFloor) changes++; wasFloor = f; }
    assert.ok(changes <= 1, `${tag}: ${changes} cambi di posizione`);
    // i raggruppamenti per attrezzo: niente "ping-pong" tra due attrezzi
    const seq = mains.map((i) => i.equipment.filter((e) => e !== 'Tappetino').join('+') || '-');
    const flips = seq.filter((x, k) => k > 1 && x === seq[k - 2] && x !== seq[k - 1]).length;
    assert.ok(flips <= 2, `${tag}: continui cambi di attrezzo ${seq}`);
  });
});

test('defaticamento coerente con la posizione in cui si finisce; il respiro chiude sempre', () => {
  each((p, tag) => {
    const cool = p.items.filter((i) => i.phase === 'cooldown');
    assert.ok(cool.length >= 2, `${tag}: defaticamento mancante o troppo scarno`);
    assert.equal(cool.at(-1).exercise_key, 'deep-breathing', `${tag}: manca il respiro finale`);
    const before = p.items.filter((i) => i.phase !== 'cooldown').at(-1);
    if (!FLOOR.includes(pos(before))) assert.ok(cool.every((i) => !['kneeling', 'quadruped'].includes(pos(i))), `${tag}: posizione a terra dopo aver finito in piedi`);
  }, ['strength', 'cardio']);
});

test('durata e recuperi realistici', () => {
  each((p, tag, sc) => {
    const est = planSeconds(p.items) / 60;
    assert.ok(est <= sc.ctx.minutes * 1.15, `${tag}: ${est.toFixed(1)} min su ${sc.ctx.minutes}`);
    // il cardio parte da poco e cresce con gradualità: una sessione di cardio per chi non ha storico può essere più breve del tempo disponibile (e lo dice)
    const kindOfPlan = p.kind;
    assert.ok(est >= sc.ctx.minutes * (kindOfPlan === 'cardio' ? 0.5 : 0.7), `${tag}: solo ${est.toFixed(1)} min su ${sc.ctx.minutes}`);
    if (kindOfPlan === 'cardio' && est < sc.ctx.minutes * 0.7) assert.ok(p.assumptions.some((x) => /cardio/i.test(x)), `${tag}: sessione più breve senza spiegazione`);
    for (const it of p.items.filter((i) => i.phase === 'main')) {
      assert.ok(it.rest_seconds >= 30 && it.rest_seconds <= 90, `${tag}: recupero ${it.rest_seconds}s per ${it.exercise_key}`);
      assert.ok(it.sets >= 1 && it.sets <= 4);
      if (it.mode === 'time') assert.ok(it.seconds >= 10 && it.seconds <= 60, `${tag}: tenuta di ${it.seconds}s`);
      else assert.ok(it.n >= 5 && it.n <= 20, `${tag}: ${it.n} ripetizioni`);
    }
  }, ['strength', 'cardio']);
  // sessioni brevi: niente esercizi in più del tempo
  for (const seed of SEEDS.slice(0, 20)) assert.ok(planSeconds(plan({ items: ALL, level: 'intermediate', minutes: 15 }, seed).items) / 60 <= 17.5);
});

test('mobilità: davvero leggera (livello base, movimenti dolci, niente forza né cardio)', () => {
  for (const seed of SEEDS) {
    const p = plan({ items: n('Tappetino fitness', 'Manubri', 'Tapis roulant'), level: 'advanced', minutes: 20 }, seed, 'mobility');
    for (const it of p.items) assert.equal(exercise(it.exercise_key).level, 1, `${it.exercise_key} non è di livello base`);
    const mains = p.items.filter((i) => i.phase === 'main');
    assert.ok(mains.length >= 3);
    for (const it of mains) assert.ok(['mobility', 'stretch', 'breath', 'core', 'hinge', 'pull'].includes(exercise(it.exercise_key).pattern) && !['dumbbell-curl', 'band-row', 'band-pull-apart', 'superman'].includes(it.exercise_key), `${it.exercise_key} non è un esercizio di mobilità`);
    assert.ok(!p.items.some((i) => i.phase === 'cardio'));
    const est = planSeconds(p.items) / 60; assert.ok(est >= 14 && est <= 23, `${est} min`);
    assert.ok(p.checks.ok, JSON.stringify(p.checks));
  }
});

test('limitazioni: chi evita le ginocchia non riceve esercizi in ginocchio o a quattro zampe', () => {
  const kneeling = EXERCISES.filter((e) => ['kneeling', 'quadruped'].includes(e.position) || e.id === 'push-up-knees' || e.id === 'plank-knees').map((e) => e.id);
  assert.ok(kneeling.length >= 6);
  for (const e of EXERCISES.filter((x) => kneeling.includes(x.id))) assert.ok(e.flags.includes('knees'), `${e.id} deve avere l'attenzione "knees"`);
  for (const sc of SCENARIOS) for (const seed of SEEDS.slice(0, 20)) for (const kind of ['strength', 'cardio', 'mobility']) {
    const p = plan({ ...sc.ctx, avoidFlags: ['knees'] }, seed, kind);
    for (const it of p.items) assert.ok(!kneeling.includes(it.exercise_key), `${sc.name}: ${it.exercise_key} con ginocchia da evitare`);
  }
  for (const seed of SEEDS.slice(0, 20)) for (const e of plan({ items: ALL, level: 'advanced', minutes: 60, avoidFlags: ['lumbar', 'impact'] }, seed).items) assert.ok(!exercise(e.exercise_key).flags.some((f) => ['lumbar', 'impact'].includes(f)));
});

test('progressione: coerente con storico e limitazioni, graduale, mai oltre i requisiti', () => {
  const days = ['2026-11-16', '2026-11-18', '2026-11-23', '2026-11-25', '2026-11-30', '2026-12-02'];
  const steady = days.map((day) => ({ day, key: 'dead-bug', setsDone: 2 }));
  const base = { items: n('Tappetino fitness'), level: 'beginner', minutes: 30 };
  const chain = (extra) => { const seen = new Set(); for (const seed of SEEDS) for (const it of plan({ ...base, ...extra }, seed).items) if (chainRoot(it.exercise_key) === 'dead-bug') seen.add(it.exercise_key); return seen; };
  assert.deepEqual([...chain({})].sort(), ['dead-bug'], 'senza storico resta sulla variante base');
  assert.deepEqual([...chain({ history: steady.slice(0, 3) })].sort(), ['dead-bug'], 'tre giorni non bastano');
  assert.deepEqual([...chain({ history: steady })].sort(), ['reverse-crunch'], 'sei giorni in tre settimane: un solo passo in più');
  assert.ok(!chain({ history: steady }).has('leg-raise-crunch'), 'mai due gradini insieme');
  assert.deepEqual([...chain({ history: steady, feedback: [{ key: 'dead-bug', rating: 'too_hard', day: '2026-12-02' }] })].sort(), ['dead-bug'], 'con una difficoltà recente non si sale');
  assert.deepEqual([...chain({ history: steady, feedback: [{ key: 'dead-bug', rating: 'pain', day: '2026-12-06' }] })], [], 'con fastidio recente l\'esercizio non c\'è proprio');
  assert.deepEqual([...chain({ history: steady, avoidFlags: ['lumbar'] })].sort(), ['dead-bug'], 'con la schiena da evitare non si propone la variante con attenzione lombare');
  // un livello alto "sulla carta" non sblocca esercizi senza requisiti soddisfatti
  for (const seed of SEEDS.slice(0, 20)) for (const it of plan({ ...base }, seed).items) assert.ok(exercise(it.exercise_key).level <= 1);
});

test('riproducibilità e varietà tra i giorni: stesso seme stessa sessione, semi diversi sessioni diverse', () => {
  const ctx = { items: ALL, level: 'intermediate', minutes: 40 };
  assert.deepEqual(plan(ctx, 5).items.map((i) => i.exercise_key), plan(ctx, 5).items.map((i) => i.exercise_key));
  const distinct = new Set(SEEDS.map((s) => plan(ctx, s).items.map((i) => i.exercise_key).join()));
  assert.ok(distinct.size >= 15, `solo ${distinct.size} sessioni diverse su ${SEEDS.length}`);
});

test('senza tappetino ALE. lo dice (non propone esercizi a terra e spiega come averne di più)', () => {
  const p = plan({ items: [], level: 'beginner', minutes: 20 }, 1);
  assert.ok(p.assumptions.some((a) => /tappetino/i.test(a)));
  assert.ok(p.items.every((i) => !FLOOR.includes(pos(i))));
  assert.ok(!plan({ items: n('Tappetino fitness'), level: 'beginner', minutes: 20 }, 1).assumptions.some((a) => /Senza un tappetino/.test(a)));
});

test('ogni sessione generata passa la verifica di qualità e non ripete lo stesso esercizio (se non per le macchine in fasi diverse)', () => {
  each((p, tag) => {
    assert.ok(p.checks.ok, `${tag}: ${p.checks.problems}`);
    const seen = new Map();
    for (const it of p.items) { const prev = seen.get(it.exercise_key); if (prev) assert.ok(prev !== it.phase && it.phase === 'cooldown', `${tag}: ${it.exercise_key} ripetuto`); seen.set(it.exercise_key, it.phase); }
  }, ['strength', 'cardio', 'mobility']);
});

test('attrezzi raggruppati: al massimo 3 tipi diversi nella parte principale (4 se la sessione è lunga), non tutto l\'inventario insieme', () => {
  let several = 0;
  for (const seed of SEEDS) for (const minutes of [30, 40, 60]) {
    const p = plan({ items: ALL, level: 'intermediate', minutes }, seed);
    const fam = new Set(p.items.filter((i) => i.phase === 'main').flatMap((i) => exercise(i.exercise_key).equipment).filter((k) => k !== 'mat'));
    assert.ok(fam.size <= (minutes >= 50 ? 4 : 3), `${minutes} min/${seed}: ${fam.size} tipi di attrezzo (${[...fam]})`);
    if (fam.size >= 2) several++;
  }
  assert.ok(several > 20, 'gli attrezzi si usano davvero, non solo uno');
});

test('semi consecutivi (il giorno del mese) producono sessioni diverse: nessuna "striscia" di giorni uguali', () => {
  const ctx = { items: ALL, level: 'intermediate', minutes: 40 };
  const flags = []; const sigs = new Set();
  for (let d = 1; d <= 31; d++) {
    const p = plan(ctx, d);
    sigs.add(p.items.filter((i) => i.phase === 'main').map((i) => i.exercise_key).join());
    flags.push(p.items.some((i) => ABS.includes(i.exercise_key)));
  }
  assert.ok(sigs.size >= 20, `solo ${sigs.size} sessioni diverse in 31 giorni`);
  let run = 1; let max = 1;
  for (let i = 1; i < flags.length; i++) { run = flags[i] === flags[i - 1] ? run + 1 : 1; max = Math.max(max, run); }
  assert.ok(max <= 9, `${max} giorni di fila con la stessa scelta sugli addominali`);
  assert.ok(flags.some(Boolean) && flags.some((f) => !f));
});
