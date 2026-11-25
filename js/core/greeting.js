// Saluto in base all'orario. Il testo varia da un giorno all'altro (stessa frase per tutta la giornata).
export const GREETING_MESSAGES = {
  morning: [
    'Buongiorno! Un piccolo passo alla volta.',
    'Buongiorno! Oggi puoi andare con i tuoi tempi.',
    'Buongiorno! Qualunque cosa farai oggi, sarà abbastanza.',
  ],
  afternoon: [
    'Buon pomeriggio! Una piccola pausa fa sempre bene.',
    'Buon pomeriggio! Vai con calma.',
    'Buon pomeriggio! Concediti un momento per te.',
  ],
  evening: [
    'Buonasera! Respira, la giornata può rallentare.',
    'Buonasera! Hai fatto abbastanza per oggi.',
    'Buonasera! È il momento di rilassarsi.',
  ],
};

export function partOfDay(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 13) return 'morning';
  if (h >= 13 && h < 19) return 'afternoon';
  return 'evening';
}

export function greeting(date = new Date()) {
  const part = partOfDay(date);
  const list = GREETING_MESSAGES[part];
  const dayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return { part, text: list[dayNumber % list.length] };
}
