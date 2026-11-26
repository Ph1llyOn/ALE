// #/profilo/attrezzatura — l'inventario di ciò che c'è in casa. Modificabile in ogni momento; condivisibile solo se lo scegli.
import { h, field, textField, errorBox, emptyState, withBusy, toast, spinner, chip } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { listEquipment, addEquipment, updateEquipment, removeEquipment } from '../../core/api-personal.js';
import { pageHeader } from '../../components/controls.js';
import { getSettings, saveSettings } from '../../core/api-settings.js';
import { profileErrorView } from '../../components/profile-error.js';
import { equipmentPicker, norm } from '../../components/equipment-picker.js';
import { trainingPrefsCard } from './training-prefs.js';

export default async function equipmentView() {
  const { profile } = getState();
  if (!profile) return profileErrorView(getState().loadError);

  const listHost = h('div', { class: 'stack' });
  const formHost = h('section', { class: 'card stack' });
  let items = [];

  async function reload() {
    listHost.replaceChildren(spinner());
    try { items = await listEquipment(profile.id); }
    catch (err) { listHost.replaceChildren(errorBox(err.message, { onRetry: reload })); return; }
    paint();
  }

  function paint() {
    if (!items.length) {
      listHost.replaceChildren(h('div', { class: 'card' }, emptyState('Non hai ancora scelto nessun attrezzo', 'Tocca quelli che hai qui sopra. Anche “nessun attrezzo” va benissimo.')));
      return;
    }
    listHost.replaceChildren(...items.map((it) => {
      const slot = h('div');
      const view = () => slot.replaceChildren(h('article', { class: 'card stack' },
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('p', { class: 'card-title' }, it.name), it.notes ? h('p', { class: 'muted ticket-body-plain' }, it.notes) : null),
          it.avoid ? chip('Preferisco non usarlo', 'muted') : null),
        h('div', { class: 'row-center' },
          h('button', { class: 'btn btn-text', type: 'button', onclick: edit }, 'Modifica'),
          removeButton(it))));
      const edit = () => slot.replaceChildren(equipmentForm({ initial: it, onSaved: reload, onCancel: view }));
      view();
      return slot;
    }));
  }

  function removeButton(it) {
    const btn = h('button', { class: 'btn btn-text btn-danger-text', type: 'button', onclick: () => {
      if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Tocca di nuovo per eliminare'; return; }
      withBusy(btn, async () => {
        try { await removeEquipment(it.id); toast('Attrezzo tolto.'); await reload(); } catch (err) { toast(err.message, 'error'); }
      });
    } }, 'Elimina');
    return btn;
  }

  function equipmentForm({ initial, onSaved, onCancel }) {
    const id = initial ? `eq-${initial.id}` : 'eq-new';
    const name = field({ id: `${id}-name`, label: 'Nome dell’attrezzo', value: initial?.name ?? '', maxlength: 80, autocomplete: 'off' });
    const notes = textField({ id: `${id}-notes`, label: 'Note (facoltative)', rows: 2, maxlength: 500, value: initial?.notes ?? '', hint: 'Ad esempio quanto pesa, o dove lo tieni.' });
    const avoid = h('input', { type: 'checkbox', id: `${id}-avoid`, checked: Boolean(initial?.avoid) });
    const error = h('p', { class: 'form-error', role: 'alert' });
    const submit = h('button', { class: 'btn', type: 'submit' }, initial ? 'Salva' : 'Aggiungi');
    const form = h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
      ev.preventDefault();
      error.textContent = '';
      const n = name.input.value.trim();
      name.setError(n ? (n.length > 80 ? 'Al massimo 80 caratteri.' : null) : 'Scrivi il nome dell’attrezzo.');
      if (!n || n.length > 80) return;
      withBusy(submit, async () => {
        try {
          const values = { name: n, notes: notes.input.value, avoid: avoid.checked };
          if (initial) await updateEquipment(initial.id, values); else await addEquipment(profile.id, values);
          toast(initial ? 'Fatto, attrezzo aggiornato.' : 'Attrezzo aggiunto.', 'success');
          await onSaved();
          if (!initial) { name.input.value = ''; notes.input.value = ''; notes.sync(); avoid.checked = false; }
        } catch (err) { error.textContent = err.message; }
      });
    } }, name.wrap, notes.wrap,
    h('label', { class: 'check-row', for: `${id}-avoid` }, avoid, h('span', null, 'Preferisco non usarlo')),
    error, h('div', { class: 'row-center' }, submit, onCancel ? h('button', { class: 'btn btn-text', type: 'button', onclick: onCancel }, 'Annulla') : null));
    return initial ? h('div', { class: 'card stack' }, form) : form;
  }

  formHost.append(h('h2', { class: 'card-title' }, 'Hai un altro attrezzo?'), h('p', { class: 'muted small' }, 'Se non lo trovi nell’elenco, scrivilo qui.'), equipmentForm({ onSaved: reload }));

  // Spazi, preferenze e indicazioni: private, usate per proporre attività compatibili.
  async function spacesCard() {
    let st;
    try { st = await getSettings(profile.id); } catch (err) { return errorBox(err.message); }
    const spaces = textField({ id: 'st-spaces', label: 'Dove preferisci allenarti?', rows: 2, maxlength: 500, value: st.spaces, hint: 'Ad esempio: un angolo del salotto, il balcone o una stanza libera.' });
    const noEq = h('input', { type: 'checkbox', id: 'st-noeq', checked: st.prefers_no_equipment });
    const limits = textField({ id: 'st-limits', label: 'Cose da tenere presenti', rows: 2, maxlength: 500, value: st.limitations, hint: 'Ad esempio: soffitto basso, vicini al piano di sotto, poco tempo.' });
    const pro = textField({ id: 'st-pro', label: 'Indicazioni del professionista che ti segue', rows: 3, maxlength: 1000, value: st.professional_notes,
      hint: 'Scrivi qui quello che ti ha detto. Le attività proposte terranno conto di queste indicazioni, che hanno sempre la precedenza. ALE. non le interpreta e non le sostituisce.' });
    const err = h('p', { class: 'form-error', role: 'alert' });
    const save = h('button', { class: 'btn', type: 'submit' }, 'Salva');
    return h('form', { class: 'card stack', novalidate: true, onsubmit: (ev) => {
      ev.preventDefault();
      err.textContent = '';
      withBusy(save, async () => {
        try {
          await saveSettings(profile.id, { spaces: spaces.input.value, prefers_no_equipment: noEq.checked, limitations: limits.input.value, professional_notes: pro.input.value });
          toast('Salvato.', 'success');
        } catch (e) { err.textContent = e.message; }
      });
    } }, h('h2', { class: 'card-title' }, 'Spazio e preferenze'), spaces.wrap,
    h('label', { class: 'check-row', for: 'st-noeq' }, noEq, h('span', null, 'Preferisco allenarmi senza attrezzi')),
    limits.wrap, pro.wrap, err, save);
  }

  await reload();
  const selected = new Set(items.map((i) => norm(i.name)));
  const picker = equipmentPicker({ selected, onToggle: async (name, on) => {
    if (on) { if (!items.some((i) => norm(i.name) === norm(name))) await addEquipment(profile.id, { name, notes: '', avoid: false }); }
    else { for (const it of items.filter((i) => norm(i.name) === norm(name))) await removeEquipment(it.id); }
    await reload();
  } });
  const spaces = await spacesCard();
  const training = await trainingPrefsCard(profile.id).catch((e) => errorBox(e.message));
  return h('main', { class: 'shell with-tabs' },
    pageHeader({ title: 'Attrezzatura e spazio', back: { href: '#/profilo', label: 'Profilo' } }),
    h('p', { class: 'muted' }, 'Scegli gli attrezzi che hai a disposizione. Puoi cambiare idea quando vuoi, per esempio se ne compri uno nuovo.'),
    h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, 'Quali attrezzi hai a disposizione?'), picker.el),
    h('h2', { class: 'section-title' }, 'I tuoi attrezzi'), listHost, formHost, spaces, training);
}
