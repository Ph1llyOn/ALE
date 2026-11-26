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

// ------------------------------------------------------------------------------------------------ stato d'animo
// Stati ricavati SOLO da ciò che Alessia ha indicato (umore ed energia da 1 a 5). Se non l'ha fatto: 'neutro' (nessuna emozione inventata).
//   felice · tranquilla · cosi_cosi · giu · poca_energia · stanca_soddisfatta · neutro
export function moodState(mood, energy) {
  const m = Number(mood); const e = Number(energy);
  if (!Number.isInteger(m) || m < 1 || m > 5) return 'neutro';
  const lowEnergy = Number.isInteger(e) && e <= 2;
  if (m >= 4) return lowEnergy ? 'stanca_soddisfatta' : 'felice';
  if (m === 3) return lowEnergy ? 'poca_energia' : 'tranquilla';
  if (m === 2) return lowEnergy ? 'giu' : 'cosi_cosi';
  return 'giu';
}

/** Stati in cui NON si propongono allenamenti impegnativi né obiettivi: si accoglie, si ridimensiona, si lascia riposare. */
export const GENTLE_STATES = ['giu', 'poca_energia', 'stanca_soddisfatta'];

// Pensieri preparati a mano per ogni stato: usati quando l'AI è spenta o Gemini non risponde. Stesso tono delle regole dell'AI:
// accoglienza prima di tutto, mai "non mollare", mai pressione, il riposo non è un fallimento.
export const DAILY_BY_STATE = {
  felice: [
    { title: 'Che bello vederti così', text: 'Si sente che oggi stai bene, e fa piacere. Goditi questa giornata, a modo tuo.' },
    { title: 'Con leggerezza', text: 'Hai una bella energia oggi. Se ti va, usala per qualcosa che ti piace: nessun obbligo, solo piacere.' },
    { title: 'Brava, davvero', text: 'Quello che stai costruendo, un giorno alla volta, conta. Continua pure con il tuo ritmo.' },
    { title: 'Un sorriso in più', text: 'Quando ci si sente bene vale la pena notarlo. Tieniti stretta questa sensazione.' },
    { title: 'Il tuo passo', text: 'Stai andando bene e non serve correre. Un po’ di movimento che ti diverte, e il resto lo fa la tua serenità.' },
  ],
  tranquilla: [
    { title: 'Una giornata serena', text: 'Oggi è una giornata tranquilla, ed è già una bella cosa. Se ti va, scegli una piccola cosa da fare per te.' },
    { title: 'Piano piano', text: 'Nessuna fretta. Se ti viene voglia, bastano pochi minuti di movimento dolce; se no, va bene così.' },
    { title: 'Un piccolo invito', text: 'Che ne dici di una passeggiata, o di qualche stiramento morbido? Solo se ti fa piacere.' },
    { title: 'Leggerezza', text: 'Una giornata semplice si può riempire di cose piccole e gentili. Scegli quella che ti somiglia di più.' },
    { title: 'Bentornata a te', text: 'Oggi puoi prenderti il tempo che vuoi. Un passo piccolo basta, e a volte anche nessuno.' },
  ],
  cosi_cosi: [
    { title: 'Va bene così', text: 'Una giornata così così capita a tutti. Non serve cambiarla: puoi semplicemente attraversarla con calma.' },
    { title: 'Con dolcezza', text: 'Se oggi non è il massimo, nessun problema. Scegli una cosa piccola che ti faccia stare un po’ meglio, se ti va.' },
    { title: 'Piano, senza pesi', text: 'Non devi dimostrare niente. Un tè caldo, due respiri lenti, e il resto può aspettare.' },
    { title: 'Il tuo ritmo', text: 'Anche le giornate di mezzo hanno il loro valore. Ascoltati e fai solo quello che ti sembra giusto.' },
    { title: 'Ci sono', text: 'Se oggi ti senti un po’ così, ricordati che puoi andare piano. Qui non c’è nessuna gara.' },
  ],
  giu: [
    { title: 'Ci sono', text: 'Oggi può essere una giornata pesante, e va bene. Non devi dimostrare niente a nessuno: ci sono io, senza fretta.' },
    { title: 'Con dolcezza', text: 'Se oggi pesa un po’, concediti di andare piano. Basta anche solo respirare e bere qualcosa di caldo.' },
    { title: 'Nessuna fretta', text: 'Non tutte le giornate sono da vivere al massimo. Questa può essere una giornata di quiete, e non serve spiegarla a nessuno.' },
    { title: 'Una carezza', text: 'Quello che senti merita spazio. Oggi non c’è niente da sistemare: puoi semplicemente stare, come sei.' },
    { title: 'Va bene così', text: 'Anche i giorni grigi fanno parte del cammino. Sii gentile con te: oggi bastano le cose piccole, o anche nessuna.' },
  ],
  poca_energia: [
    { title: 'Oggi si va piano', text: 'Con poca energia il corpo chiede calma. Oggi puoi ridurre tutto al minimo: riposare è già prendersi cura di sé.' },
    { title: 'Un passo minuscolo', text: 'Se ti va, basta un piccolo gesto gentile: stiracchiarti, aprire la finestra, bere un bicchiere d’acqua. Se no, riposa.' },
    { title: 'Ricarica', text: 'Le batterie a volte hanno bisogno di fermarsi. Oggi il riposo è la cosa giusta, non una rinuncia.' },
    { title: 'Senza aspettative', text: 'Oggi non serve fare niente di speciale. Quello che riesci a fare è abbastanza, e anche il resto.' },
    { title: 'Con calma', text: 'Una giornata leggera, con poche cose e molta dolcezza. Domani si vedrà.' },
  ],
  stanca_soddisfatta: [
    { title: 'Hai fatto tanto', text: 'Sei stanca, ma si sente che sei contenta di quello che hai fatto. È un bel modo di essere stanca.' },
    { title: 'Ora tocca a te', text: 'Hai dato il tuo, adesso concediti di recuperare. Non serve aggiungere altro: va benissimo così.' },
    { title: 'Un meritato respiro', text: 'Riconosci quello che hai fatto e prenditi un momento solo per te. Il riposo fa parte di tutto.' },
    { title: 'Con soddisfazione', text: 'Una bella stanchezza, di quelle che raccontano qualcosa di buono. Rilassati, il resto può aspettare.' },
    { title: 'Recupera con calma', text: 'Hai fatto abbastanza per oggi. Una doccia calda, qualcosa di buono e un po’ di quiete.' },
  ],
};

const dayNumber = (date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);

/** Stesso pensiero per tutta la giornata, diverso da un giorno all'altro; con lo stato d'animo (se noto) si sceglie tra quelli adatti a quello stato. */
export function dailyFallback(date = new Date(), state = 'neutro') {
  const list = DAILY_BY_STATE[state] ?? DAILY_FALLBACK;
  return list[dayNumber(date) % list.length];
}

// Stile del messaggio del giorno: si alterna tra frase breve, riflessione, incoraggiamento e carezza, così non sembra sempre la stessa cosa.
// Negli stati delicati non c'è mai "incoraggiamento".
export const STYLES = {
  breve: 'una sola frase breve e leggera',
  riflessione: 'una piccola riflessione gentile, di due frasi',
  incoraggiamento: 'un incoraggiamento semplice e sincero, senza esagerare',
  carezza: 'una carezza: accoglienza e vicinanza, senza proporre nulla da fare',
};
export function styleFor(state, date = new Date()) {
  const keys = GENTLE_STATES.includes(state) || state === 'cosi_cosi' ? ['carezza', 'breve', 'riflessione', 'carezza'] : ['breve', 'riflessione', 'incoraggiamento', 'carezza'];
  return keys[dayNumber(date) % keys.length];
}
