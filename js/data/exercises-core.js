// Catalogo degli esercizi (PURO, senza dipendenze): usato dal frontend e, copiato, dalle Edge Functions (npm run sync-shared).
// Nota: sono movimenti generici e delicati, NON prescrizioni. Chi segue Alessia ha sempre la precedenza.
import { EXERCISES as CATALOG } from './exercise-catalog.js';

const minutesLabel = (sec) => (sec >= 120 ? `${Math.round(sec / 60)} minuti` : sec === 60 ? '1 minuto' : `${sec} secondi`);

/** Catalogo con i campi di visualizzazione derivati: reps ("12", "10 per lato", "20 secondi") e rest. */
export const EXERCISES = CATALOG.map((x) => ({
  ...x,
  reps: x.mode === 'time' ? `${minutesLabel(x.seconds)}${x.perSide ? ' per lato' : ''}` : `${x.n}${x.perSide ? ' per lato' : ''}`,
}));
export const PHASES = ['warmup', 'main', 'cardio', 'cooldown'];

/** Nome mostrato per ogni "tipo" di attrezzo richiesto dagli esercizi. */
export const EQUIPMENT_LABELS = {
  mat: 'Tappetino', dumbbells: 'Manubri', band: 'Elastico', step: 'Pedana fitness (step)', kettlebell: 'Kettlebell', ball: 'Palla da ginnastica',
  medball: 'Palla medica', rope: 'Corda per saltare', ankle: 'Cavigliere con pesi', treadmill: 'Tapis roulant', bike: 'Cyclette', elliptical: 'Ellittica', stepper: 'Mini stepper',
};

/**
 * Attrezzi che si possono scegliere, per categoria. Il nome è quello che viene salvato nell'inventario di Alessia (tabella equipment):
 * così resta leggibile, modificabile ed eliminabile come qualsiasi altra voce.
 */
export const EQUIPMENT_CATALOG = [
  { key: 'floor', title: 'Per stare a terra', items: ['Tappetino fitness', 'Foam roller (rullo per massaggio)', 'Mattoncini e cinghia per yoga', 'Sedia robusta'] },
  { key: 'weights', title: 'Pesi', items: ['Manubri', 'Pesi regolabili', 'Kettlebell', 'Cavigliere con pesi', 'Polsiere con pesi', 'Palla medica', 'Bilanciere e dischi'] },
  { key: 'bands', title: 'Elastici', items: ['Elastici fitness', 'Bande elastiche circolari', 'Fasce elastiche con maniglie'] },
  { key: 'balance', title: 'Equilibrio e coordinazione', items: ['Pedana fitness (step)', 'Palla da ginnastica', 'Corda per saltare', 'Pedana per l’equilibrio', 'Dischi scorrevoli (slider)', 'Pedana vibrante'] },
  { key: 'core', title: 'Addominali, schiena e trazioni', items: ['Ruota per addominali', 'Barra per trazioni', 'Panca da allenamento', 'TRX (cinghie da sospensione)', 'Maniglie per flessioni'] },
  { key: 'cardio', title: 'Per il cardio', items: ['Cyclette', 'Mini cyclette (pedaliera)', 'Tapis roulant', 'Ellittica', 'Mini stepper', 'Vogatore'] },
];
export const ALL_EQUIPMENT_NAMES = EQUIPMENT_CATALOG.flatMap((c) => c.items);

export const exerciseById = (id) => EXERCISES.find((e) => e.id === id) ?? null;

// Dal testo di una voce dell'inventario ai tipi di attrezzo (vale anche per le voci scritte a mano).
const KEYWORDS = {
  mat: /tappetin|materass|\bmat\b/i,
  dumbbells: /manubri|dumbbell|pesi regolabili|^\s*pesi\s*$/i,
  kettlebell: /kettlebell|kettle bell/i,
  band: /elastic|\bband[ae]\b|\bfascia\b|\bfasce\b/i,
  step: /\bstep\b|gradino|rialzo|panca/i,
  ball: /palla da ginnastica|fitball|swiss ball/i,
  medball: /palla medica|medicine ball/i,
  rope: /corda per saltare|corda da salto|jump rope/i,
  ankle: /cavigliere/i,
  treadmill: /tapis|treadmill/i,
  elliptical: /ellittic|elliptical|cross trainer/i,
  stepper: /mini stepper|stepper/i,
  bike: /cyclette|bici da camera|pedaliera|exercise bike/i,
};

/** Dalle voci dell'inventario ({ name, avoid }) alle chiavi di attrezzatura disponibili (esclude ciò che non vuole usare). */
export function equipmentKeysFrom(items) {
  const keys = new Set();
  for (const it of items ?? []) {
    if (it.avoid) continue;
    for (const [key, re] of Object.entries(KEYWORDS)) if (re.test(it.name ?? '')) keys.add(key);
  }
  return keys;
}

/** Esercizi compatibili con ciò che c'è in casa; con "preferisco senza attrezzi" restano solo quelli a corpo libero. */
export function compatibleExercises(items, { prefersNoEquipment = false, catalog = EXERCISES } = {}) {
  const have = equipmentKeysFrom(items);
  // Con "preferisco allenarmi senza attrezzi" il tappetino non conta come attrezzo: è solo una superficie comoda.
  return catalog.filter((e) => e.equipment.length === 0
    || (prefersNoEquipment ? e.equipment.every((k) => k === 'mat' && have.has('mat')) : e.equipment.every((k) => have.has(k))));
}

/**
 * Propone una scheda ragionevole dagli esercizi compatibili: mix di gruppi, massimo n esercizi.
 * Deterministica (niente AI): serve come base e come ripiego.
 */
export function suggestWorkout(items, { prefersNoEquipment = false, count = 5, seed = 0 } = {}) {
  const pool = compatibleExercises(items, { prefersNoEquipment });
  if (!pool.length) return [];
  const start = Math.abs(seed) % pool.length;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  const warm = rotated.find((e) => e.id === 'march' || e.id === 'arm-circles');
  const picked = [];
  if (warm) picked.push(warm);
  for (const e of rotated) {
    if (picked.length >= count) break;
    if (!picked.includes(e)) picked.push(e);
  }
  return picked.map((e) => ({ exercise_key: e.id, name: e.name, sets: e.sets, reps: e.reps, rest_seconds: e.rest, notes: e.tip }));
}

export const DEFAULT_HABITS = [
  { key: 'water', name: 'Bere acqua durante il giorno' },
  { key: 'walk', name: 'Fare una passeggiata' },
  { key: 'stretch', name: 'Qualche minuto di stretching' },
  { key: 'breathe', name: 'Un momento di respiro profondo' },
  { key: 'sleep', name: 'Andare a letto con calma' },
  { key: 'read', name: 'Leggere qualche pagina' },
];
