// Scale di umore ed energia (1-5). Parole gentili, nessun giudizio: non esistono risposte "giuste".
export const MOODS = [
  { value: 1, label: 'Pesante' },
  { value: 2, label: 'Così così' },
  { value: 3, label: 'Tranquilla' },
  { value: 4, label: 'Bene' },
  { value: 5, label: 'Splendida' },
];

export const ENERGIES = [
  { value: 1, label: 'Molto poca' },
  { value: 2, label: 'Poca' },
  { value: 3, label: 'Nella media' },
  { value: 4, label: 'Buona' },
  { value: 5, label: 'Tanta' },
];

const find = (list, v) => list.find((x) => x.value === Number(v))?.label ?? '';
export const moodLabel = (v) => find(MOODS, v);
export const energyLabel = (v) => find(ENERGIES, v);
export const isScale = (v) => Number.isInteger(v) && v >= 1 && v <= 5;
