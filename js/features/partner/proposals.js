// #/proposte (solo Phill) — propone ad Alessia una scheda o un evento e ne segue lo stato. Decide sempre lei.
import { h, field, textField, errorBox, withBusy, toast, chip } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { pageHeader, segmented } from '../../components/controls.js';
import { exerciseThumb } from '../../components/visuals.js';
import { profileErrorView } from '../../components/profile-error.js';
import { proposeWorkout, listMyWorkoutProposals, withdrawWorkoutProposal } from '../../core/api-partner.js';
import { proposeEvent, listMyProposedEvents, withdrawProposal } from '../../core/api-calendar.js';
import { EXERCISES, EQUIPMENT_LABELS } from '../../data/exercises.js';
import { CATEGORIES, toIso, validateEvent } from '../../data/calendar-util.js';
import { fmtDateTime, fmtRelative, localDay } from '../../core/format.js';

const STATUS = {
  proposed: ['In attesa di Alessia', ''], accepted: ['Accettata', 'ok'], rejected: ['Non accettata', 'muted'], withdrawn: ['Ritirata', 'muted'],
  confirmed: ['Confermata', 'ok'], declined: ['Non accettata', 'muted'],
};

export default async function proposalsView() {
  const { profile, partner, partnership } = getState();
  if (!profile) return profileErrorView(getState().loadError);
  const root = h('main', { class: 'shell with-tabs stack' }, pageHeader({ eyebrow: 'Area di Phill', title: 'Proposte' }));
  if (!(partnership && partner)) {
    root.append(h('div', { class: 'card muted' }, 'Potrai proporre schede ed eventi non appena sarai collegato con Alessia.'));
    return root;
  }
  const mode = { value: 'workout' };
  const formHost = h('section', { class: 'card stack' });
  const listHost = h('section', { class: 'stack' });
  root.append(
    h('p', { class: 'muted' }, `Sono solo proposte: ${partner.display_name} le vede, le può modificare o rifiutare, e non succede nulla senza il suo ok.`),
    segmented({ label: 'Cosa vuoi proporre', value: 'workout', options: [{ value: 'workout', label: 'Allenamento' }, { value: 'event', label: 'Evento' }],
      onChange: (v) => { mode.value = v; paintForm(); } }).el,
    formHost, listHost);

  async function paintList() {
    try {
      const [ws, es] = await Promise.all([listMyWorkoutProposals(profile.id), listMyProposedEvents(profile.id)]);
      const rows = [
        ...ws.map((w) => ({ kind: 'Allenamento', id: w.id, title: w.title, status: w.status, when: w.created_at, detail: `${w.exercises.length} esercizi`, withdraw: () => withdrawWorkoutProposal(w.id) })),
        ...es.map((e) => ({ kind: 'Evento', id: e.id, title: e.title, status: e.status, when: e.created_at ?? e.starts_at, detail: fmtDateTime(e.starts_at), withdraw: () => withdrawProposal(e.id) })),
      ].sort((a, b) => new Date(b.when) - new Date(a.when));
      listHost.replaceChildren(h('h2', { class: 'section-title' }, 'Le tue proposte'),
        rows.length ? h('ul', { class: 'plain-list card' }, rows.map((r) => {
          const [label, kind] = STATUS[r.status] ?? [r.status, 'muted'];
          const btn = r.status === 'proposed'
            ? h('button', { class: 'btn btn-text', type: 'button', onclick: async (ev) => {
              await withBusy(ev.currentTarget, async () => { try { await r.withdraw(); toast('Proposta ritirata.'); await paintList(); } catch (err) { toast(err.message, 'error'); } });
            } }, 'Ritira') : null;
          return h('li', { class: 'row' }, h('span', { class: 'grow' }, h('span', { class: 'list-title' }, r.title),
            h('span', { class: 'muted block small' }, r.kind === 'Allenamento' ? `${r.kind} · ${r.detail} · ${fmtRelative(r.when)}` : `${r.kind} · ${r.detail}`)), chip(label, kind), btn);
        })) : h('div', { class: 'card muted center' }, 'Non hai ancora proposto nulla.'));
    } catch (err) { listHost.replaceChildren(errorBox(err.message, { onRetry: paintList })); }
  }

  function paintForm() {
    formHost.replaceChildren(mode.value === 'workout' ? workoutForm() : eventForm());
  }

  function workoutForm() {
    const title = field({ id: 'p-title', label: 'Nome della scheda', maxlength: 120, autocomplete: 'off' });
    const notes = textField({ id: 'p-notes', label: 'Un messaggio per lei (facoltativo)', rows: 2, maxlength: 2000 });
    const chosen = new Map();
    const error = h('p', { class: 'form-error', role: 'alert' });
    const grid = h('div', { class: 'stack' }, EXERCISES.map((e) => {
      const cb = h('input', { type: 'checkbox', id: `pe-${e.id}`, onchange: () => { if (cb.checked) chosen.set(e.id, e); else chosen.delete(e.id); } });
      return h('label', { class: 'row pick', for: `pe-${e.id}` }, cb, exerciseThumb(e.id),
        h('span', { class: 'grow' }, h('span', { class: 'list-title' }, e.name),
          h('span', { class: 'muted block small' }, `${e.sets} × ${e.reps}${e.equipment.length ? ` · ${e.equipment.map((k) => EQUIPMENT_LABELS[k]).join(', ')}` : ' · corpo libero'}`)));
    }));
    const submit = h('button', { class: 'btn', type: 'submit' }, 'Invia la proposta');
    return h('form', { class: 'stack', novalidate: true, onsubmit: async (ev) => {
      ev.preventDefault(); error.textContent = '';
      await withBusy(submit, async () => {
        try {
          const exercises = [...chosen.values()].map((e) => ({ exercise_key: e.id, name: e.name, sets: e.sets, reps: e.reps, rest_seconds: e.rest, notes: e.tip }));
          await proposeWorkout(profile.id, partner.id, { title: title.input.value, notes: notes.input.value, exercises });
          toast('Proposta inviata.'); paintForm(); await paintList();
        } catch (err) { error.textContent = err.message; }
      });
    } }, h('h2', { class: 'card-title' }, 'Proponi un allenamento'),
    h('p', { class: 'muted small' }, 'Scegli dall’elenco: sono movimenti semplici e generici. Se Alessia ha indicazioni di un professionista, valgono quelle.'),
    title.wrap, notes.wrap, grid, error, submit);
  }

  function eventForm() {
    const title = field({ id: 'ev-title', label: 'Nome dell’evento', maxlength: 120, autocomplete: 'off' });
    const day = field({ id: 'ev-day', label: 'Giorno', type: 'date', value: localDay() });
    const time = field({ id: 'ev-time', label: 'Ora', type: 'time', value: '18:00', required: false });
    const cat = h('select', { class: 'input', id: 'ev-cat', 'aria-label': 'Categoria' }, CATEGORIES.map((c) => h('option', { value: c.key }, c.label)));
    const notes = textField({ id: 'ev-notes', label: 'Note (facoltative)', rows: 2, maxlength: 2000 });
    const error = h('p', { class: 'form-error', role: 'alert' });
    const submit = h('button', { class: 'btn', type: 'submit' }, 'Invia la proposta');
    return h('form', { class: 'stack', novalidate: true, onsubmit: async (ev) => {
      ev.preventDefault(); error.textContent = '';
      const v = { title: title.input.value, day: day.input.value, time: time.input.value };
      const problem = validateEvent(v);
      if (problem) { error.textContent = problem; return; }
      await withBusy(submit, async () => {
        try {
          await proposeEvent(profile.id, partner.id, { title: v.title, category: cat.value, startsAt: toIso(v.day, v.time), notes: notes.input.value });
          toast('Proposta inviata.'); paintForm(); await paintList();
        } catch (err) { error.textContent = err.message; }
      });
    } }, h('h2', { class: 'card-title' }, 'Proponi un evento'), title.wrap, day.wrap, time.wrap,
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'ev-cat' }, 'Categoria'), cat), notes.wrap, error, submit);
  }

  paintForm();
  await paintList();
  return root;
}
