// #/attivita/sessione?id=… — allenamento guidato. Una schermata per volta, controlli grandi, niente da toccare a ogni ripetizione.
// Il tempo si ricostruisce dai timestamp salvati (session-core.js): se l'app si sospende o si ricarica si riprende dal punto esatto.
import { h, errorBox, toast, withBusy, chip } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { loadGuidedSession, saveRunState, closeGuidedSession, saveFeedback, getSessionFeedback } from '../../core/api-training.js';
import { pageHeader } from '../../components/controls.js';
import { hero } from '../../components/visuals.js';
import { exerciseArt } from '../../components/exercise-art.js';
import { profileErrorView } from '../../components/profile-error.js';
import { icon } from '../../components/icons.js';
import { exerciseById } from '../../data/exercises.js';
import { TEXTS, MUSCLE_LABELS, FLAG_LABELS, LEVEL_LABELS } from '../../data/exercise-texts.js';
import { navigate } from '../../core/router.js';
import { fmtDateTime } from '../../core/format.js';
import * as core from './session-core.js';

const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const PHASE_LABEL = { warmup: 'Riscaldamento', main: 'Parte principale', cardio: 'Cardio', cooldown: 'Defaticamento' };
const STATUS_LABEL = { done: 'Fatto', partial: 'In parte', skipped: 'Saltato', stopped: 'Interrotto', pending: 'Non iniziato', active: 'In corso' };
export const FEEDBACK_OPTIONS = [
  ['too_easy', 'Troppo facile'], ['right', 'Giusto'], ['hard', 'Abbastanza difficile'], ['too_hard', 'Troppo difficile'],
  ['pain', 'Ho provato fastidio o dolore'], ['not_completed', 'Non sono riuscita a completarlo'],
];
const shadowKey = (id) => `ale-session-${id}`;
const readShadow = (id) => { try { return JSON.parse(localStorage.getItem(shadowKey(id)) ?? 'null'); } catch { return null; } };
const writeShadow = (id, s) => { try { localStorage.setItem(shadowKey(id), JSON.stringify(s)); } catch { /* facoltativo */ } };
const clearShadow = (id) => { try { localStorage.removeItem(shadowKey(id)); } catch { /* facoltativo */ } };

let audio = null;
function beep() {
  try {
    audio ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    const o = audio.createOscillator(); const g = audio.createGain();
    o.frequency.value = 660; g.gain.value = 0.08; o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.25);
  } catch { /* nessun suono: va bene lo stesso */ }
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* facoltativo */ }
}

export default async function sessionView({ query }) {
  const { profile } = getState();
  if (!profile) return profileErrorView(getState().loadError);
  const back = { href: '#/attivita', label: 'Attività' };
  let session;
  try { session = await loadGuidedSession(query.id); } catch (err) { return h('main', { class: 'shell with-tabs' }, pageHeader({ title: 'Allenamento', back }), errorBox(err.message)); }
  if (!session) return h('main', { class: 'shell with-tabs' }, pageHeader({ title: 'Allenamento', back }), errorBox('Non trovo questo allenamento.'));

  // Le sessioni nate prima dell'allenamento guidato non hanno un piano: lo ricaviamo dagli esercizi già scritti.
  const plan = session.plan ?? { title: session.title, items: session.session_exercise_progress.map((p) => ({ exercise_key: p.exercise_key, name: p.name, phase: 'main', mode: 'reps', sets: 1, n: 1, reps: '1', rest_seconds: 0, per_side: false })) };
  const main = h('main', { class: 'shell with-tabs session' });
  const now = () => Date.now();

  // ---------------------------------------------------------------- già conclusa
  if (session.status !== 'in_progress') {
    const feedback = await getSessionFeedback(session.id).catch(() => new Map());
    main.append(pageHeader({ title: 'Riepilogo', back }), ...summaryView(session, plan, session.run_state ?? null, feedback));
    return main;
  }

  // ---------------------------------------------------------------- stato (server + copia locale per sicurezza)
  let state = core.sanitize(session.run_state, plan, now());
  const shadow = readShadow(session.id);
  if (shadow && core.sanitize(shadow, plan, now()) === shadow && (shadow.ts ?? 0) > (state.ts ?? 0)) state = shadow;
  state = core.tick(state, plan, now());
  let saved = state; let saving = Promise.resolve(); let dirty = false;
  const saveIndicator = h('p', { class: 'muted small center', role: 'status' });
  let feedbackMap = await getSessionFeedback(session.id).catch(() => new Map());
  let wakeLock = null;

  const persist = () => {
    const snapshot = state; const before = saved;
    writeShadow(session.id, snapshot);
    saving = saving.then(async () => {
      try {
        await saveRunState(session, before, snapshot);
        saved = snapshot; dirty = false; saveIndicator.textContent = '';
        if (snapshot.stage === 'finished' && session.status === 'in_progress') { session.status = 'completed'; await closeGuidedSession(profile.id, session, 'completed', snapshot); clearShadow(session.id); }
        if (snapshot.stage === 'stopped' && session.status === 'in_progress') { session.status = 'stopped'; await closeGuidedSession(profile.id, session, 'stopped', snapshot); clearShadow(session.id); }
      } catch (err) { dirty = true; saveIndicator.textContent = 'Non riesco a salvare ora: riprovo appena torna la connessione.'; console.warn('salvataggio sessione', err); }
    });
    return saving;
  };
  const retry = () => { if (dirty) persist(); };
  window.addEventListener('online', retry);

  const commit = (next) => {
    if (next === state) return;
    const prevStage = state.stage;
    state = { ...next, ts: now() };
    if (state.stage === 'timeup' && prevStage !== 'timeup') beep();
    paint(); persist();
  };
  const act = (fn) => () => commit(fn(state, plan, now()));

  async function lockScreen() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; } }

  // ---------------------------------------------------------------- pezzi di interfaccia
  const bigButton = (label, onClick, kind = '') => h('button', { class: `btn btn-block session-main-btn${kind ? ` ${kind}` : ''}`, type: 'button', onclick: onClick }, label);
  const textButton = (label, onClick) => h('button', { class: 'btn btn-text btn-block', type: 'button', onclick: onClick }, label);
  const item = () => plan.items[state.index];
  const cat = () => (item().exercise_key ? exerciseById(item().exercise_key) : null);
  const volume = (it) => (it.mode === 'time' ? (it.seconds >= 120 ? `${Math.round(it.seconds / 60)} minuti` : `${it.seconds} secondi`) : `${it.n} ripetizioni`) + (it.per_side ? ' per lato' : '');

  function progressBar() {
    const total = plan.items.length; const done = state.progress.filter((p) => ['done', 'partial', 'skipped'].includes(p.status)).length;
    const idx = Math.min(state.index + 1, total);
    return h('div', { class: 'session-progress' }, h('span', { class: 'muted small' }, `Esercizio ${idx} di ${total}`),
      h('div', { class: 'progress-bar', role: 'progressbar', 'aria-valuenow': String(done), 'aria-valuemin': '0', 'aria-valuemax': String(total) }, h('span', { class: 'bar-fill', style: `width:${Math.round((done / total) * 100)}%` })));
  }

  function details(it) {
    const t = it.exercise_key ? TEXTS[it.exercise_key] : null; const c = cat();
    if (!t && !it.notes) return null;
    return h('details', { class: 'session-details' }, h('summary', null, 'Come si fa'),
      h('div', { class: 'stack' },
        t?.desc ? h('p', null, t.desc) : null,
        t?.steps?.length ? h('ol', { class: 'steps-list' }, t.steps.map((x) => h('li', null, x))) : null,
        t?.posture ? h('p', { class: 'muted' }, t.posture) : null,
        t?.mistakes?.length ? h('div', null, h('p', { class: 'card-title' }, 'Da evitare'), h('ul', { class: 'plain-list' }, t.mistakes.map((x) => h('li', { class: 'muted' }, x)))) : null,
        t?.safety ? h('p', { class: 'notice' }, t.safety) : null,
        c ? h('p', { class: 'muted small' }, `Livello: ${LEVEL_LABELS[c.level]} · Lavora su: ${c.muscles.map((m) => MUSCLE_LABELS[m]).join(', ')}${c.flags.length ? ` · Attenzione a: ${c.flags.map((f) => FLAG_LABELS[f]).join(', ')}` : ''}`) : null,
        it.notes && !t ? h('p', { class: 'muted' }, it.notes) : null));
  }

  const equipmentLine = (it) => (it.equipment?.length ? h('p', { class: 'chips' }, h('span', { class: 'muted small' }, 'Ti serve:'), ...it.equipment.map((e) => chip(e))) : h('p', { class: 'muted small' }, 'Non ti serve nessun attrezzo.'));

  function feedbackCard(index) {
    const p = plan.items[index]; if (!p?.exercise_key) return null;
    const current = feedbackMap.get(p.exercise_key);
    const wrap = h('section', { class: 'card stack session-feedback' }, h('p', { class: 'card-title' }, `Com’è andata con «${p.name}»?`), h('p', { class: 'muted small' }, 'Facoltativo, e resta solo tuo. Serve a scegliere meglio le prossime volte.'));
    const opts = h('div', { class: 'chips' });
    const note = h('textarea', { class: 'input textarea', rows: 2, maxlength: 500, placeholder: 'Una nota, se ti va', 'aria-label': 'Nota facoltativa', value: current?.note ?? '' });
    note.value = current?.note ?? '';
    const advice = h('p', { class: 'notice', hidden: true }, 'Hai fatto bene a dirlo. Quando senti dolore o fastidio fermati: non serve insistere. Se ti ricapita, parlane con il professionista che ti segue. Non ti proporrò questo esercizio per un po’.');
    const send = async (rating) => {
      try { await saveFeedback(profile.id, session.id, p.exercise_key, rating, note.value); feedbackMap.set(p.exercise_key, { rating, note: note.value }); mark(rating); toast('Grazie, l’ho segnato.', 'success'); }
      catch (err) { toast(err.message, 'error'); }
    };
    const buttons = FEEDBACK_OPTIONS.map(([val, text]) => h('button', { class: 'chip chip-btn', type: 'button', 'aria-pressed': String(current?.rating === val), onclick: () => send(val) }, text));
    const mark = (rating) => { buttons.forEach((b, i) => { const on = FEEDBACK_OPTIONS[i][0] === rating; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('chip-on', on); }); advice.hidden = rating !== 'pain'; };
    opts.append(...buttons); if (current) mark(current.rating);
    wrap.append(opts, note, advice);
    note.addEventListener('blur', () => { const r = feedbackMap.get(p.exercise_key)?.rating; if (r) send(r); });
    return wrap;
  }

  // ---------------------------------------------------------------- schermate
  function screenPrepare() {
    const it = item(); const first = state.index === 0 && !state.lastDone;
    const t = it.exercise_key ? TEXTS[it.exercise_key] : null;
    const last = state.lastDone ? state.lastDone : null;
    const doneHead = last ? h('div', { class: 'session-done' }, icon('check', { size: 28 }), h('div', null, h('p', { class: 'card-title' }, last.status === 'done' ? 'Ottimo!' : last.status === 'partial' ? 'Bene così.' : 'Va bene, andiamo avanti.'),
      h('p', { class: 'muted small' }, `${plan.items[last.index].name}: ${STATUS_LABEL[last.status].toLowerCase()}.`))) : null;
    return h('div', { class: 'stack session-screen session-prepare' },
      doneHead, last ? feedbackCard(last.index) : null,
      h('p', { class: 'eyebrow' }, first ? 'Si comincia' : 'Prossimo esercizio'),
      h('p', { class: 'muted small' }, PHASE_LABEL[it.phase] ?? ''),
      h('h1', { class: 'page-title', 'data-focus': true }, it.name),
      exerciseArt(it.exercise_key, { className: 'exercise-art exercise-art-lg' }),
      h('p', { class: 'session-volume' }, `${it.sets} ${it.sets === 1 ? 'serie' : 'serie'} · ${volume(it)}`, it.rest_seconds > 0 && it.sets > 1 ? ` · recupero ${it.rest_seconds}s` : ''),
      it.treadmill ? h('p', { class: 'notice' }, `Tapis roulant: velocità consigliata ${it.treadmill.speed} km/h, inclinazione ${it.treadmill.incline}%. Un ritmo in cui riesci a parlare: regola come preferisci.`) : null,
      equipmentLine(it),
      h('div', { class: 'card stack session-waiting' }, h('p', { class: 'card-title' }, 'Prepara tutto con calma'),
        h('p', null, t?.setup ?? 'Sistema lo spazio e quello che ti serve.'),
        h('p', { class: 'muted small' }, 'Il tempo parte solo quando premi «Inizia esercizio». Non c’è nessun limite per prepararti.')),
      it.why?.length ? h('p', { class: 'muted small' }, `Perché: ${it.why.join(' · ')}`) : null,
      details(it),
      bigButton('Inizia esercizio', () => { lockScreen(); commit(core.startExercise(state, plan, now())); }),
      textButton('Salta questo esercizio', act(core.skipExercise)));
  }

  function setHeader(it) {
    return [progressBar(), h('p', { class: 'eyebrow' }, `${PHASE_LABEL[it.phase] ?? ''}`), h('h1', { class: 'page-title', 'data-focus': true }, it.name),
      exerciseArt(it.exercise_key, { className: 'exercise-art exercise-art-lg' }),
      h('p', { class: 'session-volume' }, `Serie ${state.setNo} di ${it.sets}`)];
  }

  function screenReady() {
    const it = item();
    if (it.mode === 'time') {
      return h('div', { class: 'stack session-screen' }, ...setHeader(it), h('p', { class: 'display session-big' }, volume(it)), equipmentLine(it), details(it),
        state.stage === 'rested' ? h('p', { class: 'notice' }, 'Il recupero è finito. Parti quando sei pronta.') : null,
        bigButton(state.setNo === 1 ? 'Inizia' : 'Inizia serie', act(core.startSet)), textButton('Salta questa serie', act(core.skipSet)));
    }
    return h('div', { class: 'stack session-screen' }, ...setHeader(it), h('p', { class: 'display session-big' }, String(it.n), h('small', null, it.per_side ? 'ripetizioni per lato' : 'ripetizioni')),
      equipmentLine(it), state.stage === 'rested' ? h('p', { class: 'notice' }, 'Il recupero è finito. Quando sei pronta, fai le tue ripetizioni.') : h('p', { class: 'muted' }, 'Fai le ripetizioni con i tuoi tempi. Quando hai finito tocca una volta sola.'),
      details(it), bigButton('Serie completata', act(core.completeSet)), textButton('Salta questa serie', act(core.skipSet)));
  }

  const timerText = h('span', { class: 'display session-clock', 'aria-live': 'off' });
  function screenRunning() {
    const it = item();
    timerText.textContent = clock(core.remainingMs(state, now()));
    return h('div', { class: 'stack session-screen session-timer' }, ...setHeader(it), h('div', { class: 'card center' }, timerText), details(it),
      textButton('Ho finito prima', act(core.completeSet)));
  }
  function screenTimeUp() {
    const it = item();
    return h('div', { class: 'stack session-screen' }, ...setHeader(it), h('div', { class: 'card center' }, h('p', { class: 'display session-big' }, 'Tempo!'), h('p', { class: 'muted' }, 'Conferma tu come è andata la serie.')),
      bigButton('Serie completata', act(core.completeSet)), textButton('Non ce l’ho fatta: salta la serie', act(core.skipSet)));
  }
  function screenRest() {
    const it = item();
    timerText.textContent = clock(core.remainingMs(state, now()));
    return h('div', { class: 'stack session-screen session-rest' }, progressBar(), h('p', { class: 'eyebrow' }, 'Recupero'), h('h1', { class: 'page-title', 'data-focus': true }, 'Riprendi fiato'),
      h('div', { class: 'card center' }, timerText), h('p', { class: 'muted center' }, `Poi: ${it.name}, serie ${state.setNo} di ${it.sets}. Non parte da sola.`),
      exerciseArt(it.exercise_key, { className: 'exercise-art' }), bigButton('Salta il recupero', act((s) => core.skipRest(s))));
  }

  function screenFinished() {
    const last = state.lastDone;
    return h('div', { class: 'stack session-screen' }, ...summaryView({ ...session, status: 'completed', ended_at: new Date().toISOString() }, plan, state, feedbackMap).slice(0, 2),
      last ? feedbackCard(last.index) : null,
      h('a', { class: 'btn btn-block', href: '#/attivita' }, 'Fine'));
  }
  function screenStopped() {
    return h('div', { class: 'stack session-screen' }, h('h1', { class: 'page-title', 'data-focus': true }, 'Allenamento interrotto'), h('p', { class: 'muted' }, 'Quello che hai fatto è salvato. Nessun problema: ci si ferma quando serve.'),
      ...summaryView({ ...session, status: 'stopped' }, plan, state, feedbackMap).slice(1), h('a', { class: 'btn btn-block', href: '#/attivita' }, 'Torna alle attività'));
  }

  function pausedOverlay() {
    return h('div', { class: 'card stack center session-paused' }, h('p', { class: 'card-title' }, 'In pausa'), h('p', { class: 'muted' }, 'Il tempo è fermo. Riprendi quando vuoi.'),
      bigButton('Riprendi', act((s, p, t) => core.resume(s, t))), textButton('Interrompi l’allenamento', () => confirmStop()));
  }

  let stopArmed = false;
  function confirmStop() {
    if (!stopArmed) { stopArmed = true; toast('Tocca ancora per interrompere.'); setTimeout(() => { stopArmed = false; }, 4000); return; }
    stopArmed = false; commit(core.stopSession(state, now()));
  }

  function controls() {
    if (!core.isActive(state) || state.paused) return null;
    return h('div', { class: 'row-center session-controls' },
      state.paused || state.stage === 'prepare' ? null : h('button', { class: 'btn btn-text', type: 'button', onclick: act((s, p, t) => core.pause(s, t)) }, icon('clock', { size: 18 }), ' Pausa'),
      state.stage !== 'prepare' && !state.paused ? h('button', { class: 'btn btn-text', type: 'button', onclick: act(core.skipExercise) }, 'Salta esercizio') : null,
      h('button', { class: 'btn btn-text btn-danger-text', type: 'button', onclick: confirmStop }, 'Interrompi'));
  }

  function paint() {
    let body;
    if (state.stage === 'finished') body = screenFinished();
    else if (state.stage === 'stopped') body = screenStopped();
    else if (state.paused) body = [progressBar(), pausedOverlay()];
    else if (state.stage === 'prepare') body = screenPrepare();
    else if (state.stage === 'ready' || state.stage === 'rested') body = screenReady();
    else if (state.stage === 'running') body = screenRunning();
    else if (state.stage === 'timeup') body = screenTimeUp();
    else body = screenRest();
    main.replaceChildren(pageHeader({ title: plan.title || 'Allenamento', eyebrow: core.isActive(state) ? 'Allenamento in corso' : null, back }), ...[].concat(body), controls(), saveIndicator);
    document.body.classList.toggle('session-active', core.isActive(state));
  }

  // un secondo ogni tanto basta: il tempo vero viene sempre dai timestamp
  const timer = setInterval(() => {
    if (!main.isConnected) { clearInterval(timer); window.removeEventListener('online', retry); document.removeEventListener('visibilitychange', onVisible); document.body.classList.remove('session-active'); wakeLock?.release?.().catch(() => {}); return; }
    const next = core.tick(state, plan, now());
    if (next !== state) { commit(next); return; }
    if (!state.paused && ['running', 'rest'].includes(state.stage)) timerText.textContent = clock(core.remainingMs(state, now()));
  }, 500);
  const onVisible = () => { if (document.visibilityState === 'visible') { const next = core.tick(state, plan, now()); if (next !== state) commit(next); else paint(); if (core.isActive(state) && !state.paused && state.stage !== 'prepare') lockScreen(); retry(); } };
  document.addEventListener('visibilitychange', onVisible);

  paint();
  if (state !== session.run_state) persist();   // allinea il server con ciò che è stato ricostruito (es. timer scaduto mentre l'app era chiusa)
  return main;
}

// ---------------------------------------------------------------- riepilogo
function summaryView(session, plan, state, feedback) {
  const progress = state?.progress ?? session.session_exercise_progress.map((p) => ({ status: p.status, setsDone: p.sets_done, setsSkipped: p.sets_skipped }));
  const sum = core.summarize({ progress }, plan);
  const minutes = Math.max(1, Math.round(((session.ended_at ? new Date(session.ended_at) : new Date()) - new Date(session.started_at)) / 60000));
  const stopped = session.status === 'stopped';
  return [
    hero({ eyebrow: stopped ? 'Allenamento interrotto' : 'Allenamento finito', title: stopped ? 'Hai fatto' : 'Che bel', accent: stopped ? 'quello che potevi' : 'passo avanti', text: `${session.title} · ${fmtDateTime(session.started_at)}`, cta: { label: 'Torna alle attività', href: '#/attivita' } }),
    h('section', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(minutes)), h('span', { class: 'stat-label' }, 'minuti')),
      h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, `${sum.done}/${sum.total}`), h('span', { class: 'stat-label' }, 'esercizi fatti')),
      h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(sum.setsDone)), h('span', { class: 'stat-label' }, 'serie fatte'))),
    h('section', { class: 'list-card' }, plan.items.map((it, i) => {
      const p = progress[i]; const f = it.exercise_key ? feedback?.get?.(it.exercise_key) : null;
      return h('div', { class: `list-row${p.status === 'done' ? '' : ' exercise-done'}` }, h('span', { class: 'list-icon' }, icon(p.status === 'done' ? 'check' : 'clock')),
        h('span', { class: 'grow' }, h('span', { class: 'list-title' }, it.name),
          h('span', { class: 'muted block small' }, `${STATUS_LABEL[p.status] ?? ''}${p.setsDone ? ` · ${p.setsDone}/${it.sets} serie` : ''}${f ? ` · ${FEEDBACK_OPTIONS.find((o) => o[0] === f.rating)?.[1] ?? ''}` : ''}`)));
    })),
  ];
}
void withBusy; void navigate;
