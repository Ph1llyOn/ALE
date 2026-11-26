// #/attivita — allenamenti (schede, sessioni, proposte di Phill), abitudini e storico.
import { h, errorBox, emptyState, withBusy, toast, spinner, field } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import {
  listWorkouts, inProgressSession, getWorkout, listProposals, acceptProposal, rejectProposal, saveWorkout,
  listHabits, addHabit, setHabitDone, archiveHabit, isConsolidated, addWin, listSessions,
} from '../../core/api-activities.js';
import { listEquipment } from '../../core/api-personal.js';
import { getSettings } from '../../core/api-settings.js';
import { loadTrainingContext, createGuidedSession, planFromWorkout, computeWeekPlan, applyWeekPlan, declinePlanEvent } from '../../core/api-training.js';
import { generateSession, weekdayOf } from '../../data/planner-core.js';
import { WEEKDAYS_LONG } from '../../data/calendar-util.js';
import { segmented, pageHeader } from '../../components/controls.js';
import { hero, ring, exerciseThumb, sectionHead } from '../../components/visuals.js';
import { profileErrorView } from '../../components/profile-error.js';
import { icon } from '../../components/icons.js';
import { DEFAULT_HABITS } from '../../data/exercises.js';
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


  // --- hero
  let heroEl;
  if (session) {
    heroEl = hero({ eyebrow: 'In corso', title: 'Il tuo allenamento', accent: 'ti aspetta', text: `«${session.title}»: quello che hai fatto è salvato. Riprendi quando vuoi.`, cta: { label: 'Riprendi', href: `#/attivita/sessione?id=${session.id}` } });
  } else if (workouts.length) {
    heroEl = hero({ eyebrow: 'Attività', title: 'Muoviti', accent: 'con calma', text: 'Scegli una scheda oppure allenati come ti va. Nessuna fretta, nessun obiettivo da raggiungere.', cta: { label: 'Inizia', onClick: () => { currentTab = 'schede'; seg.select('schede'); paint(); document.getElementById('lista-schede')?.scrollIntoView({ behavior: 'smooth' }); } } });
  } else {
    heroEl = hero({ eyebrow: 'Attività', title: 'Il tuo primo', accent: 'allenamento', text: 'Parti dalla proposta di oggi qui sotto, oppure crea una scheda con gli esercizi che ti piacciono.', cta: { label: 'Nuova scheda', href: '#/attivita/scheda' } });
  }

  function paint() {
    body.replaceChildren(spinner());
    (currentTab === 'schede' ? schedeTab() : currentTab === 'abitudini' ? habitsTab() : historyTab())
      .then((n) => body.replaceChildren(n)).catch((err) => body.replaceChildren(errorBox(err.message, { onRetry: paint })));
  }

  // ---------------------------------------------------------------- schede
  async function schedeTab() {
    const wrap = h('div', { class: 'stack' });
    wrap.append(await todayCard(), await weekCard());
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
            const id = await createGuidedSession(profile.id, planFromWorkout(full), { workoutId: w.id });
            navigate(`/attivita/sessione?id=${id}`);
          } catch (err) { toast(err.message, 'error'); }
        }) }, 'Inizia'));
      list.append(row);
    }
    wrap.append(list);
    wrap.append(h('div', { class: 'row-center' }, h('a', { class: 'btn btn-secondary', href: '#/attivita/scheda' }, 'Nuova scheda')));
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

  // ---------------------------------------------------------------- oggi e settimana (motore di allenamento)
  const KIND_LABELS = { strength: 'Forza', cardio: 'Cardio dolce', mobility: 'Mobilità' };
  const PHASE_TITLES = { warmup: 'Riscaldamento', main: 'Parte principale', cardio: 'Cardio', cooldown: 'Defaticamento' };
  let todaySeed = 0; let todayKind = null;

  async function todayCard() {
    const card = h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, 'Il tuo allenamento di oggi'));
    try {
      const { ctx, settings: st } = await loadTrainingContext(profile.id, { seed: new Date().getDate() + todaySeed });
      const today = ctx.today;
      const todays = (await weekEventsCached()).find((e) => e.source === 'plan' && e.day === today && !e.completed && e.status !== 'declined');
      const yesterdayDone = ctx.history.some((x) => x.day === addDay(today, -1));
      const kind = todayKind ?? todays?.plan_data?.kind ?? (yesterdayDone ? 'mobility' : 'strength');
      card.append(segmented({ label: 'Che allenamento vuoi fare', value: kind, options: Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label })), onChange: (v) => { todayKind = v; todaySeed = 0; paint(); } }).el);
      const plan = generateSession(ctx, { kind });
      if (!plan?.items?.length) { card.append(h('p', { class: 'muted' }, 'Per ora non trovo esercizi adatti. Controlla attrezzi e limitazioni nel Profilo.')); return card; }
      const intro = todays ? 'Era in programma per oggi.' : yesterdayDone && kind === 'mobility' ? 'Ieri ti sei allenata: oggi qualcosa di più leggero.' : 'Una proposta pensata su quello che hai, sul tempo che hai scelto e su come sono andate le ultime volte.';
      card.append(h('p', { class: 'muted' }, `${intro} Circa ${plan.estimated_minutes} minuti.`));
      for (const phase of ['warmup', 'main', 'cardio', 'cooldown']) {
        const list = plan.items.filter((i) => i.phase === phase); if (!list.length) continue;
        card.append(h('p', { class: 'eyebrow' }, PHASE_TITLES[phase]), ...list.map((i) => h('div', { class: 'exercise-row' }, exerciseThumb(i.exercise_key),
          h('div', { class: 'grow' }, h('p', { class: 'list-title' }, i.name), h('p', { class: 'muted small' }, `${i.sets} × ${i.reps}`, i.equipment.length ? ` · ${i.equipment.join(', ')}` : ''),
            i.why?.length ? h('p', { class: 'muted small' }, `Perché: ${i.why[0]}`) : null))));
      }
      if (plan.assumptions?.length) card.append(h('p', { class: 'muted small' }, plan.assumptions.join(' ')));
      card.append(h('div', { class: 'row-center' },
        h('button', { class: 'btn', type: 'button', onclick: (ev) => withBusy(ev.currentTarget, async () => {
          try { const id = await createGuidedSession(profile.id, plan, { eventId: todays?.id ?? null }); navigate(`/attivita/sessione?id=${id}`); } catch (err) { toast(err.message, 'error'); }
        }) }, 'Inizia'),
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { todaySeed += 1; paint(); } }, 'Un’altra idea')),
      h('p', { class: 'muted small' }, 'Sono idee, non obblighi. Le indicazioni del professionista che ti segue vengono sempre prima, e se senti dolore o fastidio ci si ferma.'));
      void st;
    } catch (err) { card.append(errorBox(err.message, { onRetry: paint })); }
    return card;
  }

  let weekCache = null;
  async function weekEventsCached() {
    if (!weekCache) { const { listWeekEvents } = await import('../../core/api-training.js'); weekCache = listWeekEvents(profile.id, localDay()); }
    return weekCache;
  }
  const addDay = (d, k) => { const t = new Date(`${d}T12:00:00`); t.setDate(t.getDate() + k); return localDay(t); };

  async function weekCard() {
    const card = h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, 'La tua settimana'));
    try {
      const { ctx, settings: st } = await loadTrainingContext(profile.id);
      let info = await computeWeekPlan(profile.id, { ctx, settings: st });
      const today = ctx.today;
      // le sessioni nuove si aggiungono da sole (non tolgono nulla); ciò che cambierebbe qualcosa chiede conferma
      if (st.auto_plan && info.diff.toAdd.length && !info.diff.needsConfirmation) { await applyWeekPlan(profile.id, info.diff); weekCache = null; info = await computeWeekPlan(profile.id, { ctx, settings: st }); }
      const events = info.events.filter((e) => e.source === 'plan');
      const missed = events.filter((e) => !e.completed && e.status !== 'declined' && e.day < today);
      if (info.diff.needsConfirmation) {
        card.append(h('div', { class: 'notice stack' }, h('p', null, `La tua disponibilità è cambiata: ci sono ${info.diff.toRemove.length} sessioni del piano che non servono più. Le tolgo e aggiungo quelle nuove?`),
          h('div', { class: 'row-center' },
            h('button', { class: 'btn', type: 'button', onclick: (ev) => withBusy(ev.currentTarget, async () => { try { await applyWeekPlan(profile.id, info.diff, { removeStale: true }); weekCache = null; toast('Piano aggiornato.', 'success'); await render(); } catch (err) { toast(err.message, 'error'); } }) }, 'Aggiorna il piano'),
            h('button', { class: 'btn btn-text', type: 'button', onclick: (ev) => ev.currentTarget.closest('.notice').remove() }, 'Lascia com’è'))));
      } else if (!st.auto_plan && info.diff.toAdd.length) {
        card.append(h('div', { class: 'notice stack' }, h('p', null, `Ti propongo ${info.diff.toAdd.length} ${info.diff.toAdd.length === 1 ? 'sessione' : 'sessioni'} per questa settimana, negli orari liberi del tuo calendario.`),
          h('button', { class: 'btn', type: 'button', onclick: (ev) => withBusy(ev.currentTarget, async () => { try { await applyWeekPlan(profile.id, info.diff); weekCache = null; await render(); } catch (err) { toast(err.message, 'error'); } }) }, 'Aggiungi al calendario')));
      }
      const days = Array.from({ length: 7 }, (_, i) => addDay(info.week, i));
      card.append(h('div', { class: 'list-card' }, days.map((d) => {
        const ev = events.find((e) => e.day === d);
        const name = WEEKDAYS_LONG[weekdayOf(d) % 7]; const isToday = d === today;
        let right; let text;
        if (!ev) { text = d < today ? 'Giorno libero' : 'Riposo: fa parte del percorso'; right = null; }
        else if (ev.status === 'declined') { text = 'Messa da parte: nessun problema'; right = null; }
        else if (ev.completed) { text = `${ev.title} · fatta`; right = icon('check'); }
        else if (d < today) { text = `${ev.title} · non è stata fatta, va bene così`; right = null; }
        else {
          text = `${ev.title} · ${ev.start}`;
          right = h('button', { class: 'btn btn-text', type: 'button', onclick: (e2) => withBusy(e2.currentTarget, async () => { try { await declinePlanEvent(ev.id); weekCache = null; await render(); } catch (err) { toast(err.message, 'error'); } }) }, 'Metti da parte');
        }
        return h('div', { class: `list-row${isToday ? ' is-today' : ''}` }, h('span', { class: 'grow' }, h('span', { class: 'list-title' }, `${name[0].toUpperCase()}${name.slice(1)}${isToday ? ' · oggi' : ''}`), h('span', { class: 'muted block small' }, text)), right);
      })));
      card.append(h('p', { class: 'muted small' }, `Le sessioni stanno negli orari liberi, senza toccare i tuoi impegni.${missed.length ? ' Quelle saltate non si recuperano tutte insieme: si riparte con calma.' : ''} Puoi modificarle dal Calendario.`));
    } catch (err) { card.append(errorBox(err.message)); }
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
