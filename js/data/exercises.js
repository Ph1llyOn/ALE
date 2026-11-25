// Catalogo degli esercizi con illustrazione, attrezzatura richiesta e valori di partenza.
// Nota: sono movimenti generici e delicati, NON prescrizioni. Chi segue Alessia ha sempre la precedenza.
import { resolve } from '../config.js';

/** equipment: elenco di chiavi richieste ('mat' | 'dumbbells' | 'band' | 'step'); vuoto = corpo libero. */
export const EXERCISES = [
  { id: 'squat', name: 'Squat a corpo libero', equipment: [], sets: 3, reps: '12', rest: 60, tip: 'Scendi con calma, come se ti sedessi. Fermati se senti fastidio.' },
  { id: 'lunge', name: 'Affondo indietro', equipment: [], sets: 2, reps: '10 per lato', rest: 60, tip: 'Un passo indietro, senza fretta. Tieniti a un appoggio se serve.' },
  { id: 'calf-raise', name: 'Salita sulle punte', equipment: [], sets: 3, reps: '15', rest: 45, tip: 'Sali piano e scendi piano.' },
  { id: 'wall-sit', name: 'Seduta al muro', equipment: [], sets: 3, reps: '20 secondi', rest: 45, tip: 'Schiena appoggiata al muro, respira con regolarità.' },
  { id: 'march', name: 'Marcia sul posto', equipment: [], sets: 3, reps: '1 minuto', rest: 30, tip: 'Un riscaldamento semplice: ginocchia alte quanto ti va.' },
  { id: 'arm-circles', name: 'Cerchi con le braccia', equipment: [], sets: 2, reps: '15', rest: 30, tip: 'Cerchi ampi e morbidi, avanti e indietro.' },
  { id: 'glute-bridge', name: 'Ponte per i glutei', equipment: ['mat'], sets: 3, reps: '12', rest: 45, tip: 'Spingi con i piedi e solleva il bacino senza inarcare la schiena.' },
  { id: 'plank', name: 'Plank sugli avambracci', equipment: ['mat'], sets: 3, reps: '20 secondi', rest: 45, tip: 'Corpo allineato. Se è troppo, appoggia le ginocchia.' },
  { id: 'bird-dog', name: 'Bird dog', equipment: ['mat'], sets: 2, reps: '8 per lato', rest: 45, tip: 'Braccio e gamba opposti, movimenti lenti e controllati.' },
  { id: 'superman', name: 'Superman', equipment: ['mat'], sets: 2, reps: '10', rest: 45, tip: 'Solleva poco, basta un piccolo movimento.' },
  { id: 'push-up-knees', name: 'Flessioni sulle ginocchia', equipment: ['mat'], sets: 3, reps: '8', rest: 60, tip: 'Scendi fin dove ti senti comoda.' },
  { id: 'side-leg-raise', name: 'Sollevamento laterale della gamba', equipment: ['mat'], sets: 2, reps: '12 per lato', rest: 45, tip: 'Il bacino resta fermo: muove solo la gamba.' },
  { id: 'dumbbell-curl', name: 'Curl con manubri', equipment: ['dumbbells'], sets: 3, reps: '10', rest: 60, tip: 'Gomiti vicini al corpo, peso leggero.' },
  { id: 'dumbbell-press', name: 'Spinte sopra la testa con manubri', equipment: ['dumbbells'], sets: 3, reps: '10', rest: 60, tip: 'Peso leggero, spalle rilassate.' },
  { id: 'goblet-squat', name: 'Squat con manubrio', equipment: ['dumbbells'], sets: 3, reps: '10', rest: 60, tip: 'Il manubrio vicino al petto, schiena dritta.' },
  { id: 'step-up', name: 'Salita sullo step', equipment: ['step'], sets: 3, reps: '10 per lato', rest: 60, tip: 'Appoggia tutto il piede sullo step prima di spingere.' },
  { id: 'band-pull-apart', name: 'Apertura con elastico', equipment: ['band'], sets: 3, reps: '12', rest: 45, tip: 'Apri le braccia piano, spalle lontane dalle orecchie.' },
];

export const EQUIPMENT_LABELS = { mat: 'Tappetino', dumbbells: 'Manubri', band: 'Elastico', step: 'Step' };

export const exerciseById = (id) => EXERCISES.find((e) => e.id === id) ?? null;
export const exerciseImage = (id) => (exerciseById(id) ? resolve(`assets/exercises/${id}.svg`) : null);

const KEYWORDS = {
  mat: /tappetin|materass|\bmat\b|yoga/i,
  dumbbells: /manubri|pesi|dumbbell|kettlebell|bilanciere/i,
  band: /elastic|\bband\b|fascia/i,
  step: /\bstep\b|gradino|rialzo|panca/i,
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
  return catalog.filter((e) => e.equipment.length === 0 || (!prefersNoEquipment && e.equipment.every((k) => have.has(k))));
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
