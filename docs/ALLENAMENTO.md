# Allenamento intelligente

Come ALE. sceglie, ordina, pianifica e accompagna gli allenamenti di Alessia. Tutte le regole di sicurezza sono **deterministiche** (codice, non prompt):
l'AI, quando c'è, sceglie solo dentro questi limiti e il server ricontrolla tutto.

## Dove sta cosa (una sola fonte)
| Cosa | File | Dove gira |
|---|---|---|
| Catalogo strutturato (51 esercizi) | `js/data/exercise-catalog.js` + `exercises-core.js` | frontend e, copiato, Edge Functions (`npm run sync-shared`) |
| Motore (scelta, struttura, adattamento, piano settimanale) | `js/data/planner-core.js` | frontend e Edge Functions (copia) |
| Testi lunghi (istruzioni, errori comuni, sicurezza) | `js/data/exercise-texts.js` | solo frontend |
| Macchina a stati della sessione | `js/features/activities/session-core.js` | frontend |
| Disegni animati | `assets/exercises/<id>.svg` (generati da `tools/make-exercise-art.mjs`) | frontend |

Dopo aver cambiato catalogo o motore: `npm run sync-shared`. **In locale riavvia lo stack** (`npm run db:stop` / `db:start`): il runtime delle funzioni non ricarica i moduli condivisi.

## Come sceglie gli esercizi
1. **Candidati ammessi** (`eligibleExercises`): solo attrezzi che Alessia ha (se "Preferisco allenarmi senza attrezzi" resta solo il corpo libero: il tappetino conta come superficie, non come attrezzo); mai esercizi con le attenzioni che ha segnato (limitazioni del professionista); mai un esercizio con fastidio/dolore segnalato negli ultimi 14 giorni; livello adeguato — gli esercizi più impegnativi si sbloccano solo se i requisiti sono stati fatti bene almeno due volte (nessun feedback "difficile" recente).
2. **Punteggio con motivo**: ogni esercizio ha un perché mostrato ad Alessia (es. "Lavora gambe e glutei", "da un po' non la allenavi", "Usa un attrezzo che hai"). Conta: parte del corpo non allenata di recente, esercizi usati ieri o pochi giorni fa (penalità, e ieri esclusi), attrezzo posseduto (bonus, ma non obbligatorio), preferenza per gli addominali, movimenti di base con progressione, e un po' di casualità **riproducibile** (stesso giorno → stessa proposta; «Un'altra idea» cambia il seme).
3. **Una variante per catena** (piegamenti al muro → inclinati → sulle ginocchia → classici; squat alla sedia → squat → con manubrio/kettlebell; plank sulle ginocchia → plank; ponte → ponte a una gamba; dead bug → reverse crunch → crunch con gambe sollevate): si parte da quella adatta al livello, mai due livelli dello stesso movimento nella stessa sessione.
4. **Struttura** (15.1 della specifica): riscaldamento → parte principale → (cardio, solo a volte) → defaticamento. Parte principale ordinata dalla posizione in piedi a quelle a terra (meno cambi); addominali impegnativi verso la fine; massimo 2 esercizi di core; gambe/glutei/spinta/tirata coperti.
5. **Attrezzi con una funzione**: il tapis roulant (o cyclette/ellittica/stepper, a rotazione) fa il riscaldamento *oppure* la parte cardio, mai entrambi, e non in ogni sessione. Velocità e inclinazione sono quelle scelte da Alessia (default 3,5 km/h, 0%): mai alte in automatico.
6. **Tempo**: la durata stimata (serie, ripetizioni, recuperi, preparazione) deve stare nei minuti scelti; si tolgono serie o esercizi, non si accorcia il recupero.
7. **Verifica finale** (`validateSession`): esercizi noti, attrezzi presenti, limitazioni, dolore, livello, ordine delle fasi, riscaldamento e defaticamento, varietà, abbinamenti di core, cambi di posizione, durata. Se la sequenza non è coerente si rigenera (fino a 6 tentativi).

## Feedback e progressione (privati)
Sei risposte: troppo facile · giusto · abbastanza difficile · troppo difficile · ho provato fastidio o dolore · non sono riuscita a completarlo, più una nota facoltativa. Tabella `exercise_feedback`, **mai** leggibile da Phill (nessuna categoria di condivisione la include; testato).
- Una sola indicazione "facile" non cambia nulla. **Due di fila** (entro 60 giorni) → variante appena più impegnativa se disponibile e consentita, altrimenti qualche ripetizione in più (+20% al massimo).
- Due "difficile" su tre → variante più semplice; un solo "troppo difficile" o "non sono riuscita" → meno serie e ripetizioni la volta dopo.
- **Dolore/fastidio**: l'esercizio non viene riproposto per 14 giorni, mai aumentato; il messaggio suggerisce di fermarsi e di parlarne con il professionista.

## Sessione guidata
Una schermata per volta, sempre persistita su Supabase (`workout_sessions.run_state`, `session_exercise_progress`).
- **Nulla parte da solo**: il primo esercizio e ogni esercizio successivo aspettano «Inizia esercizio», senza limite di tempo. La schermata di preparazione (sfondo e bordo diversi) mostra nome, disegno animato, attrezzi, come prepararsi, serie/ripetizioni/recupero.
- **Ripetizioni**: «Serie completata» con **un solo tocco**; non esiste alcun contatore di ripetizioni.
- **A tempo**: conto alla rovescia; alla fine suona/vibra ma la serie **non** è completata finché non la conferma (o la salta).
- **Recupero**: parte da solo dopo una serie; pausa e «Salta il recupero»; a fine recupero si aspetta («Inizia serie» per le serie a tempo).
- Controlli: pausa/riprendi, salta serie, salta esercizio, interrompi (conferma a due tocchi). Serie/esercizi saltati restano saltati.
- **Tempo**: calcolato dai timestamp (`session-core.js`), non da `setInterval`. Dopo ricarica, blocco del telefono o app sospesa si riprende dal punto giusto: un timer scaduto mentre l'app era chiusa diventa "in attesa di conferma", un recupero scaduto "in attesa"; mai si avvia qualcosa di nuovo. Una copia di sicurezza dello stato in `localStorage` evita perdite se manca la rete (la fonte resta Supabase; si risincronizza al ritorno online).
- Wake Lock (schermo acceso) dove il browser lo consente.

## Piano settimanale
`planWeek` costruisce la settimana (lun–dom) e `reconcilePlan` la confronta con il calendario.
- Nessuna attività nel passato, una sola al giorno, almeno due giorni di riposo, mai forza in due giorni consecutivi, tipologie alternate (forza · cardio dolce · mobilità).
- **Frequenza sostenibile**: al massimo la media delle ultime 4 settimane + 1 (minimo 2) e mai più del numero scelto: chi riparte non viene caricata.
- **Appuntamenti personali sempre prima**: la sessione sceglie un orario libero (con 30 minuti di margine); se non c'è, quel giorno resta libero. Gli eventi di Alessia non vengono mai spostati o modificati.
- **Nessun duplicato**: ogni sessione del piano ha una chiave unica (`2026-W49:3:plan`, vincolo nel database).
- **Conferma**: le sessioni nuove si aggiungono da sole (se "Metti le sessioni nel mio calendario" è attivo); se la disponibilità cambia o un impegno si sovrappone, ALE. **chiede conferma** prima di togliere qualcosa. Sessioni svolte, messe da parte o modificate da Alessia non si toccano mai.
- **Saltate**: non si recuperano tutte insieme; il piano riparte con calma dai giorni che restano, sempre entro il tetto settimanale. Una sessione "messa da parte" non viene riproposta.
- Dal calendario la sessione si può modificare ed eliminare come ogni evento. Il piano è generato **all'apertura dell'app/della sezione Attività** (non c'è un server che lo calcola di notte).

## Obiettivo e limiti (assunzioni documentate)
L'obiettivo comprende forma fisica e dimagrimento, ma ALE. **non** imposta pesi o calorie, non prescrive diete, non promette dimagrimento localizzato, non giudica il corpo, non incoraggia a insistere con il dolore. Per il dimagrimento privilegia continuità, cardio sostenibile, forza, recupero e abitudini mantenibili. Le indicazioni del professionista (testo libero + attenzioni strutturate) hanno sempre la precedenza; il testo libero non viene interpretato dalle regole, solo mostrato.

## Preferenze di Alessia (modificabili da Profilo → Attrezzatura e spazio)
Livello, minuti, volte a settimana, giorni disponibili, cose da evitare, «mi piacciono gli addominali» e «mi piace il tapis roulant» (default sì, modificabili), velocità e inclinazione del tapis roulant, piano nel calendario sì/no. Sono preferenze, non obblighi: ogni tanto compare altro, per un programma equilibrato.
