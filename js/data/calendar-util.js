// Logica pura del calendario (nessun DOM): categorie, griglia mensile, settimana, raggruppamento degli eventi per giorno.
export const CATEGORIES = [
  { key: 'workout', label: 'Allenamento' },
  { key: 'walk', label: 'Passeggiata' },
  { key: 'personal', label: 'Impegno personale' },
  { key: 'reminder', label: 'Promemoria' },
  { key: 'weekly_goal', label: 'Obiettivo settimanale' },
  { key: 'rest', label: 'Riposo e recupero' },
  { key: 'school_work', label: 'Scuola o lavoro' },
];
export const categoryLabel = (key) => CATEGORIES.find((c) => c.key === key)?.label ?? key;

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDayKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const sameDay = (a, b) => dayKey(a) === dayKey(b);

/** Lunedì della settimana che contiene `d` (le settimane italiane iniziano di lunedì). */
export function startOfWeek(d) {
  const delta = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - delta);
}

export const weekDays = (d) => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(d), i));

/** Settimane (array di 7 date) che coprono il mese; celle fuori mese incluse per riempire le righe. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = startOfWeek(first);
  const weeks = [];
  let cursor = start;
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    cursor = addDays(cursor, 7);
  } while (cursor.getMonth() === month || (weeks.length < 4));
  return weeks;
}

/** Estremi (ISO UTC) da interrogare per mostrare tutta la griglia del mese. */
export function monthRange(year, month) {
  const weeks = monthGrid(year, month);
  return { from: weeks[0][0].toISOString(), to: addDays(weeks.at(-1)[6], 1).toISOString() };
}

export function weekRange(d) {
  const days = weekDays(d);
  return { from: days[0].toISOString(), to: addDays(days[6], 1).toISOString() };
}

/** Raggruppa gli eventi per giorno locale di inizio, ordinati per orario. */
export function eventsByDay(events) {
  const map = new Map();
  for (const e of events) {
    const k = dayKey(new Date(e.starts_at));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  for (const list of map.values()) list.sort((a, b) => (a.all_day === b.all_day ? new Date(a.starts_at) - new Date(b.starts_at) : a.all_day ? -1 : 1));
  return map;
}

/** Da giorno ("YYYY-MM-DD") e ora ("HH:mm") locali a ISO UTC; senza ora = mezzogiorno (eventi di tutto il giorno). */
export function toIso(day, time) {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = (time || '12:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

export const timeOf = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function validateEvent({ title, day, time, endTime, allDay }) {
  if (!String(title ?? '').trim()) return 'Dai un nome all’evento.';
  if (!day) return 'Scegli il giorno.';
  if (!allDay && endTime && time && endTime < time) return 'L’ora di fine non può essere prima di quella di inizio.';
  return null;
}

export const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const WEEKDAYS_SHORT = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
export const WEEKDAYS_LONG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
