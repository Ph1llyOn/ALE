// #/attivita/sessione?id=… — allenamento in corso: checklist, avanzamento, cronometro, salvataggio automatico e riepilogo.
import { h, errorBox, withBusy, toast, textField, field } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { getSession, getWorkout, setExerciseDone, addSessionExercise, saveSessionNotes, finishSession, discardSession } from '../../core/api-activities.js';
import { pageHeader } from '../../components/controls.js';
import { ring, exerciseThumb, hero } from '../../components/visuals.js';
import { profileErrorView } from '../../components/profile-error.js';
import { icon } from '../../components/icons.js';
import { EXERCISES } from '../../data/exercises.js';
import { navigate } from '../../core/router.js';
import { fmtDateTime } from '../../core/format.js';

const keyFor = (name) => EXERCISES.find((e) => e.name === name)?.id ?? null;
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

export default async function sessionView({ query }) {
  const { profile } = getState();
  if (!profile) return profileErrorView(getState().loadError);
  const back = { href: '#/attivita', label: 'Attività' };
  let session; let details = new Map();
  try {
    session = await getSession(query.id);
    if (session?.workout_id) {
      const w = await getWorkout(session.workout_id);
      details = new Map((w?.workout_exercises ?? []).map((e) => [e.name, e]));
    }
  } catch (err) { return h('main', { class: 'shell with-tabs' }, pageHeader({ title: 'Allenamento', back }), errorBox(err.message)); }
  if (!session) return h('main', { class: 'shell with-tabs' }, pageHeader({ title: 'Allenamento', back }), errorBox('Non trovo questo allenamento.'));

  const main = h('main', { class: 'shell with-tabs' });

  // ---------------------------------------------------------------- riepilogo (completato)
  const summary = (s) => {
    const done = s.session_exercise_progress.filter((p) => p.done).length;
    const total = s.session_exercise_progress.length;
    const minutes = Math.max(1, Math.round((new Date(s.ended_at) - new Date(s.started_at)) / 60000));
    return [
      hero({ eyebrow: 'Allenamento finito', title: 'Che bel', accent: 'passo avanti', text: `${s.title} · ${fmtDateTime(s.started_at)}`, cta: { label: 'Torna alle attività', href: '#/attivita' } }),
      h('section', { class: 'stat-row' },
        h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(minutes)), h('span', { class: 'stat-label' }, 'minuti')),
        h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, `${done}/${total}`), h('span', { class: 'stat-label' }, 'esercizi fatti')),
        h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, total ? `${Math.round((done / total) * 100)}%` : '—'), h('span', { class: 'stat-label' }, 'della scheda'))),
      h('section', { class: 'list-card' }, s.session_exercise_progress.map((p) => h('div', { class: `list-row${p.done ? '' : ' exercise-done'}` },
        h('span', { class: 'list-icon' }, icon(p.done ? 'check' : 'clock')), h('span', { class: 'grow list-title' }, p.name)))),
      s.notes ? h('section', { class: 'card' }, h('p', { class: 'card-title' }, 'Le tue note'), h('p', { class: 'ticket-body-plain' }, s.notes)) : null,
    ].filter(Boolean);
  };

  if (session.status === 'completed') {
    main.append(pageHeader({ title: 'Riepilogo', back }), ...summary(session));
    return main;
  }

  // ---------------------------------------------------------------- in corso
  const rows = [...session.session_exercise_progress];
  const startedAt = new Date(session.started_at).getTime();
  const timer = h('span', { class: 'display' }, clock(Date.now() - startedAt));
  const progressHost = h('section', { class: 'card goal-card' });
  const listHost = h('section', { class: 'list-card' });

  const tick = setInterval(() => { if (!timer.isConnected) { clearInterval(tick); return; } timer.textContent = clock(Date.now() - startedAt); }, 1000);

  function paintProgress() {
    const done = rows.filter((r) => r.done).length;
    progressHost.replaceChildren(
      ring({ percent: rows.length ? (done / rows.length) * 100 : 0, label: `${done}/${rows.length}`, ariaLabel: `${done} esercizi su ${rows.length}` }),
      h('div', { class: 'goal-main' }, h('p', { class: 'card-title' }, 'A che punto sei'), h('p', { class: 'muted' }, 'Ogni spunta si salva da sola: puoi uscire e riprendere quando vuoi.'),
        h('div', { class: 'progress-bar', role: 'progressbar', 'aria-valuenow': String(done), 'aria-valuemin': '0', 'aria-valuemax': String(rows.length) }, h('span', { class: 'bar-fill', 'data-w': String(rows.length ? Math.round((done / rows.length) * 100) : 0) }))));
    const fill = progressHost.querySelector('.bar-fill');
    if (fill) fill.style.width = `${fill.dataset.w}%`;
  }

  function paintList() {
    if (!rows.length) { listHost.replaceChildren(h('div', { class: 'card muted center' }, 'Aggiungi il primo esercizio qui sotto.')); return; }
    listHost.replaceChildren(...rows.map((r) => {
      const d = details.get(r.name);
      const meta = d ? [d.sets ? `${d.sets} serie` : null, d.reps ? `${d.reps}` : null, d.rest_seconds ? `pausa ${d.rest_seconds}s` : null].filter(Boolean).join(' · ') : '';
      const btn = h('button', { class: 'check', type: 'button', 'aria-pressed': String(r.done), 'aria-label': `${r.name}: ${r.done ? 'fatto' : 'da fare'}`,
        onclick: async () => {
          const next = !r.done;
          r.done = next; paintList(); paintProgress();      // risposta immediata…
          try { await setExerciseDone(r.id, next); }       // …e salvataggio automatico
          catch (err) { r.done = !next; paintList(); paintProgress(); toast(err.message, 'error'); }
        } }, icon('check', { size: 18 }));
      return h('div', { class: `exercise-row${r.done ? ' exercise-done' : ''}` }, exerciseThumb(keyFor(r.name)),
        h('div', { class: 'grow' }, h('p', { class: 'list-title' }, r.name), meta ? h('p', { class: 'muted small' }, meta) : null, d?.notes ? h('p', { class: 'muted small' }, d.notes) : null), btn);
    }));
  }

  const addName = field({ id: 's-add', label: 'Aggiungi un esercizio', maxlength: 120, required: false, autocomplete: 'off' });
  const addBtn = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => withBusy(addBtn, async () => {
    const n = addName.input.value.trim();
    addName.setError(n ? null : 'Scrivi il nome dell’esercizio.');
    if (!n) return;
    try { rows.push(await addSessionExercise(profile.id, session.id, n, rows.length)); addName.input.value = ''; paintList(); paintProgress(); }
    catch (err) { toast(err.message, 'error'); }
  }) }, 'Aggiungi');

  const notes = textField({ id: 's-notes', label: 'Come è andata? (facoltativo)', rows: 3, maxlength: 2000, value: session.notes ?? '' });
  notes.input.addEventListener('blur', () => { saveSessionNotes(session.id, notes.input.value).catch((e) => console.warn('note', e)); });

  const finish = h('button', { class: 'btn btn-block', type: 'button', onclick: () => withBusy(finish, async () => {
    try {
      await finishSession(profile.id, session, notes.input.value);
      clearInterval(tick);
      main.replaceChildren(pageHeader({ title: 'Riepilogo', back }), ...summary(await getSession(session.id)));
      window.scrollTo(0, 0);
    } catch (err) { toast(err.message, 'error'); }
  }) }, 'Finisci l’allenamento');
  const discard = h('button', { class: 'btn btn-text btn-danger-text', type: 'button', onclick: () => {
    if (discard.dataset.armed !== '1') { discard.dataset.armed = '1'; discard.textContent = 'Tocca ancora per annullare l’allenamento'; return; }
    withBusy(discard, async () => { try { await discardSession(session.id); clearInterval(tick); toast('Allenamento annullato.'); navigate('/attivita'); } catch (err) { toast(err.message, 'error'); } });
  } }, 'Annulla l’allenamento');

  paintProgress(); paintList();
  main.append(pageHeader({ title: session.title, eyebrow: 'Allenamento in corso', back }),
    h('section', { class: 'card center' }, h('p', { class: 'muted' }, 'Tempo'), timer), progressHost, listHost,
    h('section', { class: 'card stack' }, h('div', { class: 'row' }, h('div', { class: 'grow' }, addName.wrap), addBtn)),
    h('section', { class: 'card stack' }, notes.wrap), finish, h('div', { class: 'row-center' }, discard));
  return main;
}
