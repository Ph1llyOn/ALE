// #/tutorial — tutorial iniziale di Alessia: sette schermate con piccole animazioni che spiegano davvero ciò che c'è nell'app.
// Solo per Alessia. Si può saltare, uscire e riprendere: lo stato è salvato sull'account (user_settings), non sul dispositivo.
// Con ?replay=1 (dal Profilo) si rivede sempre dall'inizio e non cambia lo stato salvato.
import { h, logo, toast, errorBox, withBusy } from '../../core/ui.js';
import { icon } from '../../components/icons.js';
import { exerciseArt } from '../../components/exercise-art.js';
import { getState } from '../../core/store.js';
import { getSettings, saveTour } from '../../core/api-settings.js';
import { navigate } from '../../core/router.js';
import { profileErrorView } from '../../components/profile-error.js';

// --- piccole animazioni esplicative (solo CSS, nelle classi tour-*; con prefers-reduced-motion restano statiche e leggibili)
const welcomeArt = () => h('div', { class: 'tour-art tour-welcome' }, logo('lg'));

const homeArt = () => h('div', { class: 'tour-art tour-stack' },
  h('div', { class: 'tour-item card-row' }, h('span', { class: 'tour-chip' }, icon('spark', { size: 16 })), h('span', null, 'Il pensiero di oggi, in alto')),
  h('div', { class: 'tour-item card-row' }, h('span', { class: 'tour-chip' }, icon('heart', { size: 16 })), h('span', null, 'Biglietti di Phill')),
  h('div', { class: 'tour-item card-row' }, h('span', { class: 'tour-chip' }, icon('check', { size: 16 })), h('span', null, 'Il tuo giorno')));

const workoutArt = () => h('div', { class: 'tour-art tour-workout' },
  h('div', { class: 'tour-exercise' }, exerciseArt('march', { className: 'exercise-art', animated: true })),
  h('div', { class: 'tour-seq' },
    ['Inizia esercizio', 'Serie completata', 'Recupero', 'Feedback facoltativo'].map((t, i) => h('span', { class: `tour-step tour-i${i}` }, t))));

const calendarArt = () => h('div', { class: 'tour-art tour-calendar' },
  h('div', { class: 'tour-proposal' },
    h('p', { class: 'small muted' }, 'Proposta da Phill'),
    h('div', { class: 'tour-btns' }, h('span', { class: 'btn tour-press' }, 'Accetta'), h('span', { class: 'btn btn-text' }, 'Non ora'))),
  h('div', { class: 'tour-event' }, h('span', { class: 'tour-dotday' }), h('span', null, 'Allenamento · 18:30')));

const diaryArt = () => h('div', { class: 'tour-art tour-diary' },
  h('div', { class: 'tour-moods', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5].map((n) => h('span', { class: `tour-mood tour-i${n - 1}${n === 4 ? ' picked' : ''}` }, String(n)))),
  h('div', { class: 'tour-lines' }, h('span'), h('span'), h('span')),
  h('p', { class: 'tour-lock small muted' }, icon('shield', { size: 14 }), ' Voce privata'));

const profileArt = () => h('div', { class: 'tour-art tour-stack' },
  h('div', { class: 'tour-item card-row tour-hl tour-i0' }, 'Attrezzatura e spazi'),
  h('div', { class: 'tour-item card-row tour-hl tour-i1' }, 'Impostazioni'),
  h('div', { class: 'tour-item card-row tour-hl tour-i2' }, 'Privacy e dati'));

const endArt = () => h('div', { class: 'tour-art tour-end', 'aria-hidden': 'true' }, icon('heart', { size: 56, className: 'icon tour-heart' }));

export const SLIDES = [
  { key: 'benvenuta', title: 'Benvenuta in ALE.', art: welcomeArt,
    text: 'Un posto tutto tuo per allenarti con calma, tenere d’occhio come stai e restare in contatto con Phill, quando e come decidi tu.',
    points: ['Bastano pochi minuti. Puoi fermarti e riprendere quando vuoi.'] },
  { key: 'home', title: 'La Home', art: homeArt,
    text: 'Ogni giorno trovi il pensiero del giorno, i biglietti di Phill e «Il tuo giorno», un riepilogo di ciò che conta adesso.',
    points: ['Il pensiero del giorno si adatta a come ti senti, se lo indichi e se hai attivato l’AI.', 'I biglietti di Phill arrivano qui e restano leggibili.'] },
  { key: 'attivita', title: 'Attività', art: workoutArt,
    text: 'Apri una scheda e segui la sessione passo per passo. Il tempo parte solo quando premi «Inizia esercizio».',
    points: ['«Serie completata» segna la serie con un solo tocco.', 'Tra una serie e l’altra c’è il recupero: puoi saltarlo quando vuoi.', 'Alla fine puoi lasciare un feedback facoltativo, che resta solo tuo.'] },
  { key: 'calendario', title: 'Calendario', art: calendarArt,
    text: 'Vedi i tuoi impegni per mese o per settimana. Le proposte di Phill compaiono qui, ma non entrano nel calendario senza il tuo sì.',
    points: ['«Accetta» aggiunge l’evento; «Non ora» mette da parte la proposta.', 'Gli impegni che crei o modifichi li gestisci tu, e puoi eliminarli.'] },
  { key: 'diario', title: 'Benessere, diario e AI', art: diaryArt,
    text: 'Puoi indicare come ti senti e scrivere nel diario. Sono spazi tuoi: nessuna voce viene condivisa in automatico.',
    points: ['Umore ed energia si indicano in Benessere: le note restano private.', 'Una voce si condivide con Phill solo se la scegli tu, una per una.', 'L’assistente AI è facoltativo: funziona solo con i consensi che dai in Impostazioni. I testi li scrive Gemini di Google.'] },
  { key: 'profilo', title: 'Profilo e controllo', art: profileArt,
    text: 'Dal Profilo gestisci le tue cose. Le informazioni restano tue: decidi tu cosa condividere, e puoi cambiarlo quando vuoi.',
    points: ['Attrezzatura e spazi: cosa hai a disposizione.', 'Impostazioni: notifiche, intelligenza artificiale, PIN e aspetto.', 'Privacy e dati: cosa condividi, l’esportazione dei tuoi dati e l’eliminazione dell’account.'] },
  { key: 'fine', title: 'Il riposo conta quanto l’attività', art: endArt,
    text: 'Non c’è nessuna gara da vincere. Un giorno di riposo è una scelta giusta, e a volte il passo migliore è fermarsi.',
    points: ['Puoi rivedere questo tutorial dal Profilo, quando vuoi.'] },
];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isInteger(n) ? n : lo));

export default async function tutorialView() {
  const query = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const replay = query.get('replay') === '1';
  const { profile } = getState();
  if (!profile) return profileErrorView(getState().loadError);
  if (profile.role !== 'alessia') {
    queueMicrotask(() => navigate('/home', { replace: true }));
    return h('main', { class: 'shell' });
  }

  let settings;
  try { settings = await getSettings(profile.id); } catch (err) { return h('main', { class: 'shell tutorial' }, errorBox(err.message, { onRetry: () => location.reload() })); }

  // Già completato o saltato: non si ripropone da sé (si può rivedere solo dal Profilo).
  if (!replay && settings.app_tour_status && settings.app_tour_status !== 'in_progress') {
    queueMicrotask(() => navigate('/home', { replace: true }));
    return h('main', { class: 'shell' });
  }

  const resumeAt = !replay && settings.app_tour_status === 'in_progress' ? clamp(settings.app_tour_step, 0, SLIDES.length - 1) : 0;
  let index = resumeAt;
  const main = h('main', { class: 'shell tutorial' });
  const last = SLIDES.length - 1;
  const exitTarget = replay ? '/profilo' : '/home';

  // Salva il punto raggiunto. In revisione (replay) non tocca lo stato. Non blocca mai la navigazione.
  async function persist(status) {
    if (replay) return true;
    try { await saveTour(profile.id, { status, step: index }); return true; } catch {
      toast('Non sono riuscito a salvare il punto del tutorial. Lo ritroverai dal Profilo.', 'error');
      return false;
    }
  }

  function show() {
    const s = SLIDES[index];
    const dots = h('div', { class: 'steps', role: 'img', 'aria-label': `Schermata ${index + 1} di ${SLIDES.length}` },
      SLIDES.map((_, i) => h('span', { class: `step-dot${i <= index ? ' on' : ''}` })));
    const title = h('h2', { class: 'page-title tour-title', tabindex: '-1', 'data-focus': true }, s.title);
    const card = h('section', { class: 'card stack tour-card', 'aria-live': 'off' },
      s.art(), title, h('p', { class: 'muted' }, s.text),
      h('ul', { class: 'tour-points' }, s.points.map((p) => h('li', null, p))));

    const back = h('button', { class: 'btn btn-secondary', type: 'button', disabled: index === 0 || undefined, onclick: () => { index -= 1; persist('in_progress'); show(); } }, 'Indietro');
    const next = h('button', { class: 'btn', type: 'button', onclick: () => withBusy(next, async () => {
      if (index < last) { index += 1; persist('in_progress'); show(); return; }
      const ok = await persist('done');
      if (ok || replay) navigate(exitTarget, { replace: true });
    }) }, index === last ? 'Iniziamo' : 'Avanti');
    const exit = h('button', { class: 'btn btn-text btn-block', type: 'button', onclick: async () => { await persist('in_progress'); navigate(exitTarget, { replace: true }); } },
      replay ? 'Chiudi' : 'Esci e riprendi dopo');
    const skip = replay ? null : h('button', { class: 'btn btn-text btn-block', type: 'button', onclick: async () => { await persist('skipped'); navigate(exitTarget, { replace: true }); } }, 'Salta il tutorial');

    main.replaceChildren(dots, card, h('div', { class: 'tour-nav' }, back, next), exit, skip);
    queueMicrotask(() => title.focus({ preventScroll: false }));
  }

  show();
  return main;
}
