// Motore di allenamento di ALE. (PURO, senza dipendenze dal browser): usato dal frontend e, copiato, dalle Edge Functions (npm run sync-shared).
// Le regole fondamentali sono qui, deterministiche: compatibilità con l'attrezzatura, limitazioni, struttura della sessione,
// adattamento ai feedback, piano settimanale. L'AI (se attiva) può solo scegliere DENTRO questi limiti, e il server ricontrolla tutto.
//
// Non fa diagnosi, non prescrive diete e non promette dimagrimento localizzato: organizza movimento, recupero e continuità.
import { EXERCISES, EQUIPMENT_LABELS, compatibleExercises, equipmentKeysFrom } from './exercises-core.js';

export const LEVELS = { beginner: 1, intermediate: 2, advanced: 3 };
export const RATINGS = ['too_easy', 'right', 'hard', 'too_hard', 'pain', 'not_completed'];
export const FLAGS = ['lumbar', 'knees', 'wrists', 'shoulders', 'neck', 'impact', 'floor', 'balance'];
export const DEFAULT_PREFS = { treadmill: true, abs: true, treadmill_speed: 3.5, treadmill_incline: 0 };

const byId = new Map(EXERCISES.map((e) => [e.id, e]));
export const exercise = (id) => byId.get(id) ?? null;

// ------------------------------------------------------------------------------------------------ utilità (date come "YYYY-MM-DD")
const DAY = 86400000;
export const dayNum = (d) => Math.floor(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / DAY);
export const dayStr = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export const addDaysStr = (d, k) => dayStr(dayNum(d) + k);
/** 1 = lunedì … 7 = domenica */
export const weekdayOf = (d) => ((dayNum(d) + 3) % 7) + 1;
export const weekStartOf = (d) => addDaysStr(d, 1 - weekdayOf(d));
export function isoWeekKey(d) {
  const n = dayNum(d); const thursday = n - (weekdayOf(d) - 1) + 3; const year = new Date(thursday * DAY).getUTCFullYear();
  const jan4 = Math.floor(Date.UTC(year, 0, 4) / DAY); const week1 = jan4 - (((jan4 + 3) % 7));
  return `${year}-W${String(Math.floor((thursday - week1) / 7) + 1).padStart(2, '0')}`;
}
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const daysBetween = (a, b) => dayNum(b) - dayNum(a);

const POSITION_RANK = { standing: 0, machine: 0, quadruped: 1, kneeling: 2, prone: 3, side: 4, supine: 5, seated: 2 };
const ABS_IDS = new Set(['dead-bug', 'reverse-crunch', 'leg-raise-crunch', 'toe-taps', 'crunch']);
const label = (k) => EQUIPMENT_LABELS[k] ?? k;
const PATTERN_WHY = { squat: 'Lavora gambe e glutei', lunge: 'Lavora gambe e glutei, un lato alla volta', calf: 'Rinforza i polpacci', hinge: 'Lavora glutei e parte posteriore delle gambe', push: 'Lavora spalle, petto e braccia', pull: 'Lavora schiena e braccia', core: 'Lavora la zona centrale', mobility: 'Muove le articolazioni', cardio: 'Fa lavorare cuore e respiro' };

/** Radice di una catena di varianti (la più semplice): serve a non proporre due livelli dello stesso esercizio nella stessa sessione. */
const chainSize = new Map();
for (const x of EXERCISES) { let r = x; const seen = new Set(); while (r.easier && !seen.has(r.id)) { seen.add(r.id); r = byId.get(r.easier); } chainSize.set(r.id, (chainSize.get(r.id) ?? 0) + 1); }

export function chainRoot(id) { let e = exercise(id); const seen = new Set(); while (e?.easier && !seen.has(e.id)) { seen.add(e.id); e = exercise(e.easier); } return e?.id ?? id; }

// ------------------------------------------------------------------------------------------------ contesto
/**
 * ctx = {
 *   items: [{name, avoid}]            inventario di Alessia
 *   prefersNoEquipment: bool, level: 'beginner'|…, minutes: number, avoidFlags: [], prefs: {treadmill, abs, treadmill_speed, treadmill_incline},
 *   history: [{day, key, setsDone, seconds?}]   esercizi svolti (solo completati o parziali con serie fatte)
 *   feedback: [{key, rating, day}]              privati di Alessia
 *   today: 'YYYY-MM-DD', seed: number
 * }
 */
export function normalizeCtx(c = {}) {
  const prefs = { ...DEFAULT_PREFS, ...(c.prefs ?? {}) };
  return {
    items: c.items ?? [], prefersNoEquipment: Boolean(c.prefersNoEquipment), level: LEVELS[c.level] ? c.level : 'beginner',
    minutes: clamp(Number(c.minutes) || 30, 10, 120), avoidFlags: (c.avoidFlags ?? []).filter((f) => FLAGS.includes(f)), prefs,
    history: c.history ?? [], feedback: c.feedback ?? [], today: c.today, seed: Number(c.seed) || 0,
  };
}

const levelNum = (ctx) => LEVELS[ctx.level];

// ------------------------------------------------------------------------------------------------ feedback e progressione
const HARD = new Set(['hard', 'too_hard', 'not_completed']);

/**
 * Cosa fare con un esercizio in base ai feedback (privati) di Alessia. Prudente: una sola indicazione non basta per aumentare.
 * Ritorna { action: 'keep'|'harder'|'easier'|'reduce'|'increase'|'block', reason }.
 */
export function adaptation(key, ctx) {
  const list = ctx.feedback.filter((f) => f.key === key).sort((a, b) => (a.day < b.day ? 1 : -1));
  if (!list.length) return { action: 'keep', reason: null };
  const latest = list[0];
  const age = ctx.today ? daysBetween(latest.day, ctx.today) : 0;
  if (latest.rating === 'pain') return age <= 14 ? { action: 'block', reason: 'Hai segnalato fastidio: per ora non te lo propongo.' } : { action: 'keep', reason: null };
  const recent = list.slice(0, 3).filter((f) => !ctx.today || daysBetween(f.day, ctx.today) <= 60);
  if (!recent.length) return { action: 'keep', reason: null };
  const hardCount = recent.filter((f) => HARD.has(f.rating)).length;
  if (hardCount >= 2) return { action: 'easier', reason: 'Nelle ultime volte è stato impegnativo: ti propongo qualcosa di più leggero.' };
  if (HARD.has(recent[0].rating) && recent[0].rating !== 'hard') return { action: 'reduce', reason: 'L’ultima volta era troppo impegnativo: meno serie, con calma.' };
  if (recent.length >= 2 && recent[0].rating === 'too_easy' && recent[1].rating === 'too_easy') return { action: 'harder', reason: 'Per più volte ti è sembrato facile: provo un gradino in più.' };
  return { action: 'keep', reason: null };
}

const timesDone = (ctx, id) => new Set(ctx.history.filter((h) => h.key === id && (h.setsDone ?? 1) > 0).map((h) => h.day)).size;
function prereqMet(e, ctx) {
  return e.prereq.every((p) => timesDone(ctx, p) >= 2 && !ctx.feedback.some((f) => f.key === p && (f.rating === 'pain' || HARD.has(f.rating)) && (!ctx.today || daysBetween(f.day, ctx.today) <= 30)));
}

/** Esercizi che si possono davvero proporre ora: attrezzatura, preferenze, limitazioni, livello, dolore recente. */
export function eligibleExercises(ctxIn) {
  const ctx = normalizeCtx(ctxIn);
  const lvl = levelNum(ctx);
  return compatibleExercises(ctx.items, { prefersNoEquipment: ctx.prefersNoEquipment }).filter((e) => {
    if (e.flags.some((f) => ctx.avoidFlags.includes(f))) return false;
    if (adaptation(e.id, ctx).action === 'block') return false;
    if (ctx.prefs.treadmill === false && e.equipment.includes('treadmill')) return false;
    if (e.level > lvl && !(e.prereq.length && prereqMet(e, ctx))) return false;
    return true;
  });
}

// ------------------------------------------------------------------------------------------------ stima della durata
const SETUP_SECONDS = 25;
export function itemSeconds(it) {
  const sides = it.per_side ? 2 : 1;
  const work = it.mode === 'time' ? it.seconds * sides : (it.n ?? 10) * 3.5 * sides;
  return SETUP_SECONDS + it.sets * work + Math.max(0, it.sets - 1) * (it.rest_seconds ?? 0);
}
export const planSeconds = (items) => items.reduce((t, it) => t + itemSeconds(it), 0);

// ------------------------------------------------------------------------------------------------ costruzione di una voce
/** Trasforma un esercizio del catalogo in una voce di sessione, con eventuali adattamenti di volume. */
export function buildItem(e, { phase = 'main', why = [], sets, seconds, volume = 'keep', treadmill = null } = {}) {
  let nSets = sets ?? e.sets; let n = e.n; let secs = seconds ?? e.seconds;
  if (volume === 'reduce') { nSets = Math.max(1, nSets - 1); if (e.mode === 'reps') n = Math.max(5, Math.round(n * 0.8)); else secs = Math.max(10, Math.round(secs * 0.8)); }
  if (volume === 'increase') { if (e.mode === 'reps') n = Math.min(Math.ceil(e.n * 1.2), n + 2); else secs = Math.min(Math.round(e.seconds * 1.25), secs + 5); }
  const item = {
    exercise_key: e.id, name: e.name, phase, mode: e.mode, sets: nSets, per_side: Boolean(e.perSide), rest_seconds: e.rest,
    notes: e.tip, why, equipment: e.equipment.map(label),
  };
  if (e.mode === 'time') { item.seconds = secs; item.reps = secs >= 120 ? `${Math.round(secs / 60)} minuti` : `${secs} secondi`; } else { item.n = n; item.reps = String(n); }
  if (e.perSide) item.reps += ' per lato';
  if (treadmill) item.treadmill = treadmill;
  return item;
}

const treadmillFor = (ctx, phase) => {
  const base = ctx.prefs.treadmill_speed; const f = phase === 'main' || phase === 'cardio' ? 1 : phase === 'warmup' ? 0.8 : 0.7;
  const bump = phase === 'cardio' && ctx.level !== 'beginner' ? 0.3 : 0;
  return { speed: Math.round((base * f + bump) * 10) / 10, incline: phase === 'cardio' ? ctx.prefs.treadmill_incline : 0 };
};

// ------------------------------------------------------------------------------------------------ recenza
const lastUsedDay = (ctx, id) => ctx.history.filter((h) => h.key === id).map((h) => h.day).sort().pop() ?? null;
function daysSince(ctx, id) { const d = lastUsedDay(ctx, id); return d && ctx.today ? daysBetween(d, ctx.today) : null; }
function muscleRecency(ctx, muscle) {
  let best = null;
  for (const h of ctx.history) { const e = exercise(h.key); if (!e?.muscles.includes(muscle)) continue; const d = ctx.today ? daysBetween(h.day, ctx.today) : 99; if (best === null || d < best) best = d; }
  return best; // null = mai
}

// ------------------------------------------------------------------------------------------------ scelta degli esercizi principali
function scoreCandidate(e, ctx, chosen) {
  let s = 10; const why = [PATTERN_WHY[e.pattern] ?? 'Completa la sessione'];
  const used = daysSince(ctx, e.id);
  if (used !== null) { if (used <= 1) s -= 12; else if (used <= 3) s -= 6; else if (used <= 7) s -= 2; }
  const need = e.muscles.filter((m) => m !== 'full').map((m) => muscleRecency(ctx, m));
  const worst = need.length ? Math.min(6, Math.max(...need.map((d) => (d === null ? 6 : d)))) : 0;
  if (worst >= 3 && ctx.history.length) { s += worst; why.push(worst >= 6 ? 'da un po’ non la allenavi' : 'ha riposato qualche giorno'); }
  if (e.equipment.some((k) => k !== 'mat') && !ctx.prefersNoEquipment) { s += 4; why.push('Usa un attrezzo che hai'); }
  if (ABS_IDS.has(e.id) && ctx.prefs.abs !== false) { s += 3; why.push('Addominali, una cosa che ti piace'); }
  if (e.level === levelNum(ctx)) s += 2;
  if ((chainSize.get(chainRoot(e.id)) ?? 1) > 1) s += 3;             // movimenti di base con una progressione (squat, piegamenti, ponte, plank…)
  if (!chosen.some((c) => c.pattern === e.pattern)) s += 6;
  s += hash(`${e.id}:${ctx.seed}`) * 7; // varietà riproducibile (stesso giorno → stessa proposta)
  return { s, why };
}

/** Sceglie la variante giusta di un esercizio in base ai feedback. */
function resolveVariant(e, ctx, poolIds) {
  const a = adaptation(e.id, ctx);
  if (a.action === 'easier' && e.easier && poolIds.has(e.easier)) return { e: exercise(e.easier), volume: 'keep', note: a.reason };
  if (a.action === 'easier') return { e, volume: 'reduce', note: a.reason };
  if (a.action === 'reduce') return { e, volume: 'reduce', note: a.reason };
  if (a.action === 'harder' && e.harder && poolIds.has(e.harder)) return { e: exercise(e.harder), volume: 'keep', note: a.reason };
  if (a.action === 'harder') return { e, volume: 'increase', note: a.reason };
  return { e, volume: 'keep', note: null };
}

/** Per ogni catena di varianti si parte dalla più adatta al livello: la più impegnativa fra quelle consentite (le più difficili solo se sbloccate). */
function representatives(pool, ctx) {
  const lvl = levelNum(ctx); const groups = new Map();
  for (const e of pool) { const r = chainRoot(e.id); groups.set(r, [...(groups.get(r) ?? []), e]); }
  const hops = (e) => { let n = 0; let x = e; while (x?.easier) { n++; x = exercise(x.easier); } return n; };
  const out = [];
  for (const members of groups.values()) {
    const ok = members.filter((e) => e.level <= lvl);
    const base = ok.length ? ok : [...members].sort((a, b) => a.level - b.level).slice(0, 1);
    const top = Math.max(...base.map((e) => e.level));
    const same = base.filter((e) => e.level === top).sort((a, b) => hops(a) - hops(b) || hash(a.id + ctx.seed) - hash(b.id + ctx.seed));
    // a parità di livello si parte dalla variante più semplice, salvo che i requisiti siano già stati soddisfatti nello storico
    const ready = same.filter((e) => !e.prereq.length || prereqMet(e, ctx));
    out.push(ready.length ? ready[ready.length - 1] : same[0]);
  }
  return out;
}

const GROUP = (e) => (['squat', 'lunge', 'calf'].includes(e.pattern) ? 'lower' : e.pattern === 'hinge' ? 'glute' : e.pattern);
const MAIN_LIMITS = { lower: 2, glute: 1, push: 1, pull: 1, core: 2, mobility: 1 };

function cardioMachine(ctx, pool) {
  const options = pool.filter((e) => e.phases.includes('cardio') && e.position === 'machine');
  if (!options.length) return null;
  // la meno usata di recente tra quelle disponibili (così gli attrezzi si alternano, senza inserirli a caso)
  return [...options].sort((a, b) => (daysSince(ctx, b.id) ?? 99) - (daysSince(ctx, a.id) ?? 99) || hash(a.id + ctx.seed) - hash(b.id + ctx.seed))[0];
}

/** Minuti di cardio sostenibili: crescita graduale rispetto a ciò che Alessia ha già fatto. */
export function cardioCapSeconds(ctx) {
  const base = { beginner: 900, intermediate: 1500, advanced: 2100 }[ctx.level];
  const recent = ctx.history.filter((h) => exercise(h.key)?.pattern === 'cardio' && h.seconds && (!ctx.today || daysBetween(h.day, ctx.today) <= 28));
  if (!recent.length) return Math.min(base, 600);
  const longest = Math.max(...recent.map((h) => h.seconds));
  return Math.min(base, Math.max(600, Math.round((longest * 1.15) / 60) * 60));
}

/**
 * Costruisce una sessione. kind: 'strength' (forza, con cardio breve se c'è tempo) | 'cardio' (cardio + poco lavoro di forza) | 'mobility' (leggera).
 * Ritorna { kind, title, minutes, estimated_minutes, items, summary, assumptions }.
 */
export function generateSession(ctxIn, { kind = 'strength' } = {}) {
  const ctx = normalizeCtx(ctxIn);
  let best = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const plan = buildSession({ ...ctx, seed: ctx.seed + attempt * 7919 }, kind);
    const check = validateSession(plan, ctx);
    plan.checks = check;
    if (check.ok) return plan;
    if (!best || check.problems.length < best.checks.problems.length) best = plan;
  }
  return best;
}

function buildSession(ctx, kind) {
  const pool = eligibleExercises(ctx);
  const poolIds = new Set(pool.map((e) => e.id));
  const assumptions = [];
  const minutes = ctx.minutes;
  // la parte cardio nella sessione di forza c'è solo a volte (e non se ieri ne ha già fatta): non serve in ogni allenamento
  const cardioRecent = ctx.history.some((h) => exercise(h.key)?.pattern === 'cardio' && ctx.today && daysBetween(h.day, ctx.today) <= 1);
  const wantCardio = kind === 'cardio' || (kind === 'strength' && minutes >= 40 && !cardioRecent && hash(`cardio:${ctx.seed}`) < 0.55);
  const items = [];
  // la macchina cardio fa da riscaldamento solo se in questa sessione non c'è già una parte cardio (niente doppioni)
  const machineWarm = !wantCardio && kind === 'strength' && !ctx.prefersNoEquipment && minutes >= 30 && hash(`warm:${ctx.seed}`) < 0.5 ? cardioMachine(ctx, pool) : null;

  // ---- 1) riscaldamento

  if (machineWarm) {
    items.push(buildItem(machineWarm, { phase: 'warmup', seconds: 300, why: ['Riscaldamento graduale con ' + label(machineWarm.equipment[0]).toLowerCase()], treadmill: machineWarm.equipment.includes('treadmill') ? treadmillFor(ctx, 'warmup') : null }));
  } else {
    const warm = pool.filter((e) => e.phases.includes('warmup') && !e.equipment.length && e.pattern !== 'cardio');
    const march = pool.find((e) => e.id === 'march');
    if (march) items.push(buildItem(march, { phase: 'warmup', sets: 1, seconds: 60, why: ['Scalda il corpo piano piano'] }));
    const mobility = warm.sort((a, b) => hash(a.id + ctx.seed) - hash(b.id + ctx.seed)).slice(0, kind === 'mobility' ? 3 : 2);
    for (const e of mobility) items.push(buildItem(e, { phase: 'warmup', sets: 1, why: ['Muove le articolazioni prima dello sforzo'] }));
  }

  // ---- 2) parte principale
  const mainPool = pool.filter((e) => e.phases.includes('main') && !(kind === 'mobility' && e.level > 1));
  const repsPool = representatives(mainPool, ctx);
  const warmSecs = planSeconds(items);
  const coolReserve = minutes >= 20 ? 200 : 0;
  const cardioReserve = !wantCardio ? 0 : kind === 'cardio' ? Math.max(420, minutes * 60 * 0.35) : Math.min(600, minutes * 60 * 0.22);
  const targetMainSeconds = Math.max(240, minutes * 60 - warmSecs - coolReserve - cardioReserve);
  const chosen = []; const used = new Set(); const groupCount = {};
  const maxCount = kind === 'cardio' ? 3 : kind === 'mobility' ? 4 : 7;
  const absOk = ctx.prefs.abs !== false;
  while (chosen.length < maxCount) {
    const secs = planSeconds(chosen.map((c) => c.item));
    if (chosen.length >= 3 && secs >= targetMainSeconds) break;
    const cands = repsPool.filter((e) => (chosen.length < 3 || (daysSince(ctx, e.id) ?? 99) > 1) && !used.has(chainRoot(e.id)) && (groupCount[GROUP(e)] ?? 0) < (MAIN_LIMITS[GROUP(e)] ?? 1) && (absOk || e.pattern !== 'core' || chosen.every((c) => c.pattern !== 'core'))
      && !(kind === 'cardio' && !['squat', 'hinge', 'core'].includes(e.pattern)));
    if (!cands.length) break;
    const scored = cands.map((e) => ({ e, ...scoreCandidate(e, ctx, chosen) })).sort((a, b) => b.s - a.s);
    const pick = scored[0];
    const v = resolveVariant(pick.e, ctx, poolIds);
    const why = [...pick.why]; if (v.note) why.unshift(v.note);
    const item = buildItem(v.e, { phase: 'main', why, volume: v.volume });
    chosen.push({ item, pattern: v.e.pattern, e: v.e });
    used.add(chainRoot(pick.e.id)); used.add(chainRoot(v.e.id));
    groupCount[GROUP(pick.e)] = (groupCount[GROUP(pick.e)] ?? 0) + 1;
  }
  // ordine: dalla posizione in piedi a quelle a terra (meno cambi), addominali impegnativi verso la fine
  chosen.sort((a, b) => (POSITION_RANK[a.e.position] ?? 0) - (POSITION_RANK[b.e.position] ?? 0) || (a.e.pattern === 'core') - (b.e.pattern === 'core') || a.e.equipment.join().localeCompare(b.e.equipment.join()));
  for (const c of chosen) items.push(c.item);

  // ---- 3) cardio (solo se previsto e con una funzione precisa)
  if (wantCardio) {
    const machine = !ctx.prefersNoEquipment ? cardioMachine(ctx, pool) : null;
    const cap = cardioCapSeconds(ctx);
    const warmUp = planSeconds(items); const coolEst = 240;
    const room = Math.max(300, minutes * 60 - warmUp - coolEst);
    const secs = Math.max(300, Math.min(cap, Math.round(room / 60) * 60));
    if (machine) {
      items.push(buildItem(machine, { phase: 'cardio', seconds: kind === 'cardio' ? secs : Math.min(secs, 600), why: ['Parte cardio a un ritmo in cui riesci a parlare'], treadmill: machine.equipment.includes('treadmill') ? treadmillFor(ctx, 'cardio') : null }));
    } else {
      const free = pool.find((e) => e.id === 'step-jack') ?? pool.find((e) => e.id === 'march');
      if (free) items.push(buildItem(free, { phase: 'cardio', sets: 3, seconds: 40, why: ['Parte cardio a corpo libero, senza salti'] }));
      assumptions.push('Nessun attrezzo cardio disponibile: parte cardio a corpo libero.');
    }
  }

  // ---- 4) defaticamento
  if (minutes >= 20) {
    const cool = pool.filter((e) => e.phases.includes('cooldown') && !e.phases.includes('main') && e.pattern !== 'cardio' && !items.some((i) => i.exercise_key === e.id)).sort((a, b) => hash(a.id + ctx.seed) - hash(b.id + ctx.seed));
    const lastFloor = ['prone', 'side', 'supine', 'quadruped'].includes(items[items.length - 1]?.exercise_key && exercise(items[items.length - 1].exercise_key)?.position);
    const stretches = [];
    const child = cool.find((e) => e.id === 'child-pose'); if (lastFloor && child) stretches.push(child);
    for (const e of cool) { if (stretches.length >= 2) break; if (e.id !== 'deep-breathing' && !stretches.includes(e)) stretches.push(e); }
    const breath = cool.find((e) => e.id === 'deep-breathing');
    stretches.sort((a, b) => (POSITION_RANK[b.position] ?? 0) - (POSITION_RANK[a.position] ?? 0));
    if (breath) stretches.push(breath);
    for (const e of stretches) items.push(buildItem(e, { phase: 'cooldown', sets: Math.min(e.sets, 1), why: ['Fa scendere piano il ritmo'] }));
    // dopo un cardio di macchina, un breve defaticamento camminando può bastare: non lo aggiungo di default
  }

  // ---- 5) adattamento alla durata
  let guard = 0;
  while (planSeconds(items) > minutes * 60 * 1.15 && guard++ < 8) {
    const mains = items.filter((i) => i.phase === 'main');
    const reducible = mains.find((i) => i.sets > 2) ?? null;
    if (reducible) reducible.sets -= 1;
    else if (mains.length > 3) items.splice(items.lastIndexOf(mains[mains.length - 1]), 1);
    else break;
  }
  const est = planSeconds(items);
  const title = kind === 'cardio' ? 'Cardio dolce' : kind === 'mobility' ? 'Mobilità e respiro' : 'Forza e movimento';
  return {
    kind, title, minutes, estimated_minutes: Math.round(est / 60), items,
    summary: { warmup: items.filter((i) => i.phase === 'warmup').length, main: items.filter((i) => i.phase === 'main').length, cardio: items.filter((i) => i.phase === 'cardio').length, cooldown: items.filter((i) => i.phase === 'cooldown').length },
    assumptions,
  };
}

// ------------------------------------------------------------------------------------------------ verifica della qualità
/**
 * Controlla una sessione (anche generata dall'AI) con regole deterministiche. Ritorna { ok, problems: [codici], notes: [testo] }.
 * Problemi bloccanti: esercizio sconosciuto o non compatibile, attrezzo mancante, limitazione violata, dolore recente, sequenza senza struttura.
 */
export function validateSession(plan, ctxIn) {
  const ctx = normalizeCtx(ctxIn);
  const problems = []; const notes = [];
  const items = plan?.items ?? [];
  if (!items.length) return { ok: false, problems: ['empty'], notes: [] };
  const have = equipmentKeysFrom(ctx.items);
  const seen = new Set(); const roots = new Set();
  for (const it of items) {
    const e = exercise(it.exercise_key);
    if (!e) { problems.push('unknown_exercise'); continue; }
    if (e.equipment.some((k) => !have.has(k))) problems.push('equipment_missing');
    if (ctx.prefersNoEquipment && e.equipment.some((k) => k !== 'mat')) problems.push('no_equipment_preference');
    if (e.flags.some((f) => ctx.avoidFlags.includes(f))) problems.push('avoid_flag');
    if (adaptation(e.id, ctx).action === 'block') problems.push('recent_pain');
    if (ctx.prefs.treadmill === false && e.equipment.includes('treadmill')) problems.push('treadmill_disabled');
    if (e.level > levelNum(ctx) && !(e.prereq.length && prereqMet(e, ctx))) problems.push('level_too_high');
    if (seen.has(e.id) && it.phase === 'main') problems.push('duplicate_exercise');
    if (it.phase === 'main') { const r = chainRoot(e.id); if (roots.has(r)) problems.push('duplicate_chain'); roots.add(r); }
    seen.add(e.id);
    if (!(it.sets >= 1 && it.sets <= 6)) problems.push('bad_sets');
    if (it.phase === 'main' && e.mode === 'reps' && it.sets > 1 && (it.rest_seconds ?? 0) < 20) problems.push('rest_too_short');
  }
  const order = { warmup: 0, main: 1, cardio: 2, cooldown: 3 };
  for (let i = 1; i < items.length; i++) if ((order[items[i].phase] ?? 1) < (order[items[i - 1].phase] ?? 1)) { problems.push('bad_order'); break; }
  const phases = new Set(items.map((i) => i.phase));
  const mains = items.filter((i) => i.phase === 'main');
  const kind = plan.kind ?? 'strength';
  if (!phases.has('warmup') && kind !== 'mobility') problems.push('no_warmup');
  if (kind === 'strength' || kind === 'cardio') {
    const patterns = new Set(mains.map((i) => exercise(i.exercise_key)?.pattern).filter(Boolean));
    if (mains.length < (kind === 'cardio' ? 2 : 3)) problems.push('main_too_short');
    if (patterns.size < Math.min(3, mains.length)) problems.push('poor_variety');
    if (kind === 'strength' && mains.length >= 3 && !patterns.has('push') && !patterns.has('pull') && !items.some((i) => i.phase === 'cardio')) notes.push('upper_missing');
    if (kind === 'cardio' && !phases.has('cardio')) problems.push('cardio_missing');
  }
  const core = mains.filter((i) => exercise(i.exercise_key)?.pattern === 'core');
  if (core.length > 2) problems.push('too_much_core');
  const counts = {}; for (const i of mains) { const g = GROUP(exercise(i.exercise_key) ?? { pattern: 'x' }); counts[g] = (counts[g] ?? 0) + 1; }
  for (const [g, n] of Object.entries(counts)) if (n > (MAIN_LIMITS[g] ?? 1) + 1) problems.push('unbalanced');
  if (kind !== 'mobility' && plan.minutes >= 20 && !phases.has('cooldown')) problems.push('no_cooldown');
  // transizioni: cambi di posizione e di attrezzo nella parte principale
  let posChanges = 0; let eqChanges = 0;
  for (let i = 1; i < mains.length; i++) {
    const a = exercise(mains[i - 1].exercise_key); const b = exercise(mains[i].exercise_key);
    if (!a || !b) continue;
    const floor = (p) => ['prone', 'side', 'supine', 'quadruped', 'kneeling'].includes(p);
    if (floor(a.position) !== floor(b.position)) posChanges++;
    if (a.equipment.filter((k) => k !== 'mat').join() !== b.equipment.filter((k) => k !== 'mat').join()) eqChanges++;
  }
  if (posChanges > 2) problems.push('too_many_position_changes');
  if (eqChanges > Math.max(3, mains.length - 1)) notes.push('many_equipment_changes');
  const est = planSeconds(items) / 60;
  if (plan.minutes && est > plan.minutes * 1.25) problems.push('duration_off');   // troppo lunga: non rispetta il tempo disponibile
  if (plan.minutes && est < plan.minutes * 0.5) notes.push('short_session');     // più breve del previsto: va bene, non è un rischio
  return { ok: problems.length === 0, problems: [...new Set(problems)], notes };
}

// ------------------------------------------------------------------------------------------------ piano settimanale
const SLOTS = ['18:00', '17:00', '19:00', '12:30', '08:30', '20:00', '10:00'];
const toMin = (hm) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
function slotFree(events, day, start, duration) {
  const a = toMin(start) - 30; const b = toMin(start) + duration + 30;
  return events.filter((ev) => ev.day === day).every((ev) => {
    if (ev.all_day) return true;               // un evento di tutto il giorno non occupa un orario preciso
    const s = toMin(ev.start); const e = ev.end ? toMin(ev.end) : s + 60;
    return e <= a || s >= b;
  });
}
const KIND_BY_COUNT = { 1: ['strength'], 2: ['strength', 'cardio'], 3: ['strength', 'cardio', 'strength'], 4: ['strength', 'cardio', 'strength', 'mobility'], 5: ['strength', 'cardio', 'strength', 'mobility', 'cardio'], 6: ['strength', 'cardio', 'strength', 'mobility', 'cardio', 'mobility'] };
const KIND_TITLE = { strength: 'Forza e movimento', cardio: 'Cardio dolce', mobility: 'Mobilità e respiro' };

/** Quante sessioni a settimana si possono proporre senza aumenti improvvisi: la media recente + 1 (minimo 2). */
export function sessionsCap(history, requested, today) {
  const days = new Set(history.filter((h) => daysBetween(h.day, today) <= 28 && daysBetween(h.day, today) >= 0).map((h) => h.day));
  const avg = days.size / 4;
  return clamp(Math.min(requested, Math.max(2, Math.ceil(avg) + 1)), 1, 6);
}

/**
 * Piano della settimana che contiene `today`.
 * input: { today, availableDays:[1..7], sessionsPerWeek, minutes, events:[{day,start,end,all_day,source,category,completed,plan_key}], history:[{day,key}], enabledKinds? }
 * Regole: non tocca gli eventi personali; non pianifica nel passato; una sola attività al giorno; almeno due giorni di riposo;
 * dopo una sessione di forza non ne mette un'altra il giorno dopo; non supera la frequenza sostenibile.
 */
export function planWeek({ today, availableDays = [1, 2, 3, 4, 5, 6, 7], sessionsPerWeek = 3, minutes = 30, events = [], history = [], doneDays = [] }) {
  const start = weekStartOf(today); const wk = isoWeekKey(today);
  const cap = sessionsCap(history, sessionsPerWeek, today);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysStr(start, i));
  const inWeek = (d) => weekDays.includes(d);
  const allPlanned = events.filter((e) => e.source === 'plan' && inWeek(e.day));
  // sessioni del piano che non reggono più (giorno non più disponibile, ora occupata da un impegno personale, oltre la frequenza sostenibile):
  // non si toccano da sole, si segnalano per chiedere conferma. Quelle svolte, rifiutate o modificate da Alessia non sono mai "superate".
  const touchable = allPlanned.filter((e) => !e.completed && !e.user_modified && e.status !== 'declined' && e.day >= today);
  const personal = events.filter((e) => e.source !== 'plan' && e.status !== 'declined');
  const stale = touchable.filter((e) => !availableDays.includes(weekdayOf(e.day)) || !slotFree(personal, e.day, e.start ?? '18:00', e.plan_data?.minutes ?? minutes));
  const keptTouchable = touchable.filter((e) => !stale.includes(e));
  const extra = keptTouchable.length > cap ? keptTouchable.slice(cap) : [];
  for (const e of extra) stale.push(e);
  const planned = allPlanned.filter((e) => !stale.includes(e));
  const manualWorkouts = events.filter((e) => e.source !== 'plan' && inWeek(e.day) && ['workout', 'walk'].includes(e.category) && e.status !== 'declined');
  const done = new Set(doneDays.filter(inWeek));
  const taken = new Set([...planned.map((e) => e.day), ...manualWorkouts.map((e) => e.day), ...done]);
  const strengthDays = new Set([...history.filter((h) => exercise(h.key)?.pattern && !['cardio', 'stretch', 'mobility', 'breath'].includes(exercise(h.key).pattern)).map((h) => h.day)]);
  const doneOrPlanned = taken.size;
  let remaining = Math.max(0, Math.min(cap, 7 - 2) - doneOrPlanned);
  const out = [];
  const candidates = weekDays.filter((d) => d >= today && availableDays.includes(weekdayOf(d)) && !taken.has(d));
  const chosenDays = [];
  while (remaining > 0 && candidates.length) {
    // preferisci il giorno più lontano dalle attività già fissate (distribuzione ragionata)
    const occupied = [...taken, ...chosenDays];
    const score = (d) => Math.min(...(occupied.length ? occupied.map((o) => Math.abs(daysBetween(o, d))) : [3]), 3) + (hash(d + wk) * 0.1);
    const next = [...candidates].sort((a, b) => score(b) - score(a))[0];
    candidates.splice(candidates.indexOf(next), 1);
    // recupero: niente forza il giorno dopo una sessione di forza (già fatta o fissata)
    const prev = addDaysStr(next, -1);
    const afterStrength = strengthDays.has(prev) || out.some((o) => o.day === prev && o.plan_data.kind === 'strength') || planned.some((p) => p.day === prev && p.plan_data?.kind === 'strength');
    const free = SLOTS.find((s) => slotFree(events, next, s, minutes));
    if (!free) continue;                       // giornata piena di impegni: non si tocca
    chosenDays.push(next); remaining -= 1;
    out.push({ day: next, start: free, plan_data: { kind: afterStrength ? 'cardio' : 'strength', minutes }, title: '' });
  }
  // assegna le tipologie in ordine cronologico, alternando; la prima dopo una forza recente resta cardio/mobilità
  out.sort((a, b) => (a.day < b.day ? -1 : 1));
  const total = out.length + planned.length + manualWorkouts.length + done.size;
  const seq = KIND_BY_COUNT[clamp(total, 1, 6)];
  const already = [...planned.map((p) => p.plan_data?.kind).filter(Boolean)];
  const pending = seq.filter((k) => { const i = already.indexOf(k); if (i >= 0) { already.splice(i, 1); return false; } return true; });
  let prevKind = null;
  out.forEach((o, i) => {
    const wantsLight = strengthDays.has(addDaysStr(o.day, -1));
    let kind = pending[i] ?? 'strength';
    if (kind === 'strength' && (wantsLight || prevKind === 'strength' && daysBetween(prevDay(out, i), o.day) <= 1)) kind = 'cardio';
    o.plan_data.kind = kind; o.title = `${KIND_TITLE[kind]} · ${minutes} min`;
    o.plan_key = `${wk}:${weekdayOf(o.day)}:plan`;
    o.category = 'workout'; prevKind = kind;
  });
  return { week: wk, cap, events: out, stale, restDays: weekDays.filter((d) => !taken.has(d) && !out.some((o) => o.day === d)).length };
}
const prevDay = (out, i) => (i > 0 ? out[i - 1].day : '1970-01-01');

/**
 * Confronta il piano esistente con quello nuovo, senza mai toccare eventi personali o modificati da Alessia.
 * Ritorna { toAdd, toRemove, needsConfirmation }: si aggiunge in automatico solo ciò che non toglie nulla.
 */
export function reconcilePlan(existingPlanEvents, newPlan, today) {
  const have = new Set(existingPlanEvents.map((e) => e.plan_key));
  const toAdd = newPlan.events.filter((e) => !have.has(e.plan_key));
  const staleKeys = new Set((newPlan.stale ?? []).map((e) => e.plan_key));
  const toRemove = existingPlanEvents.filter((e) => staleKeys.has(e.plan_key) && !e.completed && !e.user_modified && e.status !== 'declined' && e.day >= today);
  return { toAdd, toRemove, needsConfirmation: toRemove.length > 0 };
}

/** Sessioni del piano che sono passate senza essere svolte (servono a non farle sentire "in ritardo": si ripianifica con calma). */
export const missedPlanEvents = (events, today) => events.filter((e) => e.source === 'plan' && !e.completed && e.day < today);
