// Pensieri del mattino preparati a mano: tono dolce, mai colpevolizzante, nessun riferimento a peso, corpo o prestazioni.
// Usati quando l'AI è spenta o non disponibile. COPIATO in supabase/functions/_shared/motivation.js da `npm run sync-shared`.
export const DAILY_FALLBACK = [
  { title: 'Un passo piccolo basta', text: 'Oggi non serve fare tutto. Scegli una cosa bella per te e falla con calma: basta quella.' },
  { title: 'Con i tuoi tempi', text: 'Non c’è nessuna gara. Vai piano, al ritmo che ti fa stare bene.' },
  { title: 'Respira', text: 'Prima di cominciare, fai un bel respiro lento. Il resto della giornata può aspettare.' },
  { title: 'Già abbastanza', text: 'Quello che riesci a fare oggi va bene così. Anche riposarti è un modo di volerti bene.' },
  { title: 'Una cosa bella', text: 'Cerca una piccola cosa che ti faccia stare bene: una canzone, un tè caldo, due passi fuori.' },
  { title: 'Gentile con te', text: 'Parlati come parleresti a un’amica a cui vuoi bene.' },
  { title: 'Muoversi per piacere', text: 'Se ti va, muoviti qualche minuto in un modo che ti piace. Se oggi no, c’è sempre domani.' },
  { title: 'Senza fretta', text: 'Le cose importanti crescono piano. Oggi basta un piccolo gesto per te.' },
  { title: 'Il tuo ritmo', text: 'Chiediti come stai davvero e scegli cosa ti serve. Non ci sono risposte sbagliate.' },
  { title: 'Un momento per te', text: 'Prenditi dieci minuti solo tuoi, senza doverti giustificare con nessuno.' },
  { title: 'Piccole attenzioni', text: 'Un bicchiere d’acqua, una finestra aperta, due stiramenti dolci: volersi bene parte da cose semplici.' },
  { title: 'Un nuovo giorno', text: 'Qualunque cosa sia successa ieri, oggi puoi ricominciare con leggerezza.' },
];

/** Stesso pensiero per tutta la giornata, diverso da un giorno all'altro. */
export function dailyFallback(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return DAILY_FALLBACK[day % DAILY_FALLBACK.length];
}
