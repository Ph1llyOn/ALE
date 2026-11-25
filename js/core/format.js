// Formattazione e validazione di date/ore (fuso orario del dispositivo).
const LOCALE = 'it-IT';
const dateTime = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long' });
const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const timeOnly = new Intl.DateTimeFormat(LOCALE, { timeStyle: 'short' });

export const fmtDateTime = (iso) => dateTime.format(new Date(iso));
export const fmtDate = (iso) => dateOnly.format(new Date(iso));
export const fmtDayMonth = (iso) => dayMonth.format(new Date(iso));

/** "oggi alle 14:30", "ieri alle 09:10", altrimenti data e ora estese. */
export function fmtRelative(iso, now = new Date()) {
  const d = new Date(iso);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return `oggi alle ${timeOnly.format(d)}`;
  if (sameDay(d, yesterday)) return `ieri alle ${timeOnly.format(d)}`;
  return dateTime.format(d);
}

const pad = (n) => String(n).padStart(2, '0');

/** Data locale come "YYYY-MM-DD" (non UTC: il "giorno" è quello dell'utente). */
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Etichetta di un giorno "YYYY-MM-DD" → "26 nov". */
export function fmtDayLabel(day) {
  const [y, m, d] = day.split('-').map(Number);
  return dayMonth.format(new Date(y, m - 1, d));
}

/** Valore per <input type="datetime-local"> ("YYYY-MM-DDTHH:mm", ora locale). */
export function toLocalInputValue(date) {
  return `${localDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Da valore di datetime-local (ora locale) a ISO UTC. */
export function fromLocalInputValue(value) {
  return new Date(value).toISOString();
}

export const MIN_SCHEDULE_MINUTES = 2;
export const MAX_SCHEDULE_DAYS = 366;

/** Il primo istante valido per programmare un messaggio. */
export function minScheduleDate(now = new Date()) {
  const d = new Date(now.getTime() + MIN_SCHEDULE_MINUTES * 60_000);
  d.setSeconds(0, 0);
  return d;
}

/** Errore (in italiano) se il valore di datetime-local non è programmabile, altrimenti null. */
export function validateSchedule(value, now = new Date()) {
  if (!value) return 'Scegli quando inviare il biglietto.';
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return 'La data non è valida.';
  if (t < minScheduleDate(now).getTime()) return 'Scegli un momento almeno un paio di minuti da adesso.';
  if (t > now.getTime() + MAX_SCHEDULE_DAYS * 864e5) return 'Si può programmare al massimo un anno in anticipo.';
  return null;
}
