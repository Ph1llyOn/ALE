// #/attivita/scheda?id=… — creazione e modifica di una scheda, con esercizi illustrati, serie, ripetizioni, recupero e note.
import { h, field, textField, errorBox, withBusy, toast } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { getWorkout, saveWorkout, deleteWorkout } from '../../core/api-activities.js';
import { createGuidedSession, planFromWorkout } from '../../core/api-training.js';
import { listEquipment } from '../../core/api-personal.js';
import { getSettings } from '../../core/api-settings.js';
import { pageHeader } from '../../components/controls.js';
import { exerciseThumb, tile } from '../../components/visuals.js';
import { profileErrorView } from '../../components/profile-error.js';
import { icon } from '../../components/icons.js';
import { EXERCISES, compatibleExercises, exerciseById, exerciseImage, EQUIPMENT_LABELS } from '../../data/exercises.js';
import { navigate } from '../../core/router.js';

export default async function workoutEditView({ query }) {
  const { profile } = getState();
  if (!profile) return profileErrorView(getState().loadError);
  const header = (title) => pageHeader({ title, back: { href: '#/attivita', label: 'Attività' } });

  let existing = null; let equipment; let settings;
  try {
    [equipment, settings] = await Promise.all([listEquipment(profile.id), getSettings(profile.id)]);
    if (query.id) existing = await getWorkout(query.id);
  } catch (err) { return h('main', { class: 'shell with-tabs' }, header('Scheda'), errorBox(err.message)); }
  if (query.id && !existing) return h('main', { class: 'shell with-tabs' }, header('Scheda'), errorBox('Non trovo questa scheda.'));

  let items = (existing?.workout_exercises ?? []).map((e) => ({
    exercise_key: e.exercise_key, name: e.name, sets: e.sets ?? '', reps: e.reps ?? '', rest_seconds: e.rest_seconds ?? '', notes: e.notes ?? '',
  }));
  const title = field({ id: 'w-title', label: 'Nome della scheda', value: existing?.title ?? '', maxlength: 120, autocomplete: 'off' });
  const notes = textField({ id: 'w-notes', label: 'Note (facoltative)', rows: 2, maxlength: 2000, value: existing?.notes ?? '' });
  const listHost = h('div', { class: 'stack' });
  const pickerHost = h('section', { class: 'card stack', hidden: true });
  const error = h('p', { class: 'form-error', role: 'alert' });

  function paintList() {
    if (!items.length) { listHost.replaceChildren(h('div', { class: 'card muted center' }, 'Nessun esercizio: aggiungine uno qui sotto.')); return; }
    listHost.replaceChildren(...items.map((it, i) => {
      const num = (key, label, max) => {
        const input = h('input', { class: 'input mini', type: 'number', inputmode: 'numeric', min: 0, max, value: it[key] ?? '', 'aria-label': `${label} — ${it.name}`,
          oninput: () => { it[key] = input.value; } });
        return h('label', { class: 'mini-field' }, h('span', { class: 'muted small' }, label), input);
      };
      const reps = h('input', { class: 'input mini', type: 'text', maxlength: 40, value: it.reps ?? '', 'aria-label': `Ripetizioni — ${it.name}`, oninput: () => { it.reps = reps.value; } });
      const note = h('input', { class: 'input', type: 'text', maxlength: 500, value: it.notes ?? '', placeholder: 'Nota (facoltativa)', 'aria-label': `Nota — ${it.name}`, oninput: () => { it.notes = note.value; } });
      return h('article', { class: 'card stack exercise-card' },
        h('div', { class: 'row' }, exerciseThumb(it.exercise_key), h('p', { class: 'card-title grow' }, it.name),
          h('button', { class: 'btn btn-text', type: 'button', disabled: i === 0, 'aria-label': 'Sposta su', onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; paintList(); } }, '↑'),
          h('button', { class: 'btn btn-text', type: 'button', disabled: i === items.length - 1, 'aria-label': 'Sposta giù', onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; paintList(); } }, '↓'),
          h('button', { class: 'btn btn-text', type: 'button', 'aria-label': `Rimuovi ${it.name}`, onclick: () => { items.splice(i, 1); paintList(); } }, icon('trash', { size: 18 }))),
        h('div', { class: 'mini-row' }, num('sets', 'Serie', 50), h('label', { class: 'mini-field' }, h('span', { class: 'muted small' }, 'Ripetizioni'), reps), num('rest_seconds', 'Pausa (s)', 3600)),
        note);
    }));
  }

  let showAll = false;
  function paintPicker() {
    const pool = showAll ? EXERCISES : compatibleExercises(equipment, { prefersNoEquipment: settings.prefers_no_equipment });
    const custom = field({ id: 'w-custom', label: 'Un esercizio tutto tuo', maxlength: 120, required: false, autocomplete: 'off' });
    const addCustom = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => {
      const n = custom.input.value.trim();
      custom.setError(n ? null : 'Scrivi un nome.');
      if (!n) return;
      items.push({ exercise_key: null, name: n, sets: '', reps: '', rest_seconds: '', notes: '' });
      custom.input.value = ''; paintList(); toast('Esercizio aggiunto.');
    } }, 'Aggiungi');
    const toggleAll = h('label', { class: 'check-row', for: 'w-all' },
      h('input', { type: 'checkbox', id: 'w-all', checked: showAll, onchange: (ev) => { showAll = ev.currentTarget.checked; paintPicker(); } }),
      h('span', null, 'Mostra anche gli esercizi con attrezzi che non ho'));
    pickerHost.replaceChildren(
      h('h2', { class: 'card-title' }, 'Aggiungi un esercizio'),
      h('div', { class: 'hscroll' }, pool.map((e) => tile({
        onClick: () => { items.push({ exercise_key: e.id, name: e.name, sets: e.sets, reps: e.reps, rest_seconds: e.rest, notes: '' }); paintList(); toast(`${e.name} aggiunto.`); },
        art: h('img', { src: exerciseImage(e.id), alt: '', loading: 'lazy' }), title: e.name,
        sub: e.equipment.length ? e.equipment.map((k) => EQUIPMENT_LABELS[k]).join(', ') : 'Corpo libero',
      }))),
      toggleAll,
      h('div', { class: 'row' }, h('div', { class: 'grow' }, custom.wrap), addCustom));
  }

  const addToggle = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { pickerHost.hidden = !pickerHost.hidden; if (!pickerHost.hidden) paintPicker(); } }, 'Aggiungi esercizio');
  const save = h('button', { class: 'btn', type: 'submit' }, 'Salva la scheda');
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    error.textContent = '';
    const t = title.input.value.trim();
    title.setError(t ? null : 'Dai un nome alla scheda.');
    if (!t) return;
    withBusy(save, async () => {
      try {
        const id = await saveWorkout(profile.id, { id: existing?.id, title: t, notes: notes.input.value, exercises: items });
        toast('Scheda salvata.', 'success');
        navigate(`/attivita/scheda?id=${id}`);
        if (!existing) return;
        existing = await getWorkout(id);
      } catch (err) { error.textContent = err.message; }
    });
  } }, title.wrap, notes.wrap, listHost, addToggle, pickerHost, error, save);

  const extra = [];
  if (existing) {
    const start = h('button', { class: 'btn btn-secondary btn-block', type: 'button', onclick: () => withBusy(start, async () => {
      try {
        const id = await createGuidedSession(profile.id, planFromWorkout(await getWorkout(existing.id)), { workoutId: existing.id });
        navigate(`/attivita/sessione?id=${id}`);
      } catch (err) { toast(err.message, 'error'); }
    }) }, 'Inizia questo allenamento');
    const del = h('button', { class: 'btn btn-text btn-danger-text', type: 'button', onclick: () => {
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tocca ancora per eliminare la scheda'; return; }
      withBusy(del, async () => { try { await deleteWorkout(existing.id); toast('Scheda eliminata.'); navigate('/attivita'); } catch (err) { toast(err.message, 'error'); } });
    } }, 'Elimina la scheda');
    extra.push(start, h('div', { class: 'row-center' }, del));
  }

  paintList();
  void exerciseById;
  return h('main', { class: 'shell with-tabs' }, header(existing ? 'Modifica la scheda' : 'Nuova scheda'),
    h('section', { class: 'card stack' }, form), ...extra,
    h('p', { class: 'muted small center' }, 'Le schede sono solo idee. Le indicazioni del professionista che ti segue vengono sempre prima.'));
}
