// Pensieri del mattino preparati a mano: tono dolce, mai colpevolizzante, nessun riferimento a peso, corpo o prestazioni.
// Usati quando l'AI è spenta o non disponibile. COPIATO in supabase/functions/_shared/motivation.js da `npm run sync-shared`.
export const DAILY_FALLBACK = [
  { title: 'Un passo piccolo basta', text: 'Oggi non serve fare tutto. Scegli una cosa gentile per te e falla con calma: basta quella.' },
  { title: 'Con i tuoi tempi', text: 'Non c’è una corsa da vincere. Vai al ritmo che ti fa stare bene, oggi.' },
  { title: 'Respira', text: 'Prima di iniziare, un respiro lento. Il resto della giornata può arrivare dopo.' },
  { title: 'Già abbastanza', text: 'Quello che riesci a fare oggi va bene così. Anche riposare è fare qualcosa per te.' },
  { title: 'Una cosa bella', text: 'Cerca oggi una cosa piccola che ti faccia stare bene: una canzone, un tè, una passeggiata corta.' },
  { title: 'Gentile con te', text: 'Parla a te stessa come parleresti a una persona a cui vuoi bene.' },
  { title: 'Muoversi per piacere', text: 'Se ti va, qualche minuto di movimento che ti piace. Se oggi no, domani sarà un altro giorno.' },
  { title: 'Senza fretta', text: 'Le cose importanti si costruiscono piano. Oggi basta un piccolo gesto di cura.' },
  { title: 'Il tuo ritmo', text: 'Ascolta come stai davvero e scegli di conseguenza. Nessuna risposta è sbagliata.' },
  { title: 'Un momento per te', text: 'Ritagliati dieci minuti solo tuoi, senza doverli giustificare.' },
  { title: 'Cura', text: 'Un bicchiere d’acqua, una finestra aperta, qualche stiramento dolce: la cura è fatta di cose semplici.' },
  { title: 'Oggi è nuovo', text: 'Qualunque cosa sia successa ieri, oggi puoi ricominciare con leggerezza.' },
];

/** Stesso pensiero per tutta la giornata, diverso da un giorno all'altro. */
export function dailyFallback(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return DAILY_FALLBACK[day % DAILY_FALLBACK.length];
}
