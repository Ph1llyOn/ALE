// Testi descrittivi degli esercizi (solo frontend). Una voce per ogni id di exercise-catalog.js.
// Sono indicazioni generiche e delicate, NON prescrizioni: le indicazioni del professionista che segue Alessia hanno sempre la precedenza.

export const MUSCLE_LABELS = {
  quads: 'Cosce (davanti)',
  glutes: 'Glutei',
  hamstrings: 'Cosce (dietro)',
  calves: 'Polpacci',
  chest: 'Petto',
  back: 'Schiena',
  shoulders: 'Spalle',
  arms: 'Braccia',
  core: 'Pancia e zona centrale',
  obliques: 'Fianchi (addominali laterali)',
  hips: 'Anche',
  full: 'Tutto il corpo',
};

export const FLAG_LABELS = {
  lumbar: 'Schiena (zona lombare)',
  knees: 'Ginocchia',
  wrists: 'Polsi',
  shoulders: 'Spalle',
  neck: 'Collo',
  impact: 'Saltelli e impatto',
  floor: 'Lavoro a terra',
  balance: 'Equilibrio',
};

export const LEVEL_LABELS = { 1: 'Base', 2: 'Intermedio', 3: 'Avanzato' };

export const TEXTS = {
  // ---------------------------------------------------------------- riscaldamento e mobilità
  'march': {
    desc: 'Una camminata sul posto per scaldarti piano piano prima di iniziare.',
    setup: 'Libera un po’ di spazio davanti a te e mettiti in piedi, con i piedi alla larghezza dei fianchi.',
    steps: [
      'Stai in piedi, schiena lunga e spalle rilassate.',
      'Solleva un ginocchio, poi l’altro, come se camminassi sul posto.',
      'Muovi le braccia in modo naturale, in opposizione alle gambe.',
      'Mantieni un ritmo comodo per tutto il tempo.',
    ],
    posture: 'Tieni lo sguardo avanti e il busto dritto. Respira con regolarità, dal naso o dalla bocca, come ti viene più comodo.',
    mistakes: [
      'Evita di sollevare le ginocchia più di quanto ti sia comodo.',
      'Evita di piegarti in avanti con il busto.',
    ],
    safety: null,
    muscleNote: 'Mette in moto gambe e braccia insieme.',
  },
  'arm-circles': {
    desc: 'Cerchi ampi con le braccia per sciogliere spalle e parte alta della schiena.',
    setup: 'Mettiti in piedi con un po’ di spazio attorno a te, in modo da poter aprire bene le braccia.',
    steps: [
      'Stai in piedi e apri le braccia ai lati, all’altezza delle spalle.',
      'Disegna cerchi piccoli e poi sempre più grandi, in avanti.',
      'Dopo metà delle ripetizioni, cambia e vai all’indietro.',
      'Torna con le braccia lungo i fianchi.',
    ],
    posture: 'Spalle lontane dalle orecchie e collo morbido. Respira con calma, senza trattenere il fiato.',
    mistakes: [
      'Evita di fare cerchi troppo veloci.',
      'Evita di alzare le spalle verso le orecchie.',
    ],
    safety: null,
  },
  'hip-circles': {
    desc: 'Cerchi lenti con il bacino per sciogliere le anche prima di muoverti.',
    setup: 'Mettiti in piedi con i piedi un po’ più larghi dei fianchi, in uno spazio libero.',
    steps: [
      'Appoggia le mani sui fianchi e piega leggermente le ginocchia.',
      'Muovi il bacino in un cerchio lento, verso destra.',
      'Dopo qualche giro, cambia direzione.',
      'Fai la metà dei cerchi per lato, poi torna in piedi.',
    ],
    posture: 'Il busto resta il più fermo possibile, mentre si muove solo il bacino. Respira in modo regolare.',
    mistakes: [
      'Evita di fare cerchi troppo grandi o veloci.',
      'Evita di bloccare le ginocchia.',
    ],
    safety: null,
  },
  'shoulder-rolls': {
    desc: 'Piccole rotazioni delle spalle per rilassare collo e parte alta della schiena.',
    setup: 'Mettiti in piedi, o anche seduta, con le braccia rilassate lungo il corpo.',
    steps: [
      'Stai dritta con le braccia lungo i fianchi.',
      'Porta le spalle verso le orecchie, poi indietro.',
      'Falle scendere giù, in un cerchio lento e morbido.',
      'A metà delle ripetizioni, cambia verso e fai il cerchio all’opposto.',
    ],
    posture: 'Inspira quando sali, espira mentre scendi. Il collo resta lungo e rilassato.',
    mistakes: [
      'Evita di fare movimenti piccoli e rigidi.',
      'Evita di spingere il mento in avanti.',
    ],
    safety: null,
  },
  'cat-cow': {
    desc: 'Un movimento dolce della schiena, che si inarca e si arrotonda, per scaldare la colonna.',
    setup: 'Stendi il tappetino e mettiti a quattro zampe, con le mani sotto le spalle e le ginocchia sotto i fianchi.',
    steps: [
      'Parti a quattro zampe, con la schiena in posizione neutra.',
      'Espira e arrotonda la schiena verso il soffitto, con lo sguardo verso le ginocchia.',
      'Inspira e abbassa piano la pancia, aprendo il petto e guardando avanti.',
      'Ripeti con calma, seguendo il respiro.',
    ],
    posture: 'Muovi la schiena un pezzetto alla volta, senza fretta. Espira quando la arrotondi, inspira quando la abbassi.',
    mistakes: [
      'Evita di inarcare la schiena più di quanto sia comodo.',
      'Evita di caricare tutto il peso sui polsi: spingi bene con le mani aperte.',
    ],
    safety: 'Se senti dolore o fastidio ai polsi, appoggia i pugni chiusi o gli avambracci. Se qualcosa non va, fermati.',
  },

  // ---------------------------------------------------------------- gambe e glutei
  'chair-squat': {
    desc: 'Ti siedi e ti rialzi da una sedia: un modo sicuro per allenare cosce e glutei.',
    setup: 'Metti una sedia stabile contro il muro e mettiti davanti, con i piedi alla larghezza dei fianchi.',
    steps: [
      'Stai davanti alla sedia, con i piedi alla larghezza dei fianchi e le braccia avanti.',
      'Porta il bacino indietro e piega le ginocchia, come per sederti.',
      'Sfiora la sedia con il sedere, senza lasciarti cadere.',
      'Spingi sui piedi e torna in piedi.',
    ],
    posture: 'Schiena lunga e ginocchia in linea con le punte dei piedi. Inspira mentre scendi, espira mentre risali.',
    mistakes: [
      'Evita di lasciarti cadere sulla sedia.',
      'Evita di spingere con le mani per alzarti.',
      'Evita di far cadere le ginocchia verso l’interno.',
    ],
    safety: 'Se senti dolore o fastidio alle ginocchia, fermati o scendi meno.',
  },
  'squat': {
    desc: 'Un classico movimento di gambe, come sederti all’indietro, per cosce e glutei.',
    setup: 'Mettiti in piedi con i piedi alla larghezza dei fianchi, in uno spazio libero davanti a te.',
    steps: [
      'Stai in piedi, con le punte dei piedi un po’ aperte e le braccia avanti.',
      'Porta il bacino indietro e piega le ginocchia, come per sederti.',
      'Scendi fin dove stai comoda, con la schiena lunga.',
      'Spingi sui piedi e torna in piedi.',
    ],
    posture: 'Il peso resta su tutto il piede, talloni compresi. Inspira mentre scendi, espira mentre risali.',
    mistakes: [
      'Evita di sollevare i talloni da terra.',
      'Evita di far cadere le ginocchia verso l’interno.',
      'Evita di scendere più di quanto stai comoda.',
    ],
    safety: 'Se senti dolore o fastidio alle ginocchia, fermati e scegli la variante alla sedia.',
  },
  'goblet-squat': {
    desc: 'Lo squat tenendo un manubrio al petto: un passo in più per cosce, glutei e pancia.',
    setup: 'Prendi un manubrio leggero, tienilo con entrambe le mani vicino al petto e fai spazio davanti a te.',
    steps: [
      'Stai in piedi, con i piedi un po’ più larghi dei fianchi, il manubrio al petto.',
      'Porta il bacino indietro e piega le ginocchia, con il manubrio vicino a te.',
      'Scendi fin dove stai comoda, con la schiena lunga.',
      'Spingi sui piedi e torna in piedi.',
    ],
    posture: 'Gomiti verso il basso e petto aperto. Inspira mentre scendi, espira mentre risali.',
    mistakes: [
      'Evita di scegliere un peso troppo pesante.',
      'Evita di allontanare il manubrio dal petto.',
      'Evita di far cadere le ginocchia verso l’interno.',
    ],
    safety: 'Se senti dolore o fastidio alle ginocchia, fermati e torna allo squat a corpo libero.',
  },
  'kettlebell-squat': {
    desc: 'Lo squat tenendo una kettlebell al petto: per allenare cosce, glutei e pancia.',
    setup: 'Prendi una kettlebell leggera, tienila con entrambe le mani vicino al petto e fai spazio davanti a te.',
    steps: [
      'Stai in piedi, con i piedi un po’ più larghi dei fianchi e la kettlebell al petto.',
      'Porta il bacino indietro e piega le ginocchia, con la kettlebell vicina a te.',
      'Scendi fin dove stai comoda, con la schiena lunga.',
      'Spingi sui piedi e torna in piedi.',
    ],
    posture: 'Gomiti verso il basso e petto aperto. Inspira mentre scendi, espira mentre risali.',
    mistakes: [
      'Evita di scegliere un peso troppo pesante.',
      'Evita di far dondolare la kettlebell lontano dal corpo.',
      'Evita di far cadere le ginocchia verso l’interno.',
    ],
    safety: 'Se senti dolore o fastidio alle ginocchia, fermati e torna allo squat a corpo libero.',
  },
  'ball-wall-squat': {
    desc: 'Scendi e risali con una palla tra la schiena e il muro, che ti aiuta a restare stabile.',
    setup: 'Metti la palla da ginnastica tra la schiena e il muro, con i piedi un passo davanti a te.',
    steps: [
      'Appoggia la parte bassa della schiena sulla palla, contro il muro.',
      'Metti i piedi un po’ più avanti, alla larghezza dei fianchi.',
      'Piega le ginocchia e fai scorrere la palla lungo il muro, fin dove stai comoda.',
      'Spingi sui piedi e risali piano.',
    ],
    posture: 'Il busto resta appoggiato alla palla, il petto aperto. Inspira mentre scendi, espira mentre risali.',
    mistakes: [
      'Evita di mettere i piedi troppo vicini al muro.',
      'Evita di scendere di fretta.',
      'Evita di far cadere le ginocchia verso l’interno.',
    ],
    safety: 'Se senti dolore o fastidio alle ginocchia, fermati o scendi meno.',
  },
  'wall-sit': {
    desc: 'Resti ferma con la schiena al muro, come seduta su una sedia invisibile.',
    setup: 'Trova un muro libero e mettiti con la schiena appoggiata, con i piedi un passo davanti a te.',
    steps: [
      'Appoggia la schiena al muro e metti i piedi un passo avanti.',
      'Scivola lungo il muro piegando le ginocchia, fin dove stai comoda.',
      'Resta ferma, con le braccia incrociate o lungo i fianchi.',
      'Risali lentamente lungo il muro.',
    ],
    posture: 'Schiena appoggiata e spalle rilassate. Respira con regolarità e non trattenere il fiato.',
    mistakes: [
      'Evita di spingere le mani sulle cosce.',
      'Evita di scendere più di quanto stai comoda.',
      'Evita di trattenere il respiro.',
    ],
    safety: 'Se senti dolore o fastidio alle ginocchia, fermati e risali subito.',
  },
  'lunge': {
    desc: 'Un passo indietro e una piccola discesa, per cosce e glutei, un lato alla volta.',
    setup: 'Libera uno spazio davanti e dietro di te. Se vuoi, tieniti a una sedia o a un muro.',
    steps: [
      'Stai in piedi con i piedi alla larghezza dei fianchi.',
      'Fai un passo indietro con una gamba, appoggiando la punta del piede.',
      'Piega entrambe le ginocchia, con il busto dritto.',
      'Spingi sul piede davanti e torna in piedi. Poi cambia gamba.',
    ],
    posture: 'Il busto resta dritto e lo sguardo avanti. Inspira mentre scendi, espira mentre risali.',
    mistakes: [
      'Evita di fare un passo troppo corto o troppo lungo.',
      'Evita di far cadere il ginocchio davanti verso l’interno.',
      'Evita di piegare il busto in avanti.',
    ],
    safety: 'Se senti dolore o fastidio alle ginocchia, o ti senti instabile, fermati e tieniti a un appoggio.',
  },
  'step-up': {
    desc: 'Sali su una pedana e scendi, una gamba alla volta: allena cosce e glutei.',
    setup: 'Metti la pedana fitness (step) su una superficie stabile, oppure usa una panca solida, e mettiti davanti.',
    steps: [
      'Stai davanti allo step, con tutto il piede appoggiato sopra.',
      'Spingi sul piede appoggiato e sali, portando l’altro piede accanto.',
      'Scendi con calma, mettendo giù prima il piede libero.',
      'Ripeti da un lato, poi cambia gamba.',
    ],
    posture: 'Il busto resta dritto e lo sguardo avanti. Espira mentre sali, inspira mentre scendi.',
    mistakes: [
      'Evita di spingerti con il piede che resta a terra.',
      'Evita di appoggiare solo la punta sullo step.',
      'Evita di scendere di fretta.',
    ],
    safety: 'Se senti dolore o fastidio alle ginocchia, o ti senti instabile, fermati e tieniti a un appoggio.',
  },
  'calf-raise': {
    desc: 'Ti alzi sulle punte dei piedi e torni giù: un movimento semplice per i polpacci.',
    setup: 'Mettiti in piedi vicino a un muro o a una sedia, in modo da poterti appoggiare con una mano.',
    steps: [
      'Stai in piedi, con i piedi alla larghezza dei fianchi.',
      'Sali piano sulle punte, spingendo bene con la parte davanti del piede.',
      'Resta un istante in alto.',
      'Scendi lentamente fino ad appoggiare i talloni.',
    ],
    posture: 'Busto lungo e ginocchia morbide, non bloccate. Espira mentre sali, inspira mentre scendi.',
    mistakes: [
      'Evita di dondolare per prendere slancio.',
      'Evita di far cadere le caviglie verso l’esterno.',
    ],
    safety: 'Se ti senti instabile, tieniti a un appoggio. Se senti dolore o fastidio, fermati.',
  },
  'glute-bridge': {
    desc: 'Sdraiata sulla schiena, sollevi il bacino per allenare glutei e retro delle cosce.',
    setup: 'Stendi il tappetino e sdraiati sulla schiena, con le ginocchia piegate e i piedi ben appoggiati.',
    steps: [
      'Sdraiati con le ginocchia piegate e i piedi alla larghezza dei fianchi.',
      'Appoggia le braccia lungo il corpo, con i palmi a terra.',
      'Spingi sui piedi e solleva il bacino, fino a formare una linea con le ginocchia.',
      'Scendi piano, una vertebra alla volta.',
    ],
    posture: 'Espira mentre sali, inspira mentre scendi. Le costole restano morbide, senza inarcare la schiena.',
    mistakes: [
      'Evita di spingere il bacino troppo in alto.',
      'Evita di allargare le ginocchia o di farle cadere verso l’interno.',
    ],
    safety: null,
  },
  'single-leg-bridge': {
    desc: 'Il ponte con una gamba sola: più impegnativo, per glutei, cosce e pancia.',
    setup: 'Stendi il tappetino e sdraiati sulla schiena, con le ginocchia piegate e i piedi ben appoggiati.',
    steps: [
      'Sdraiati con le ginocchia piegate e stendi una gamba davanti a te.',
      'Spingi sul piede appoggiato e solleva il bacino.',
      'Tieni il bacino dritto, senza farlo inclinare da un lato.',
      'Scendi piano e fai tutte le ripetizioni, poi cambia gamba.',
    ],
    posture: 'Espira mentre sali, inspira mentre scendi. Il bacino resta allineato, con la schiena rilassata.',
    mistakes: [
      'Evita di inarcare la schiena per salire di più.',
      'Evita di far inclinare il bacino da un lato.',
      'Evita di muoverti di fretta.',
    ],
    safety: 'Se senti tirare la schiena, fermati e scegli il ponte con due gambe.',
  },
  'ball-bridge': {
    desc: 'Il ponte con i piedi sulla palla: un po’ più instabile, per glutei, cosce e pancia.',
    setup: 'Stendi il tappetino, metti la palla da ginnastica ai tuoi piedi e sdraiati sulla schiena.',
    steps: [
      'Sdraiati sul tappetino e appoggia i talloni sulla palla, con le ginocchia piegate.',
      'Metti le braccia lungo il corpo, con i palmi a terra.',
      'Spingi sui talloni e solleva il bacino, tenendo ferma la palla.',
      'Scendi piano fino a toccare terra.',
    ],
    posture: 'Espira mentre sali, inspira mentre scendi. Muoviti con calma, perché la palla può spostarsi.',
    mistakes: [
      'Evita di spingere la palla lontano con i piedi.',
      'Evita di salire troppo in fretta.',
    ],
    safety: 'Se ti senti instabile, tieni i piedi a terra e fai il ponte normale.',
  },
  'side-leg-raise': {
    desc: 'Sdraiata su un fianco, sollevi la gamba di lato per allenare glutei e anche.',
    setup: 'Stendi il tappetino e sdraiati su un fianco, con le gambe una sopra l’altra.',
    steps: [
      'Sdraiati su un fianco, con la testa appoggiata al braccio.',
      'Piega un po’ la gamba sotto e tieni dritta quella sopra.',
      'Solleva la gamba sopra di lato, con la punta del piede in avanti.',
      'Scendi piano. Fai tutte le ripetizioni, poi cambia lato.',
    ],
    posture: 'Il bacino resta fermo e il corpo in linea. Espira mentre sollevi, inspira mentre scendi.',
    mistakes: [
      'Evita di far ruotare il bacino indietro.',
      'Evita di sollevare la gamba più in alto di quanto riesci con controllo.',
    ],
    safety: null,
  },
  'ankle-leg-raise': {
    desc: 'Il sollevamento laterale della gamba con le cavigliere, per glutei e anche.',
    setup: 'Stendi il tappetino, metti le cavigliere e sdraiati su un fianco, con le gambe una sopra l’altra.',
    steps: [
      'Sdraiati su un fianco, con la testa appoggiata al braccio.',
      'Piega un po’ la gamba sotto e tieni dritta quella sopra.',
      'Solleva piano la gamba con la cavigliera, con la punta del piede in avanti.',
      'Scendi lentamente. Fai tutte le ripetizioni, poi cambia lato.',
    ],
    posture: 'Il bacino resta fermo e il corpo in linea. Espira mentre sollevi, inspira mentre scendi.',
    mistakes: [
      'Evita di usare cavigliere troppo pesanti.',
      'Evita di far ruotare il bacino indietro.',
    ],
    safety: null,
  },
  'donkey-kick': {
    desc: 'A quattro zampe, spingi un tallone verso l’alto per allenare glutei e retro della coscia.',
    setup: 'Stendi il tappetino e mettiti a quattro zampe, con le mani sotto le spalle e le ginocchia sotto i fianchi.',
    steps: [
      'Parti a quattro zampe, con la schiena in posizione neutra.',
      'Tieni il ginocchio piegato e solleva una gamba, spingendo il tallone verso il soffitto.',
      'Fermati quando la coscia è in linea con la schiena.',
      'Torna giù con calma. Fai tutte le ripetizioni, poi cambia gamba.',
    ],
    posture: 'La schiena resta ferma e lunga. Espira mentre sollevi, inspira mentre scendi.',
    mistakes: [
      'Evita di inarcare la schiena per salire di più.',
      'Evita di ruotare il bacino di lato.',
    ],
    safety: 'Se senti dolore o fastidio ai polsi, appoggia gli avambracci. Se qualcosa non va, fermati.',
  },

  // ---------------------------------------------------------------- spinta
  'wall-push-up': {
    desc: 'Piegamenti in piedi contro il muro: un modo semplice per allenare petto, spalle e braccia.',
    setup: 'Mettiti davanti a un muro libero, a circa un passo di distanza, con le mani appoggiate all’altezza delle spalle.',
    steps: [
      'Stai in piedi e appoggia le mani al muro, alla larghezza delle spalle.',
      'Tieni il corpo in linea retta, dalla testa ai talloni.',
      'Piega i gomiti e avvicina il petto al muro.',
      'Spingi con le mani e torna alla posizione di partenza.',
    ],
    posture: 'Corpo in linea, pancia morbida. Inspira mentre ti avvicini, espira mentre spingi.',
    mistakes: [
      'Evita di spingere il sedere indietro.',
      'Evita di aprire troppo i gomiti ai lati.',
    ],
    safety: 'Se senti dolore o fastidio ai polsi, appoggia gli avambracci o ruota un po’ le mani. Se persiste, fermati.',
  },
  'incline-push-up': {
    desc: 'Piegamenti con le mani su un appoggio rialzato: un passo in più rispetto a quelli al muro.',
    setup: 'Metti uno step o una panca stabile contro il muro e appoggia le mani sul bordo, alla larghezza delle spalle.',
    steps: [
      'Appoggia le mani sullo step e tieni il corpo in linea, dalla testa ai talloni.',
      'Piega i gomiti e avvicina il petto all’appoggio.',
      'Fermati prima di perdere la linea del corpo.',
      'Spingi con le mani e torna su.',
    ],
    posture: 'Pancia attiva e collo lungo. Inspira mentre scendi, espira mentre spingi.',
    mistakes: [
      'Evita di far cadere il bacino verso il basso.',
      'Evita di usare un appoggio che si muove.',
    ],
    safety: 'Se senti dolore o fastidio ai polsi, torna ai piegamenti al muro. Se persiste, fermati.',
  },
  'push-up-knees': {
    desc: 'Piegamenti a terra con le ginocchia appoggiate: allenano petto, spalle e braccia.',
    setup: 'Stendi il tappetino e mettiti a terra con le mani sotto le spalle e le ginocchia appoggiate.',
    steps: [
      'Parti con le mani sotto le spalle e le ginocchia appoggiate sul tappetino.',
      'Tieni il corpo in linea, dalle ginocchia alla testa.',
      'Piega i gomiti e avvicina il petto a terra, fin dove stai comoda.',
      'Spingi con le mani e torna su.',
    ],
    posture: 'Pancia attiva e collo lungo. Inspira mentre scendi, espira mentre spingi.',
    mistakes: [
      'Evita di far cadere il bacino verso il basso.',
      'Evita di aprire troppo i gomiti ai lati.',
      'Evita di scendere più di quanto stai comoda.',
    ],
    safety: 'Se senti dolore o fastidio ai polsi o alle spalle, fermati e scegli i piegamenti inclinati.',
  },
  'push-up': {
    desc: 'Il piegamento classico, con il corpo in linea: allena petto, spalle, braccia e pancia.',
    setup: 'Stendi il tappetino e mettiti a terra con le mani sotto le spalle, sulle punte dei piedi.',
    steps: [
      'Parti con le mani sotto le spalle e il corpo in linea, dalla testa ai talloni.',
      'Stringi pancia e glutei per tenere la linea.',
      'Piega i gomiti e avvicina il petto a terra.',
      'Spingi con le mani e torna su.',
    ],
    posture: 'Corpo in linea e collo lungo. Inspira mentre scendi, espira mentre spingi.',
    mistakes: [
      'Evita di far cadere il bacino o di alzarlo troppo.',
      'Evita di aprire troppo i gomiti ai lati.',
      'Evita di continuare se perdi la linea del corpo.',
    ],
    safety: 'Se senti dolore o fastidio ai polsi o alle spalle, fermati e scegli i piegamenti sulle ginocchia.',
  },
  'dumbbell-press': {
    desc: 'Spingi due manubri sopra la testa: allena spalle e braccia.',
    setup: 'Prendi due manubri leggeri, tienili all’altezza delle spalle e mettiti in piedi con i piedi alla larghezza dei fianchi.',
    steps: [
      'Stai in piedi, con un manubrio per mano all’altezza delle spalle.',
      'Stringi la pancia e tieni le costole morbide.',
      'Spingi i manubri verso l’alto, fino a stendere le braccia.',
      'Scendi piano fino alle spalle.',
    ],
    posture: 'Schiena lunga, senza inarcarla. Espira mentre spingi, inspira mentre scendi.',
    mistakes: [
      'Evita di inarcare la schiena per spingere più in alto.',
      'Evita di scegliere manubri troppo pesanti.',
      'Evita di alzare le spalle verso le orecchie.',
    ],
    safety: 'Se senti dolore o fastidio alle spalle o alla schiena, fermati e scegli un peso più leggero.',
  },
  'medball-press': {
    desc: 'Spingi la palla medica dal petto verso l’alto: allena spalle, petto e braccia.',
    setup: 'Prendi la palla medica con entrambe le mani e mettiti in piedi con i piedi alla larghezza dei fianchi.',
    steps: [
      'Stai in piedi, con la palla medica al petto.',
      'Stringi la pancia e tieni le spalle rilassate.',
      'Spingi la palla verso l’alto, fino a stendere le braccia.',
      'Riportala piano al petto.',
    ],
    posture: 'Schiena lunga, senza inarcarla. Espira mentre spingi, inspira mentre torni al petto.',
    mistakes: [
      'Evita di inarcare la schiena per spingere più in alto.',
      'Evita di scegliere una palla troppo pesante.',
    ],
    safety: 'Se senti dolore o fastidio alle spalle, fermati e scegli una palla più leggera.',
  },

  // ---------------------------------------------------------------- tirata e schiena
  'superman': {
    desc: 'Sdraiata a pancia in giù, sollevi un poco braccia e gambe per rinforzare la schiena.',
    setup: 'Stendi il tappetino e sdraiati a pancia in giù, con le braccia stese in avanti e la fronte a terra.',
    steps: [
      'Sdraiati a pancia in giù, con le braccia in avanti e le gambe distese.',
      'Stringi piano i glutei e guarda a terra.',
      'Solleva di poco braccia e gambe, senza forzare.',
      'Scendi lentamente e rilassati.',
    ],
    posture: 'Collo lungo, sguardo a terra. Espira mentre sollevi, inspira mentre scendi.',
    mistakes: [
      'Evita di alzarti troppo o di spingere la testa all’indietro.',
      'Evita di muoverti di scatto.',
    ],
    safety: 'Se senti tirare la schiena, fermati e solleva solo un braccio o una gamba alla volta, oppure riposa.',
  },
  'bird-dog': {
    desc: 'A quattro zampe allunghi braccio e gamba opposti: allena schiena, pancia ed equilibrio.',
    setup: 'Stendi il tappetino e mettiti a quattro zampe, con le mani sotto le spalle e le ginocchia sotto i fianchi.',
    steps: [
      'Parti a quattro zampe, con la schiena in posizione neutra.',
      'Allunga un braccio in avanti e la gamba opposta all’indietro.',
      'Fermati un istante, con il bacino dritto.',
      'Torna piano alla posizione iniziale e cambia lato.',
    ],
    posture: 'Il bacino resta fermo e la schiena lunga. Espira mentre allunghi, inspira mentre torni.',
    mistakes: [
      'Evita di alzare la gamba più in alto della schiena.',
      'Evita di ruotare il bacino di lato.',
    ],
    safety: 'Se senti dolore o fastidio ai polsi, appoggia i pugni o gli avambracci. Se qualcosa non va, fermati.',
  },
  'band-pull-apart': {
    desc: 'Apri le braccia tenendo un elastico: rinforza la parte alta della schiena e le spalle.',
    setup: 'Prendi l’elastico con le mani alla larghezza delle spalle e mettiti in piedi, con le braccia stese davanti.',
    steps: [
      'Stai in piedi e tieni l’elastico teso davanti al petto, con le braccia stese.',
      'Apri le braccia di lato, allungando l’elastico.',
      'Avvicina le scapole, senza alzare le spalle.',
      'Torna piano alla posizione iniziale.',
    ],
    posture: 'Spalle lontane dalle orecchie e petto aperto. Espira mentre apri, inspira mentre torni.',
    mistakes: [
      'Evita di alzare le spalle verso le orecchie.',
      'Evita di tirare l’elastico di scatto.',
    ],
    safety: null,
  },
  'band-row': {
    desc: 'Tiri l’elastico verso di te, come in una remata: allena schiena e braccia.',
    setup: 'Fissa l’elastico a un punto stabile all’altezza del petto, oppure mettilo sotto i piedi, e prendilo con le mani.',
    steps: [
      'Stai in piedi, con i piedi alla larghezza dei fianchi e le braccia stese verso l’elastico.',
      'Tieni il busto dritto e la pancia leggera.',
      'Tira i gomiti indietro, vicino al corpo, avvicinando le scapole.',
      'Torna piano con le braccia stese.',
    ],
    posture: 'Spalle lontane dalle orecchie e busto fermo. Espira mentre tiri, inspira mentre torni.',
    mistakes: [
      'Evita di inclinarti all’indietro per tirare.',
      'Evita di alzare le spalle verso le orecchie.',
    ],
    safety: null,
  },
  'dumbbell-row': {
    desc: 'Tiri un manubrio verso il fianco, con una mano appoggiata: allena schiena e braccia.',
    setup: 'Prendi un manubrio leggero e metti una sedia stabile accanto a te per appoggiare una mano.',
    steps: [
      'Appoggia una mano alla sedia, piega un po’ le ginocchia e inclina il busto in avanti.',
      'Tieni il manubrio nell’altra mano, con il braccio disteso verso il basso.',
      'Tira il gomito verso il fianco, tenendo la schiena lunga.',
      'Scendi piano. Fai tutte le ripetizioni, poi cambia lato.',
    ],
    posture: 'Schiena lunga e collo in linea. Espira mentre tiri, inspira mentre scendi.',
    mistakes: [
      'Evita di arrotondare la schiena.',
      'Evita di ruotare il busto per sollevare il peso.',
      'Evita di scegliere un manubrio troppo pesante.',
    ],
    safety: 'Se senti tirare la schiena, fermati e scegli un peso più leggero o appoggiati meglio.',
  },
  'dumbbell-curl': {
    desc: 'Pieghi i gomiti sollevando due manubri: allena la parte davanti delle braccia.',
    setup: 'Prendi due manubri leggeri e mettiti in piedi con i piedi alla larghezza dei fianchi, con le braccia lungo il corpo.',
    steps: [
      'Stai in piedi, con un manubrio per mano e i palmi rivolti avanti.',
      'Tieni i gomiti vicini ai fianchi.',
      'Piega i gomiti e porta i manubri verso le spalle.',
      'Scendi lentamente fino a stendere le braccia.',
    ],
    posture: 'Busto fermo e spalle rilassate. Espira mentre sollevi, inspira mentre scendi.',
    mistakes: [
      'Evita di dondolare il busto per prendere slancio.',
      'Evita di muovere i gomiti in avanti.',
      'Evita di scegliere manubri troppo pesanti.',
    ],
    safety: null,
  },

  // ---------------------------------------------------------------- addominali e core
  'dead-bug': {
    desc: 'Sdraiata sulla schiena, allunghi braccio e gamba opposti: allena la pancia con dolcezza.',
    setup: 'Stendi il tappetino e sdraiati sulla schiena, con le braccia verso il soffitto e le ginocchia piegate.',
    steps: [
      'Sdraiati sulla schiena, con le braccia verso il soffitto e le ginocchia piegate sopra i fianchi.',
      'Tieni la schiena appoggiata al tappetino.',
      'Allunga un braccio dietro la testa e la gamba opposta in avanti, senza toccare terra.',
      'Torna al centro e cambia lato.',
    ],
    posture: 'La schiena resta appoggiata. Espira mentre allunghi, inspira mentre torni.',
    mistakes: [
      'Evita di far staccare la schiena dal tappetino.',
      'Evita di muoverti di fretta.',
    ],
    safety: null,
  },
  'reverse-crunch': {
    desc: 'Dalle ginocchia piegate, sollevi di poco il bacino: allena la parte bassa della pancia.',
    setup: 'Stendi il tappetino e sdraiati sulla schiena, con le braccia lungo il corpo e le ginocchia piegate.',
    steps: [
      'Sdraiati sulla schiena, con le ginocchia piegate e sollevate sopra i fianchi.',
      'Appoggia le mani a terra, lungo il corpo.',
      'Porta le ginocchia verso il petto e solleva di poco il bacino.',
      'Torna piano alla posizione iniziale.',
    ],
    posture: 'Movimento piccolo e controllato. Espira mentre sollevi il bacino, inspira mentre scendi.',
    mistakes: [
      'Evita di darti slancio con le gambe.',
      'Evita di sollevare il bacino più del necessario.',
    ],
    safety: 'Se senti tirare la schiena, fermati e scegli il dead bug.',
  },
  'leg-raise-crunch': {
    desc: 'Sollevi insieme spalle e gambe piegate: un movimento più impegnativo per la pancia.',
    setup: 'Stendi il tappetino e sdraiati sulla schiena, con le ginocchia piegate e sollevate, le mani leggere dietro la testa.',
    steps: [
      'Sdraiati sulla schiena, con le ginocchia piegate e sollevate.',
      'Appoggia le mani dietro la testa, senza tirare il collo.',
      'Solleva spalle e testa e avvicina un poco le ginocchia al petto.',
      'Scendi piano, senza lasciarti cadere.',
    ],
    posture: 'Il movimento è corto e lo sguardo verso il soffitto. Espira mentre sollevi, inspira mentre scendi.',
    mistakes: [
      'Evita di tirare il collo con le mani.',
      'Evita di muoverti di slancio.',
      'Evita di spingere con la schiena contro il tappetino fino a sentire tirare.',
    ],
    safety: 'Se senti tirare la schiena o il collo, fermati e scegli il reverse crunch.',
  },
  'toe-taps': {
    desc: 'Con le gambe sollevate, un piede alla volta tocca terra: allena la pancia con controllo.',
    setup: 'Stendi il tappetino e sdraiati sulla schiena, con le ginocchia piegate a 90° e sollevate sopra i fianchi.',
    steps: [
      'Sdraiati sulla schiena, con le ginocchia piegate a 90° e sollevate.',
      'Tieni la schiena appoggiata al tappetino.',
      'Abbassa un piede fino a sfiorare il pavimento con la punta.',
      'Torna su e cambia piede, un lato alla volta.',
    ],
    posture: 'La schiena resta appoggiata e le ginocchia ferme a 90°. Espira mentre abbassi, inspira mentre torni su.',
    mistakes: [
      'Evita di far staccare la schiena dal tappetino.',
      'Evita di abbassare il piede se non riesci a controllare il movimento.',
    ],
    safety: 'Se senti tirare la schiena, fermati e scegli il dead bug.',
  },
  'crunch': {
    desc: 'Dalla posizione sdraiata, sollevi spalle e testa: un classico per la pancia.',
    setup: 'Stendi il tappetino e sdraiati sulla schiena, con le ginocchia piegate e i piedi a terra.',
    steps: [
      'Sdraiati sulla schiena, con le ginocchia piegate e le mani leggere dietro la testa.',
      'Guarda il soffitto, con il mento lontano dal petto.',
      'Solleva piano le spalle da terra, restando nel movimento piccolo.',
      'Scendi lentamente.',
    ],
    posture: 'Collo lungo e rilassato. Espira mentre sollevi, inspira mentre scendi.',
    mistakes: [
      'Evita di tirare il collo con le mani.',
      'Evita di salire troppo, di slancio.',
    ],
    safety: 'Se senti dolore o fastidio al collo, fermati o appoggia le mani sulle cosce.',
  },
  'plank-knees': {
    desc: 'Resti ferma sugli avambracci e sulle ginocchia: una tenuta semplice per la pancia.',
    setup: 'Stendi il tappetino e mettiti a pancia in giù, con gli avambracci a terra e i gomiti sotto le spalle.',
    steps: [
      'Appoggia gli avambracci a terra, con i gomiti sotto le spalle.',
      'Appoggia le ginocchia sul tappetino.',
      'Solleva il bacino, tenendo una linea dritta dalle ginocchia alla testa.',
      'Resta ferma per il tempo indicato, poi appoggiati con calma.',
    ],
    posture: 'Pancia attiva e collo lungo, con lo sguardo a terra. Respira con regolarità, senza trattenere il fiato.',
    mistakes: [
      'Evita di far cadere la schiena verso il basso.',
      'Evita di alzare il sedere troppo in alto.',
      'Evita di trattenere il respiro.',
    ],
    safety: 'Se le ginocchia danno fastidio, appoggia un asciugamano piegato sotto o scegli un altro esercizio.',
  },
  'plank': {
    desc: 'Resti ferma sugli avambracci con il corpo in linea: una tenuta per pancia e spalle.',
    setup: 'Stendi il tappetino e mettiti a pancia in giù, con gli avambracci a terra e i gomiti sotto le spalle.',
    steps: [
      'Appoggia gli avambracci a terra, con i gomiti sotto le spalle.',
      'Metti le punte dei piedi a terra e solleva il corpo.',
      'Tieni una linea dritta dalla testa ai talloni.',
      'Resta ferma per il tempo indicato, poi appoggia le ginocchia.',
    ],
    posture: 'Pancia e glutei attivi, collo lungo e sguardo a terra. Respira con regolarità, senza trattenere il fiato.',
    mistakes: [
      'Evita di far cadere la schiena verso il basso.',
      'Evita di alzare il sedere troppo in alto.',
      'Evita di trattenere il respiro.',
    ],
    safety: 'Se senti dolore o fastidio alle spalle, fermati e scegli la versione sulle ginocchia.',
  },

  // ---------------------------------------------------------------- cardio
  'treadmill-walk': {
    desc: 'Una camminata tranquilla sul tapis roulant, per scaldarti o per muoverti con dolcezza.',
    setup: 'Sali sul tapis roulant con la velocità al minimo, poi aumentala fino a un passo comodo.',
    steps: [
      'Sali sul tapis roulant e appoggia le mani ai lati, se ti serve.',
      'Avvia il nastro a bassa velocità.',
      'Aumenta fino a un passo in cui riesci a parlare.',
      'Cammina per il tempo indicato, poi rallenta prima di scendere.',
    ],
    posture: 'Busto dritto, sguardo avanti e spalle rilassate. Respira in modo regolare.',
    mistakes: [
      'Evita di tenerti forte alle maniglie per tutto il tempo.',
      'Evita di partire con una velocità troppo alta.',
    ],
    safety: null,
  },
  'easy-pedal': {
    desc: 'Una pedalata tranquilla sulla cyclette, a ritmo piacevole e con poca resistenza.',
    setup: 'Regola la sella della cyclette all’altezza del bacino e imposta la resistenza al minimo.',
    steps: [
      'Siediti sulla cyclette e metti i piedi sui pedali.',
      'Imposta una resistenza bassa.',
      'Pedala a un ritmo in cui riesci a parlare.',
      'Negli ultimi istanti rallenta piano, poi fermati.',
    ],
    posture: 'Schiena lunga e spalle rilassate. Respira in modo regolare.',
    mistakes: [
      'Evita di tenere la sella troppo bassa.',
      'Evita di mettere troppa resistenza.',
    ],
    safety: 'Se senti dolore o fastidio alle ginocchia, fermati e controlla l’altezza della sella.',
  },
  'elliptical-easy': {
    desc: 'Un movimento fluido sull’ellittica, a ritmo facile e con poca resistenza.',
    setup: 'Sali sull’ellittica e imposta una resistenza bassa, tenendoti alle maniglie.',
    steps: [
      'Sali sull’ellittica e appoggia i piedi sui pedali.',
      'Tieniti alle maniglie e imposta una resistenza bassa.',
      'Muovi braccia e gambe con un ritmo morbido.',
      'Negli ultimi istanti rallenta piano, poi fermati.',
    ],
    posture: 'Busto dritto e sguardo avanti. Respira con regolarità e resta a un ritmo in cui riesci a parlare.',
    mistakes: [
      'Evita di appoggiarti con tutto il peso alle maniglie.',
      'Evita di mettere troppa resistenza.',
    ],
    safety: null,
  },
  'stepper-easy': {
    desc: 'Passi piccoli e regolari sul mini stepper, a ritmo facile.',
    setup: 'Metti il mini stepper su una superficie piana e antiscivolo, e tieniti a un appoggio vicino.',
    steps: [
      'Sali sul mini stepper, con un piede per pedale.',
      'Tieniti a un appoggio, se ti serve.',
      'Fai passi piccoli e regolari, senza affondare i pedali.',
      'Cambia ritmo solo se ti senti comoda.',
    ],
    posture: 'Busto dritto e sguardo avanti. Respira con regolarità e resta a un ritmo in cui riesci a parlare.',
    mistakes: [
      'Evita di affondare troppo i pedali.',
      'Evita di appoggiarti con tutto il peso alle mani.',
    ],
    safety: 'Se senti dolore o fastidio alle ginocchia, fermati.',
  },
  'step-jack': {
    desc: 'Apri e chiudi gambe e braccia con un passo di lato, senza salti.',
    setup: 'Libera uno spazio attorno a te e mettiti in piedi con i piedi uniti e le braccia lungo il corpo.',
    steps: [
      'Stai in piedi, con i piedi uniti e le braccia lungo il corpo.',
      'Fai un passo di lato con un piede, alzando le braccia sopra la testa.',
      'Riporta il piede accanto all’altro e abbassa le braccia.',
      'Ripeti dall’altro lato, a un ritmo comodo.',
    ],
    posture: 'Busto dritto e spalle rilassate. Respira in modo regolare, senza trattenere il fiato.',
    mistakes: [
      'Evita di fare passi troppo lunghi.',
      'Evita di sollevare le spalle verso le orecchie.',
    ],
    safety: null,
  },
  'jumping-jack': {
    desc: 'Salti leggeri aprendo e chiudendo gambe e braccia: un esercizio vivace per scaldare il corpo.',
    setup: 'Libera uno spazio attorno a te, su un pavimento non scivoloso, e metti scarpe comode.',
    steps: [
      'Stai in piedi, con i piedi uniti e le braccia lungo il corpo.',
      'Salta leggera aprendo le gambe e alzando le braccia sopra la testa.',
      'Salta di nuovo riportando i piedi uniti e le braccia giù.',
      'Mantieni un ritmo comodo per il tempo indicato.',
    ],
    posture: 'Atterra morbida sulle punte, con le ginocchia leggere. Respira con regolarità e non trattenere il fiato.',
    mistakes: [
      'Evita di atterrare a gambe rigide.',
      'Evita di fare salti troppo alti.',
    ],
    safety: 'Se hai dolore alle ginocchia o alle caviglie, scegli la versione senza salti.',
  },
  'jump-rope': {
    desc: 'Piccoli saltelli con la corda, a un ritmo leggero e regolare.',
    setup: 'Prendi la corda e libera uno spazio attorno a te, su un pavimento non scivoloso, con scarpe comode.',
    steps: [
      'Stai in piedi, con i gomiti vicini ai fianchi e la corda dietro di te.',
      'Gira la corda con i polsi, passandola sopra la testa.',
      'Salta leggera, solo il necessario per far passare la corda.',
      'Mantieni un ritmo comodo per il tempo indicato.',
    ],
    posture: 'Atterra morbida sulle punte, con le ginocchia leggere. Respira con regolarità e non trattenere il fiato.',
    mistakes: [
      'Evita di saltare troppo in alto.',
      'Evita di girare la corda con tutto il braccio.',
    ],
    safety: 'Se hai dolore alle ginocchia o alle caviglie, scegli la versione senza salti.',
  },

  // ---------------------------------------------------------------- defaticamento e stretching
  'child-pose': {
    desc: 'Una posizione di riposo, seduta sui talloni, per rilassare schiena e anche.',
    setup: 'Stendi il tappetino e inginocchiati, con i piedi indietro e le ginocchia un po’ larghe.',
    steps: [
      'Inginocchiati sul tappetino e siediti sui talloni.',
      'Allarga un po’ le ginocchia, se ti serve più spazio.',
      'Porta il busto in avanti e allunga le braccia davanti a te.',
      'Appoggia la fronte a terra e respira piano.',
    ],
    posture: 'Lascia andare il peso e rilassa le spalle. Respira lentamente, espirando piano.',
    mistakes: [
      'Evita di forzare la posizione.',
      'Evita di trattenere il respiro.',
    ],
    safety: 'Se senti dolore o fastidio alle ginocchia, metti un cuscino sotto di esse o fermati.',
  },
  'hamstring-stretch': {
    desc: 'Un allungamento dolce per la parte dietro della coscia.',
    setup: 'Mettiti in piedi davanti a un gradino basso o a una sedia stabile, dove appoggiare un tallone.',
    steps: [
      'Appoggia un tallone su un gradino basso, con la gamba quasi tesa.',
      'Tieni la schiena lunga e le mani sulla coscia.',
      'Porta un po’ il busto in avanti, fino a sentire un tirare leggero.',
      'Resta ferma, poi cambia gamba.',
    ],
    posture: 'Schiena lunga, senza arrotondarla. Respira piano e profondamente, espirando mentre ti rilassi.',
    mistakes: [
      'Evita di forzare l’allungamento.',
      'Evita di arrotondare la schiena per arrivare più giù.',
    ],
    safety: 'Se senti dolore o fastidio, fermati. Deve restare solo un tirare leggero.',
  },
  'quad-stretch': {
    desc: 'Un allungamento dolce per la parte davanti della coscia.',
    setup: 'Mettiti in piedi accanto a un muro o a una sedia, per tenerti con una mano.',
    steps: [
      'Stai in piedi e tieniti con una mano a un appoggio.',
      'Piega un ginocchio e porta il tallone verso il gluteo.',
      'Prendi il piede con la mano e tieni le ginocchia vicine.',
      'Resta ferma, poi cambia gamba.',
    ],
    posture: 'Busto dritto e bacino in avanti. Respira piano e profondamente.',
    mistakes: [
      'Evita di tirare il piede con forza.',
      'Evita di inarcare la schiena.',
    ],
    safety: 'Se senti dolore o fastidio alle ginocchia, o ti senti instabile, fermati e tieniti a un appoggio.',
  },
  'chest-stretch': {
    desc: 'Apri il petto portando le mani dietro la schiena, per rilassare spalle e petto.',
    setup: 'Mettiti in piedi, con i piedi alla larghezza dei fianchi e un po’ di spazio attorno a te.',
    steps: [
      'Stai in piedi, con i piedi alla larghezza dei fianchi.',
      'Intreccia le mani dietro la schiena.',
      'Apri il petto e allunga le braccia verso il basso.',
      'Resta ferma e respira piano.',
    ],
    posture: 'Spalle rilassate e collo lungo. Respira piano e profondamente.',
    mistakes: [
      'Evita di inarcare la schiena.',
      'Evita di alzare le braccia più di quanto sia comodo.',
    ],
    safety: 'Se senti dolore o fastidio alle spalle, abbassa le braccia o fermati.',
  },
  'deep-breathing': {
    desc: 'Respiri lenti e profondi, per calmarti e chiudere con dolcezza l’allenamento.',
    setup: 'Mettiti in piedi in un punto tranquillo, con i piedi alla larghezza dei fianchi e le spalle rilassate.',
    steps: [
      'Stai in piedi, con una mano sulla pancia.',
      'Inspira piano dal naso e senti la pancia gonfiarsi.',
      'Espira lentamente dalla bocca, svuotando la pancia.',
      'Ripeti a un ritmo calmo, restando rilassata.',
    ],
    posture: 'Spalle morbide e busto dritto. Il respiro è lento, senza forzare.',
    mistakes: [
      'Evita di respirare troppo in fretta.',
      'Evita di alzare le spalle quando inspiri.',
    ],
    safety: 'Se ti gira la testa, torna a respirare normalmente e siediti.',
  },
};
