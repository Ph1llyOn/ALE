// Strumento di verifica qualitativa: genera allenamenti campione e li stampa in modo leggibile (non fa parte dell'app).
// Uso: node tools/show-samples.mjs [json]
import { generateSession, planSeconds, exercise } from '../js/data/planner-core.js';

const n = (...names) => names.map((name) => ({ name }));
const ALL = n('Tappetino fitness', 'Manubri', 'Kettlebell', 'Elastici fitness', 'Pedana fitness (step)', 'Palla da ginnastica', 'Tapis roulant', 'Cyclette', 'Cavigliere con pesi');
const DAY = (d) => d;
const hist = (days) => days.flatMap(([day, keys]) => keys.map((key) => ({ day, key, setsDone: 2 })));

export const SAMPLES = [
  { id: 1, title: 'Solo corpo libero, principiante, 20 min', ctx: { items: [], level: 'beginner', minutes: 20 }, kind: 'strength' },
  { id: 2, title: 'Tappetino + elastici, principiante, 30 min', ctx: { items: n('Tappetino fitness', 'Elastici fitness'), level: 'beginner', minutes: 30 }, kind: 'strength' },
  { id: 3, title: 'Tappetino + manubri + step, intermedia, 40 min', ctx: { items: n('Tappetino fitness', 'Manubri', 'Pedana fitness (step)'), level: 'intermediate', minutes: 40 }, kind: 'strength' },
  { id: 4, title: 'Tappetino + tapis roulant, principiante, 30 min, forza', ctx: { items: n('Tappetino fitness', 'Tapis roulant'), level: 'beginner', minutes: 30 }, kind: 'strength' },
  { id: 5, title: 'Tappetino + tapis roulant, principiante, 30 min, CARDIO', ctx: { items: n('Tappetino fitness', 'Tapis roulant'), level: 'beginner', minutes: 30 }, kind: 'cardio' },
  { id: 6, title: 'Inventario completo, intermedia, 45 min', ctx: { items: ALL, level: 'intermediate', minutes: 45 }, kind: 'strength' },
  { id: 7, title: 'Inventario completo, avanzata, 60 min', ctx: { items: ALL, level: 'advanced', minutes: 60 }, kind: 'strength' },
  { id: 8, title: 'Inventario completo ma «senza attrezzi», 30 min', ctx: { items: ALL, level: 'intermediate', minutes: 30, prefersNoEquipment: true }, kind: 'strength' },
  { id: 9, title: 'Limitazione schiena (lombare) + ginocchia, 30 min', ctx: { items: n('Tappetino fitness', 'Manubri', 'Cyclette'), level: 'intermediate', minutes: 30, avoidFlags: ['lumbar', 'knees'] }, kind: 'strength' },
  { id: 10, title: 'Preferenze spente (niente addominali, niente tapis roulant), 35 min', ctx: { items: ALL, level: 'intermediate', minutes: 35, prefs: { abs: false, treadmill: false } }, kind: 'strength' },
  { id: 11, title: 'Mobilità e respiro, 20 min', ctx: { items: n('Tappetino fitness'), level: 'beginner', minutes: 20 }, kind: 'mobility' },
  { id: 12, title: 'Con storico: dead bug fatto 3 volte → sblocco addominali con gambe sollevate', ctx: { items: n('Tappetino fitness'), level: 'beginner', minutes: 30, history: hist([['2026-12-01', ['dead-bug', 'wall-push-up']], ['2026-12-03', ['dead-bug', 'wall-push-up']], ['2026-12-05', ['dead-bug']]]) }, kind: 'strength' },
  { id: 13, title: 'Con feedback: squat "troppo difficile" due volte, dolore alla salita sullo step', ctx: { items: n('Tappetino fitness', 'Pedana fitness (step)'), level: 'beginner', minutes: 30, feedback: [{ key: 'squat', rating: 'too_hard', day: '2026-12-05' }, { key: 'squat', rating: 'hard', day: '2026-12-03' }, { key: 'step-up', rating: 'pain', day: '2026-12-06' }] }, kind: 'strength' },
  { id: 14, title: 'Storico costante: dead bug fatto in 6 giorni su 3 settimane, nessun fastidio → un passo in più', ctx: { items: n('Tappetino fitness'), level: 'beginner', minutes: 30, history: hist([['2026-11-16', ['dead-bug']], ['2026-11-18', ['dead-bug']], ['2026-11-23', ['dead-bug']], ['2026-11-25', ['dead-bug']], ['2026-11-30', ['dead-bug']], ['2026-12-02', ['dead-bug']]]) }, kind: 'strength' },
  { id: 15, title: 'Stesso storico ma con un "troppo difficile" recente: nessuna progressione', ctx: { items: n('Tappetino fitness'), level: 'beginner', minutes: 30, history: hist([['2026-11-16', ['dead-bug']], ['2026-11-18', ['dead-bug']], ['2026-11-23', ['dead-bug']], ['2026-11-25', ['dead-bug']], ['2026-11-30', ['dead-bug']], ['2026-12-02', ['dead-bug']]]), feedback: [{ key: 'dead-bug', rating: 'too_hard', day: '2026-12-02' }] }, kind: 'strength' },
  { id: 16, title: 'Cardio senza attrezzi cardio (solo tappetino), principiante, 25 min', ctx: { items: n('Tappetino fitness'), level: 'beginner', minutes: 25 }, kind: 'cardio' },
];

const PH = { warmup: 'RISCALD.', main: 'PRINCIPALE', cardio: 'CARDIO', cooldown: 'DEFATIC.' };
const fmtSec = (s) => (s >= 120 ? `${Math.round(s / 60)} min` : `${s} s`);
export function render(sample, seed = 7) {
  const plan = generateSession({ today: '2026-12-08', seed, ...sample.ctx }, { kind: sample.kind });
  const lines = [`\n#${sample.id} ${sample.title}  [${sample.kind}]  stimata ${Math.round(planSeconds(plan.items) / 60)} min su ${plan.minutes}  verifica: ${plan.checks.ok ? 'OK' : 'PROBLEMI ' + plan.checks.problems}${plan.checks.notes.length ? ' note:' + plan.checks.notes : ''}`];
  plan.items.forEach((it, i) => {
    const e = exercise(it.exercise_key);
    const vol = it.mode === 'time' ? `${it.sets}×${fmtSec(it.seconds)}${it.per_side ? '/lato' : ''}` : `${it.sets}×${it.n}${it.per_side ? '/lato' : ''}`;
    lines.push(`  ${String(i + 1).padStart(2)}. ${PH[it.phase].padEnd(10)} ${it.name.padEnd(42)} ${vol.padEnd(12)} rec ${String(it.rest_seconds).padStart(2)}s  ${e.position.padEnd(9)} ${it.equipment.join('+') || '-'}${it.treadmill ? `  [tapis ${it.treadmill.speed} km/h, ${it.treadmill.incline}%]` : ''}`);
  });
  return { text: lines.join('\n'), plan };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('show-samples.mjs')) {
  for (const s of SAMPLES) console.log(render(s).text);
}
