// Catalogo STRUTTURATO degli esercizi (PURO, senza dipendenze): usato dal frontend e, copiato, dalle Edge Functions (npm run sync-shared).
// È l'unica fonte dei dati che guidano la scelta degli esercizi. I testi lunghi (istruzioni, errori comuni…) stanno in exercise-texts.js (solo frontend).
// Sono movimenti generici e delicati, NON prescrizioni: le indicazioni del professionista che segue Alessia hanno sempre la precedenza.
//
// Campi:
//  id, name           identificativo stabile e nome italiano
//  phases             fasi della sessione in cui ha senso: warmup | main | cardio | cooldown
//  pattern            squat | hinge | lunge | push | pull | core | cardio | mobility | stretch | calf | breath
//  position           standing | supine | prone | quadruped | kneeling | side | seated | machine (serve a ridurre i cambi di posizione)
//  muscles            quads glutes hamstrings calves chest back shoulders arms core obliques hips full
//  equipment          tipi di attrezzo richiesti (vuoto = corpo libero); i nomi leggibili sono in EQUIPMENT_LABELS
//  level              1 base · 2 intermedio · 3 avanzato
//  flags              attenzioni di sicurezza: lumbar knees wrists shoulders neck impact floor balance
//  prereq             esercizi da aver già fatto con successo prima di proporlo a chi ha un livello inferiore
//  mode               reps (si fa e si conferma la serie con un tocco) | time (c'è il timer)
//  sets, n, perSide   serie, ripetizioni per serie (mode reps), se si fa per lato
//  seconds            durata di una serie (mode time)
//  rest               recupero tra le serie, in secondi
//  easier, harder     variante più semplice / più impegnativa
//  anim               movement (si muove) | hold (tenuta: l'omino respira appena)
//  tip                consiglio breve mostrato anche nelle schede salvate

const e = (id, name, o) => ({ id, name, phases: ['main'], equipment: [], flags: [], prereq: [], level: 1, mode: 'reps', sets: 2, n: 10, perSide: false, rest: 45, easier: null, harder: null, anim: 'movement', ...o });

export const EXERCISES = [
  // ------------------------------------------------------------------ riscaldamento e mobilità
  e('march', 'Marcia sul posto', { phases: ['warmup', 'cardio'], pattern: 'cardio', position: 'standing', muscles: ['full'], mode: 'time', sets: 2, seconds: 45, rest: 20, tip: 'Un riscaldamento semplice: ginocchia alte quanto ti va.' }),
  e('arm-circles', 'Cerchi con le braccia', { phases: ['warmup'], pattern: 'mobility', position: 'standing', muscles: ['shoulders'], sets: 2, n: 12, rest: 20, tip: 'Cerchi ampi e morbidi, avanti e indietro.' }),
  e('hip-circles', 'Cerchi con il bacino', { phases: ['warmup'], pattern: 'mobility', position: 'standing', muscles: ['hips', 'core'], sets: 2, n: 8, perSide: true, rest: 20, tip: 'Mani sui fianchi, cerchi lenti e morbidi.' }),
  e('shoulder-rolls', 'Rotazioni delle spalle', { phases: ['warmup', 'cooldown'], pattern: 'mobility', position: 'standing', muscles: ['shoulders'], sets: 2, n: 10, rest: 15, tip: 'Spalle su, indietro e giù, come per rilassarle.' }),
  e('cat-cow', 'Gatto e mucca', { phases: ['warmup', 'cooldown'], pattern: 'mobility', position: 'quadruped', muscles: ['core', 'back'], equipment: ['mat'], flags: ['wrists', 'knees'], sets: 2, n: 8, rest: 20, tip: 'Respira piano: inarca la schiena quando espiri, abbassala quando inspiri.' }),

  // ------------------------------------------------------------------ gambe e glutei
  e('chair-squat', 'Squat alla sedia', { pattern: 'squat', position: 'standing', muscles: ['quads', 'glutes'], flags: ['knees'], sets: 2, n: 8, rest: 45, harder: 'squat', tip: 'Siediti piano sulla sedia e rialzati senza spingere con le mani.' }),
  e('squat', 'Squat a corpo libero', { pattern: 'squat', position: 'standing', muscles: ['quads', 'glutes'], flags: ['knees'], sets: 3, n: 12, rest: 60, easier: 'chair-squat', harder: 'goblet-squat', tip: 'Scendi con calma, come se ti sedessi. Fermati se senti fastidio.' }),
  e('goblet-squat', 'Squat con manubrio', { pattern: 'squat', position: 'standing', muscles: ['quads', 'glutes', 'core'], equipment: ['dumbbells'], level: 2, flags: ['knees'], prereq: ['squat'], sets: 3, n: 10, rest: 60, easier: 'squat', tip: 'Il manubrio vicino al petto, schiena dritta.' }),
  e('kettlebell-squat', 'Squat con kettlebell', { pattern: 'squat', position: 'standing', muscles: ['quads', 'glutes', 'core'], equipment: ['kettlebell'], level: 2, flags: ['knees'], prereq: ['squat'], sets: 3, n: 10, rest: 60, easier: 'squat', tip: 'Tieni la kettlebell vicino al petto, schiena dritta. Scegli un peso leggero.' }),
  e('ball-wall-squat', 'Squat con la palla al muro', { pattern: 'squat', position: 'standing', muscles: ['quads', 'glutes'], equipment: ['ball'], flags: ['knees'], sets: 3, n: 10, rest: 60, tip: 'La palla tra te e il muro ti sostiene: scendi piano, risali piano.' }),
  e('wall-sit', 'Seduta al muro', { pattern: 'squat', position: 'standing', muscles: ['quads', 'glutes'], flags: ['knees'], mode: 'time', sets: 3, seconds: 20, rest: 45, anim: 'hold', tip: 'Schiena appoggiata al muro, respira con regolarità.' }),
  e('lunge', 'Affondo indietro', { pattern: 'lunge', position: 'standing', muscles: ['quads', 'glutes', 'hamstrings'], level: 2, flags: ['knees', 'balance'], prereq: ['squat'], sets: 2, n: 10, perSide: true, rest: 60, easier: 'squat', tip: 'Un passo indietro, senza fretta. Tieniti a un appoggio se serve.' }),
  e('step-up', 'Salita sullo step', { pattern: 'lunge', position: 'standing', muscles: ['quads', 'glutes'], equipment: ['step'], level: 2, flags: ['knees', 'balance'], prereq: ['squat'], sets: 3, n: 10, perSide: true, rest: 60, tip: 'Appoggia tutto il piede sullo step prima di spingere.' }),
  e('calf-raise', 'Salita sulle punte', { pattern: 'calf', position: 'standing', muscles: ['calves'], flags: ['balance'], sets: 3, n: 15, rest: 45, tip: 'Sali piano e scendi piano.' }),
  e('glute-bridge', 'Ponte per i glutei', { pattern: 'hinge', position: 'supine', muscles: ['glutes', 'hamstrings', 'core'], equipment: ['mat'], sets: 3, n: 12, rest: 45, harder: 'single-leg-bridge', tip: 'Spingi con i piedi e solleva il bacino senza inarcare la schiena.' }),
  e('single-leg-bridge', 'Ponte con una gamba sola', { pattern: 'hinge', position: 'supine', muscles: ['glutes', 'hamstrings', 'core'], equipment: ['mat'], level: 2, flags: ['lumbar'], prereq: ['glute-bridge'], sets: 2, n: 8, perSide: true, rest: 60, easier: 'glute-bridge', tip: 'Bacino fermo e dritto: se si inclina, torna al ponte normale.' }),
  e('ball-bridge', 'Ponte con i piedi sulla palla', { pattern: 'hinge', position: 'supine', muscles: ['glutes', 'hamstrings', 'core'], equipment: ['ball', 'mat'], level: 2, flags: ['balance'], prereq: ['glute-bridge'], sets: 2, n: 8, rest: 60, easier: 'glute-bridge', tip: 'Muoviti con calma: la palla è instabile. Se è troppo, tieni i piedi a terra.' }),
  e('side-leg-raise', 'Sollevamento laterale della gamba', { pattern: 'hinge', position: 'side', muscles: ['glutes', 'hips'], equipment: ['mat'], sets: 2, n: 12, perSide: true, rest: 45, harder: 'ankle-leg-raise', tip: 'Il bacino resta fermo: muove solo la gamba.' }),
  e('ankle-leg-raise', 'Sollevamento della gamba con cavigliere', { pattern: 'hinge', position: 'side', muscles: ['glutes', 'hips'], equipment: ['ankle', 'mat'], level: 2, prereq: ['side-leg-raise'], sets: 2, n: 10, perSide: true, rest: 45, easier: 'side-leg-raise', tip: 'Cavigliere leggere e movimento lento. Il bacino resta fermo.' }),
  e('donkey-kick', 'Calcio all’indietro in quadrupedia', { pattern: 'hinge', position: 'quadruped', muscles: ['glutes', 'hamstrings'], equipment: ['mat'], flags: ['wrists', 'knees'], sets: 2, n: 10, perSide: true, rest: 45, tip: 'Spingi il tallone verso il soffitto, senza inarcare la schiena.' }),

  // ------------------------------------------------------------------ spinta (petto, spalle, braccia)
  e('wall-push-up', 'Piegamenti al muro', { pattern: 'push', position: 'standing', muscles: ['chest', 'shoulders', 'arms'], flags: ['wrists'], sets: 2, n: 10, rest: 45, harder: 'incline-push-up', tip: 'Più i piedi sono lontani dal muro, più è impegnativo. Parti vicina.' }),
  e('incline-push-up', 'Piegamenti inclinati', { pattern: 'push', position: 'standing', muscles: ['chest', 'shoulders', 'arms'], equipment: ['step'], level: 1, flags: ['wrists'], prereq: ['wall-push-up'], sets: 2, n: 8, rest: 60, easier: 'wall-push-up', harder: 'push-up-knees', tip: 'Mani su un appoggio stabile (step o panca), corpo in linea.' }),
  e('push-up-knees', 'Piegamenti sulle ginocchia', { pattern: 'push', position: 'prone', muscles: ['chest', 'shoulders', 'arms'], equipment: ['mat'], level: 2, flags: ['wrists', 'shoulders', 'knees'], prereq: ['wall-push-up'], sets: 3, n: 8, rest: 60, easier: 'wall-push-up', harder: 'push-up', tip: 'Scendi fin dove ti senti comoda.' }),
  e('push-up', 'Piegamenti classici', { pattern: 'push', position: 'prone', muscles: ['chest', 'shoulders', 'arms', 'core'], equipment: ['mat'], level: 3, flags: ['wrists', 'shoulders'], prereq: ['push-up-knees'], sets: 3, n: 8, rest: 75, easier: 'push-up-knees', tip: 'Corpo in linea dalla testa ai talloni. Se la linea si rompe, torna alle ginocchia.' }),
  e('dumbbell-press', 'Spinte sopra la testa con manubri', { pattern: 'push', position: 'standing', muscles: ['shoulders', 'arms'], equipment: ['dumbbells'], level: 2, flags: ['shoulders', 'lumbar'], sets: 3, n: 10, rest: 60, tip: 'Peso leggero, spalle rilassate.' }),
  e('medball-press', 'Spinta con la palla medica', { pattern: 'push', position: 'standing', muscles: ['shoulders', 'chest', 'arms'], equipment: ['medball'], level: 2, flags: ['shoulders'], sets: 3, n: 10, rest: 60, tip: 'Tieni la palla al petto e spingila in alto, senza fretta.' }),

  // ------------------------------------------------------------------ tirata e schiena
  e('superman', 'Superman', { pattern: 'pull', position: 'prone', muscles: ['back', 'glutes'], equipment: ['mat'], flags: ['lumbar'], sets: 2, n: 10, rest: 45, tip: 'Solleva poco, basta un piccolo movimento.' }),
  e('bird-dog', 'Bird dog', { pattern: 'pull', position: 'quadruped', muscles: ['back', 'core', 'glutes'], equipment: ['mat'], flags: ['wrists', 'knees'], sets: 2, n: 8, perSide: true, rest: 45, tip: 'Braccio e gamba opposti, movimenti lenti e controllati.' }),
  e('band-pull-apart', 'Apertura con elastico', { pattern: 'pull', position: 'standing', muscles: ['back', 'shoulders'], equipment: ['band'], sets: 3, n: 12, rest: 45, tip: 'Apri le braccia piano, spalle lontane dalle orecchie.' }),
  e('band-row', 'Tirata con elastico', { pattern: 'pull', position: 'standing', muscles: ['back', 'arms'], equipment: ['band'], sets: 3, n: 12, rest: 45, tip: 'Tira i gomiti indietro, come per avvicinare le scapole.' }),
  e('dumbbell-row', 'Rematore con manubrio', { pattern: 'pull', position: 'standing', muscles: ['back', 'arms'], equipment: ['dumbbells'], level: 2, flags: ['lumbar'], sets: 3, n: 10, perSide: true, rest: 60, tip: 'Una mano appoggiata a una sedia, schiena lunga, peso leggero.' }),
  e('dumbbell-curl', 'Curl con manubri', { pattern: 'pull', position: 'standing', muscles: ['arms'], equipment: ['dumbbells'], sets: 3, n: 10, rest: 60, tip: 'Gomiti vicini al corpo, peso leggero.' }),

  // ------------------------------------------------------------------ addominali e core
  e('dead-bug', 'Dead bug', { pattern: 'core', position: 'supine', muscles: ['core'], equipment: ['mat'], sets: 2, n: 8, perSide: true, rest: 45, harder: 'reverse-crunch', tip: 'Schiena appoggiata a terra: se si stacca, riduci il movimento.' }),
  e('reverse-crunch', 'Reverse crunch (ginocchia al petto)', { pattern: 'core', position: 'supine', muscles: ['core'], equipment: ['mat'], level: 2, flags: ['lumbar'], prereq: ['dead-bug'], sets: 2, n: 10, rest: 45, easier: 'dead-bug', harder: 'leg-raise-crunch', tip: 'Ginocchia piegate: solleva il bacino di poco, senza darti slancio.' }),
  e('leg-raise-crunch', 'Crunch con gambe sollevate', { pattern: 'core', position: 'supine', muscles: ['core'], equipment: ['mat'], level: 3, flags: ['lumbar', 'neck'], prereq: ['reverse-crunch'], sets: 2, n: 10, rest: 60, easier: 'reverse-crunch', tip: 'Gambe piegate e sollevate, movimento corto e controllato. Se tira la schiena, fermati.' }),
  e('toe-taps', 'Tocca con le punte (gambe sollevate)', { pattern: 'core', position: 'supine', muscles: ['core'], equipment: ['mat'], level: 2, flags: ['lumbar'], prereq: ['dead-bug'], sets: 2, n: 10, rest: 45, easier: 'dead-bug', tip: 'Ginocchia piegate a 90°: abbassa un piede alla volta fino a sfiorare il pavimento.' }),
  e('crunch', 'Crunch', { pattern: 'core', position: 'supine', muscles: ['core'], equipment: ['mat'], flags: ['neck'], sets: 2, n: 10, rest: 45, tip: 'Solleva solo spalle e testa, sguardo al soffitto, senza tirare il collo.' }),
  e('plank-knees', 'Plank sulle ginocchia', { pattern: 'core', position: 'prone', muscles: ['core', 'shoulders'], equipment: ['mat'], flags: ['knees'], mode: 'time', sets: 2, seconds: 15, rest: 45, anim: 'hold', harder: 'plank', tip: 'Linea dritta dalle ginocchia alla testa, respira.' }),
  e('plank', 'Plank sugli avambracci', { pattern: 'core', position: 'prone', muscles: ['core', 'shoulders'], equipment: ['mat'], level: 2, flags: ['shoulders'], prereq: ['plank-knees'], mode: 'time', sets: 3, seconds: 20, rest: 45, anim: 'hold', easier: 'plank-knees', tip: 'Corpo allineato. Se è troppo, appoggia le ginocchia.' }),

  // ------------------------------------------------------------------ cardio
  e('treadmill-walk', 'Camminata sul tapis roulant', { phases: ['warmup', 'cardio', 'cooldown'], pattern: 'cardio', position: 'machine', muscles: ['full'], equipment: ['treadmill'], mode: 'time', sets: 1, seconds: 600, rest: 0, tip: 'Un passo comodo, in cui riesci a parlare.' }),
  e('easy-pedal', 'Pedalata tranquilla', { phases: ['warmup', 'cardio', 'cooldown'], pattern: 'cardio', position: 'machine', muscles: ['quads', 'glutes'], equipment: ['bike'], flags: ['knees'], mode: 'time', sets: 1, seconds: 600, rest: 0, tip: 'Resistenza bassa, ritmo piacevole. Puoi fermarti quando vuoi.' }),
  e('elliptical-easy', 'Ellittica a ritmo facile', { phases: ['warmup', 'cardio', 'cooldown'], pattern: 'cardio', position: 'machine', muscles: ['full'], equipment: ['elliptical'], mode: 'time', sets: 1, seconds: 600, rest: 0, tip: 'Movimento fluido e resistenza bassa. Tieniti al ritmo in cui riesci a parlare.' }),
  e('stepper-easy', 'Mini stepper a ritmo facile', { phases: ['warmup', 'cardio'], pattern: 'cardio', position: 'machine', muscles: ['quads', 'glutes'], equipment: ['stepper'], flags: ['knees'], mode: 'time', sets: 1, seconds: 420, rest: 0, tip: 'Passi piccoli e regolari, senza affondare i pedali.' }),
  e('step-jack', 'Apri e chiudi senza salti', { phases: ['warmup', 'cardio'], pattern: 'cardio', position: 'standing', muscles: ['full'], mode: 'time', sets: 3, seconds: 30, rest: 30, harder: 'jumping-jack', tip: 'Un piede alla volta di lato, braccia che si aprono sopra la testa: nessun salto.' }),
  e('jumping-jack', 'Jumping jack', { phases: ['cardio'], pattern: 'cardio', position: 'standing', muscles: ['full'], level: 2, flags: ['impact', 'knees'], prereq: ['step-jack'], mode: 'time', sets: 3, seconds: 30, rest: 45, easier: 'step-jack', tip: 'Salti leggeri, atterra morbida sulle punte. Se senti urti, torna alla versione senza salti.' }),
  e('jump-rope', 'Saltelli con la corda', { phases: ['cardio'], pattern: 'cardio', position: 'standing', muscles: ['full'], equipment: ['rope'], level: 2, flags: ['impact', 'knees'], prereq: ['step-jack'], mode: 'time', sets: 3, seconds: 30, rest: 45, easier: 'step-jack', tip: 'Saltelli bassi e leggeri. Fermati quando vuoi.' }),

  // ------------------------------------------------------------------ defaticamento e stretching
  e('child-pose', 'Posizione del bambino', { phases: ['cooldown'], pattern: 'stretch', position: 'kneeling', muscles: ['back', 'hips'], equipment: ['mat'], mode: 'time', sets: 1, seconds: 30, rest: 0, anim: 'hold', flags: ['knees'], tip: 'Siediti sui talloni e allunga le braccia davanti a te, respirando piano.' }),
  e('hamstring-stretch', 'Allungamento dietro la coscia', { phases: ['cooldown'], pattern: 'stretch', position: 'standing', muscles: ['hamstrings'], mode: 'time', sets: 2, seconds: 20, perSide: true, rest: 10, anim: 'hold', tip: 'Tallone appoggiato su un gradino, schiena lunga: devi sentire solo un leggero allungamento.' }),
  e('quad-stretch', 'Allungamento davanti alla coscia', { phases: ['cooldown'], pattern: 'stretch', position: 'standing', muscles: ['quads'], mode: 'time', sets: 2, seconds: 20, perSide: true, rest: 10, flags: ['balance', 'knees'], anim: 'hold', tip: 'Tieniti a un appoggio e porta il tallone verso il gluteo, senza forzare.' }),
  e('chest-stretch', 'Apertura del petto', { phases: ['cooldown'], pattern: 'stretch', position: 'standing', muscles: ['chest', 'shoulders'], mode: 'time', sets: 2, seconds: 20, rest: 10, flags: ['shoulders'], anim: 'hold', tip: 'Mani intrecciate dietro la schiena, apri il petto e respira.' }),
  e('deep-breathing', 'Respiro profondo', { phases: ['cooldown'], pattern: 'breath', position: 'standing', muscles: ['core'], mode: 'time', sets: 1, seconds: 60, rest: 0, anim: 'hold', tip: 'Inspira dal naso gonfiando la pancia, espira lentamente dalla bocca.' }),
];
