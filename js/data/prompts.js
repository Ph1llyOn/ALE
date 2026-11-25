// Spunti per la scrittura guidata: gentili, aperti, mai valutativi.
export const PROMPTS = [
  'Qual è stato il momento più bello di oggi, anche se piccolissimo?',
  'Una cosa per cui ti senti grata in questo momento.',
  'Come stai davvero, oggi? Scrivilo senza giudicarti.',
  'Cosa ti ha fatto sorridere nelle ultime ore?',
  'Se potessi dire una cosa gentile a te stessa, quale sarebbe?',
  'Cosa ti piacerebbe fare con calma nei prossimi giorni?',
  'Un piccolo passo che hai fatto di recente e di cui sei contenta.',
  'Che cosa ti ha dato energia oggi? E cosa te l’ha tolta?',
  'Descrivi un posto in cui ti senti al sicuro.',
  'Una cosa che vorresti ricordare di questo periodo.',
  'Cosa ti fa stare bene quando la giornata è pesante?',
  'Scrivi liberamente: tre cose che hai notato oggi.',
];

export const pickPrompt = (seed = 0) => PROMPTS[Math.abs(seed) % PROMPTS.length];
