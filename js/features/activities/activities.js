// #/attivita — allenamenti (schede, sessioni, proposte di Phill), abitudini e storico.
import { h, errorBox, emptyState, withBusy, toast, spinner, field } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import {
  listWorkouts, inProgressSession, startSession, getWorkout, listProposals, acceptProposal, rejectProposal, saveWorkout,
  listHabits, addHabit, setHabitDone, archiveHabit, isConsolidated, addWin, listSessions,
} from '../../core/api-activities.js';
import { listEquipment } from '../../core/api-personal.js';
import { getSettings } from '../../core/api-settings.js';
import { segmented, pageHeader } from '../../components/controls.js';
import { hero, ring, exerciseThumb, sectionHead } from '../../components/visuals.js';
import { profileErrorView } from '../../components/profile-error.js';
import { icon } from '../../components/icons.js';
import { suggestWorkout, DEFAULT_HABITS, compatibleExercises } from '../../data/exercises.js';
import { navigate, render } from '../../core/router.js';
import { lastDays, } from '../../core/chart.js';
import { localDay, fmtDayMonth } from '../../core/format.js';

let currentTab = 'schede';

export default async function activitiesView() {
  const { profile } = getState();
  if (!profile) return profileErrorView(getState().loadError);

  let workouts; let session; let proposals; let equipment; let settings;
  try {
    [workouts, session, proposals, equipment, settings] = await Promise.all([
      listWorkouts(profile.id), inProgressSession(profile.id), listProposals(profile.id), listEquipment(profile.id), getSettings(profile.id),
    ]);
  } catch (err) {
    return h('main', { class: 'shell with-tabs' }, pageHeader({ title: 'Attività' }), errorBox(err.message, { onRetry: render }));
  }

  const body = h('div', { class: 'stack' });
  const seg = segmented({
    label: 'Sezioni delle attività',
    options: [{ value: 'schede', label: 'Schede' }, { value: 'abitudini', label: 'Abitudini' }, { value: 'storico', label: 'Cronologia' }],
    value: currentTab, onChange: (v) => { currentTab = v; paint(); },
  });

  const freeBtn = () => h('button', { class: 'btn btn-secondary', type: 'button', onclick: async (ev) => {
    await withBusy(ev.currentTarget, async () => {
      try { const id = await startSession(profile.id, { title: 'Allenamento libero' }); navigate(`/attivita/sessione?id=${id}`); }
      catch (err) { toast(err.message, 'error'); }
    });
  } }, 'Allenamento libero');

  // --- hero
  let heroEl;
  if (session) {
    heroEl = hero({ eyebrow: 'In corso', title: 'Il tuo allenamento', accent: 'ti aspetta', text: `«${session.title}»: quello che hai fatto è salvato. Riprendi quando vuoi.`, cta: { label: 'Riprendi', href: `#/attivita/sessione?id=${session.id}` } });
  } else if (workouts.length) {
    heroEl = hero({ eyebrow: 'Attività', title: 'Muoviti', accent: 'con calma', text: 'Scegli una scheda oppure allenati come ti va. Nessuna fretta, nessun obiettivo da raggiungere.', cta: { label: 'Inizia', onClick: () => { currentTab = 'schede'; seg.select('schede'); paint(); document.getElementById('lista-schede')?.scrollIntoView({ behavior: 'smooth' }); } } });
  } else {
    heroEl = hero({ eyebrow: 'Attività', title: 'Il tuo primo', accent: 'allenamento', text: 'Crea una scheda con gli esercizi che ti piacciono, oppure parti da un suggerimento.', cta: { label: 'Nuova scheda', href: '#/attivita/scheda' } });
  }

  function paint() {
    body.replaceChildren(spinner());
    (currentTab === 'schede' ? schedeTab() : currentTab === 'abitudini' ? habitsTab() : historyTab())
      .then((n) => body.replaceChildren(n)).catch((err) => body.replaceChildren(errorBox(err.message, { onRetry: paint })));
  }

  // ---------------------------------------------------------------- schede
  async function schedeTab() {
    const wrap = h('div', { class: 'stack' });
    if (proposals.length) {
      wrap.append(sectionHead('Proposte da Phill'));
      for (const p of proposals) wrap.append(proposalCard(p));
    }
    wrap.append(sectionHead('Le tue schede', h('a', { class: 'link-small', href: '#/attivita/scheda' }, 'Nuova')));
    const list = h('section', { id: 'lista-schede', class: 'list-card' });
    if (!workouts.length) list.append(h('div', { class: 'card' }, emptyState('Ancora nessuna scheda', 'Crea la tua prima scheda o parti da un suggerimento.')));
    for (const w of workouts) {
      const row = h('div', { class: 'list-row' },
        exerciseThumb(w.keys[0]),
        h('a', { class: 'grow list-link', href: `#/attivita/scheda?id=${w.id}` }, h('span', { class: 'list-title' }, w.title),
          h('span', { class: 'muted block' }, `${w.exerciseCount} ${w.exerciseCount === 1 ? 'esercizio' : 'esercizi'}${w.source === 'proposal' ? ' · da Phill' : ''}`)),
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: (ev) => withBusy(ev.currentTarget, async () => {
          try {
            const full = await getWorkout(w.id);
            const id = await startSession(profile.id, { workoutId: w.id, title: w.title, exercises: full.workout_exercises });
            navigate(`/attivita/sessione?id=${id}`);
          } catch (err) { toast(err.message, 'error'); }
        }) }, 'Inizia'));
      list.append(row);
    }
    wrap.append(list);
    wrap.append(h('div', { class: 'row-center' }, freeBtn(), h('a', { class: 'btn btn-secondary', href: '#/attivita/scheda' }, 'Nuova scheda')));
    wrap.append(suggestionCard());
    return wrap;
  }

  function proposalCard(p) {
    const names = (p.exercises ?? []).map((e) => e.name).filter(Boolean);
    const run = (fn, ok) => async (ev) => withBusy(ev.currentTarget, async () => {
      try { await fn(); toast(ok, 'success'); await render(); } catch (err) { toast(err.message, 'error'); }
    });
    return h('article', { class: 'card stack' },
      h('p', { class: 'card-title' }, p.title),
      p.notes ? h('p', { class: 'muted ticket-body-plain' }, p.notes) : null,
      names.length ? h('p', { class: 'muted small' }, names.join(' · ')) : h('p', { class: 'muted small' }, 'Nessun esercizio indicato.'),
      h('p', { class: 'muted small' }, 'È solo una proposta: puoi accettarla così com’è, accettarla e cambiarla, oppure lasciarla stare. Nessun obbligo.'),
      h('div', { class: 'row-center' },
        h('button', { class: 'btn', type: 'button', onclick: run(() => acceptProposal(p.id), 'Scheda aggiunta.') }, 'Accetta'),
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: async (ev) => withBusy(ev.currentTarget, async () => {
          try { const r = await acceptProposal(p.id); navigate(`/attivita/scheda?id=${r.workout_id}`); } catch (err) { toast(err.message, 'error'); }
        }) }, 'Accetta e modifica'),
        h('button', { class: 'btn btn-text', type: 'button', onclick: run(() => rejectProposal(p.id), 'Proposta messa da parte.') }, 'Non ora')));
  }

  function suggestionCard() {
    const pool = compatibleExercises(equipment, { prefersNoEquipment: settings.prefers_no_equipment });
    const card = h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, 'Un suggerimento per te'),
      h('p', { class: 'muted' }, settings.prefers_no_equipment
        ? 'Esercizi a corpo libero, perché preferisci non usare attrezzi.'
        : `Esercizi adatti agli attrezzi che hai a disposizione (${pool.length} tra cui scegliere).`));
    let seed = new Date().getDate();
    const preview = h('div', { class: 'stack' });
    const show = () => {
      const picks = suggestWorkout(equipment, { prefersNoEquipment: settings.prefers_no_equipment, seed });
      preview.replaceChildren(
        ...picks.map((e) => h('div', { class: 'exercise-row' }, exerciseThumb(e.exercise_key), h('div', { class: 'grow' }, h('p', { class: 'list-title' }, e.name), h('p', { class: 'muted' }, `${e.sets} × ${e.reps}`)))),
        h('div', { class: 'row-center' },
          h('button', { class: 'btn', type: 'button', onclick: (ev) => withBusy(ev.currentTarget, async () => {
            try { const id = await saveWorkout(profile.id, { title: 'Scheda suggerita', notes: 'Un punto di partenza: cambiala come preferisci.', exercises: picks }); navigate(`/attivita/scheda?id=${id}`); }
            catch (err) { toast(err.message, 'error'); }
          }) }, 'Salva come scheda'),
          h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { seed += 1; show(); } }, 'Un altro')));
    };
    if (pool.length) { show(); card.append(preview); } else card.append(h('p', { class: 'muted' }, 'Dal Profilo puoi aggiungere qualche attrezzo, oppure lasciare tutto vuoto per fare esercizi a corpo libero.'));
    card.append(h('p', { class: 'muted small' }, 'Sono solo idee: le indicazioni del professionista che ti segue vengono sempre prima.'));
    return card;
  }

  // ---------------------------------------------------------------- abitudini
  async function habitsTab() {
    const days = lastDays(30);
    const today = localDay();
    const habits = await listHabits(profile.id, days[0]);
    const doneToday = habits.filter((x) => x.logs.includes(today)).length;
    const wrap = h('div', { class: 'stack' });
    wrap.append(h('section', { class: 'card goal-card' },
      ring({ percent: habits.length ? (doneToday / habits.length) * 100 : 0, label: `${doneToday}/${habits.length}`, ariaLabel: `${doneToday} abitudini su ${habits.length} fatte oggi` }),
      h('div', { class: 'goal-main' }, h('p', { class: 'card-title' }, 'Oggi'),
        h('p', { class: 'muted' }, habits.length ? 'Quello che riesci a fare va benissimo. Domani è un altro giorno.' : 'Aggiungi la tua prima abitudine qui sotto.'))));

    const list = h('section', { class: 'list-card' });
    for (const hb of habits) {
      const on = hb.logs.includes(today);
      const btn = h('button', { class: 'check', type: 'button', 'aria-pressed': String(on), 'aria-label': `${hb.name}: ${on ? 'fatta' : 'da fare'} oggi`,
        onclick: async () => {
          const next = btn.getAttribute('aria-pressed') !== 'true';
          btn.disabled = true;
          try {
            await setHabitDone(profile.id, hb.id, today, next);
            if (next && isConsolidated([...hb.logs.filter((d) => d !== today), today])) await addWin(profile.id, 'habit_streak', `Abitudine ormai fissa: ${hb.name}`);
            await render();
          } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
        } }, icon('check', { size: 18 }));
      list.append(h('div', { class: 'list-row' }, btn,
        h('span', { class: 'grow' }, h('span', { class: 'list-title' }, hb.name),
          h('span', { class: 'muted block small' }, `${hb.logs.length} ${hb.logs.length === 1 ? 'giorno' : 'giorni'} su 30`, isConsolidated(hb.logs) ? ' · ormai è un’abitudine' : '')),
        h('button', { class: 'btn btn-text', type: 'button', 'aria-label': `Rimuovi ${hb.name}`, onclick: async () => { try { await archiveHabit(hb.id); toast('Abitudine rimossa.'); await render(); } catch (err) { toast(err.message, 'error'); } } }, 'Rimuovi')));
    }
    if (habits.length) wrap.append(list);

    const have = new Set(habits.map((x) => x.preset_key).filter(Boolean));
    const presets = DEFAULT_HABITS.filter((p) => !have.has(p.key));
    const custom = field({ id: 'habit-custom', label: 'Un’abitudine tutta tua', maxlength: 80, required: false, autocomplete: 'off' });
    const addBtn = h('button', { class: 'btn', type: 'submit' }, 'Aggiungi');
    const addForm = h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
      ev.preventDefault();
      const n = custom.input.value.trim();
      custom.setError(n ? null : 'Scrivi un nome.');
      if (!n) return;
      withBusy(addBtn, async () => { try { await addHabit(profile.id, { name: n }); toast('Abitudine aggiunta.', 'success'); await render(); } catch (err) { toast(err.message, 'error'); } });
    } }, custom.wrap, addBtn);
    wrap.append(h('section', { class: 'card stack' },
      h('h2', { class: 'card-title' }, 'Aggiungi un’abitudine'),
      presets.length ? h('div', { class: 'chips' }, presets.map((p) => h('button', { class: 'chip chip-btn', type: 'button', onclick: async () => {
        try { await addHabit(profile.id, { name: p.name, presetKey: p.key }); toast('Abitudine aggiunta.', 'success'); await render(); } catch (err) { toast(err.message, 'error'); }
      } }, `+ ${p.name}`))) : null,
      addForm));
    return wrap;
  }

  // ---------------------------------------------------------------- storico
  async function historyTab() {
    const sessions = await listSessions(profile.id);
    if (!sessions.length) return h('div', { class: 'card' }, emptyState('Ancora nessun allenamento finito', 'Quando ne finirai uno, lo troverai qui, con il tempo e gli esercizi fatti.'));
    const total = sessions.reduce((a, s) => a + s.minutes, 0);
    return h('div', { class: 'stack' },
      h('section', { class: 'stat-row' },
        h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(sessions.length)), h('span', { class: 'stat-label' }, 'finiti')),
        h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(total)), h('span', { class: 'stat-label' }, 'minuti in tutto')),
        h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(sessions.filter((s) => Date.now() - new Date(s.started_at) < 7 * 864e5).length)), h('span', { class: 'stat-label' }, 'negli ultimi 7 giorni'))),
      h('section', { class: 'list-card' }, sessions.map((s) => h('a', { class: 'list-row', href: `#/attivita/sessione?id=${s.id}` },
        h('span', { class: 'list-icon' }, icon('check')),
        h('span', { class: 'grow' }, h('span', { class: 'list-title' }, s.title), h('span', { class: 'muted block small' }, `${fmtDayMonth(s.started_at)} · ${s.minutes} min · ${s.done}/${s.total} esercizi`)),
        icon('chevron', { size: 18, className: 'icon list-chevron' })))));
  }

  paint();
  return h('main', { class: 'shell with-tabs' }, heroEl, seg.el, body);
}
