// #/profilo/attrezzatura — l'inventario di ciò che c'è in casa. Modificabile in ogni momento; condivisibile solo se lo scegli.
import { h, field, textField, errorBox, emptyState, withBusy, toast, spinner, chip } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { listEquipment, addEquipment, updateEquipment, removeEquipment } from '../../core/api-personal.js';
import { pageHeader } from '../../components/controls.js';
import { getSettings, saveSettings } from '../../core/api-settings.js';
import { profileErrorView } from '../../components/profile-error.js';

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
      listHost.replaceChildren(h('div', { class: 'card' }, emptyState('Ancora nessun attrezzo', 'Aggiungi ciò che hai in casa: tappetino, manubri, elastici… Anche “niente attrezzi” va benissimo.')));
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
      if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Tocca ancora per eliminare'; return; }
      withBusy(btn, async () => {
        try { await removeEquipment(it.id); toast('Attrezzo eliminato.'); await reload(); } catch (err) { toast(err.message, 'error'); }
      });
    } }, 'Elimina');
    return btn;
  }

  function equipmentForm({ initial, onSaved, onCancel }) {
    const id = initial ? `eq-${initial.id}` : 'eq-new';
    const name = field({ id: `${id}-name`, label: 'Nome', value: initial?.name ?? '', maxlength: 80, autocomplete: 'off' });
    const notes = textField({ id: `${id}-notes`, label: 'Note (facoltative)', rows: 2, maxlength: 500, value: initial?.notes ?? '', hint: 'Ad esempio il peso, o dove lo tieni.' });
    const avoid = h('input', { type: 'checkbox', id: `${id}-avoid`, checked: Boolean(initial?.avoid) });
    const error = h('p', { class: 'form-error', role: 'alert' });
    const submit = h('button', { class: 'btn', type: 'submit' }, initial ? 'Salva' : 'Aggiungi');
    const form = h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
      ev.preventDefault();
      error.textContent = '';
      const n = name.input.value.trim();
      name.setError(n ? (n.length > 80 ? 'Al massimo 80 caratteri.' : null) : 'Dai un nome all’attrezzo.');
      if (!n || n.length > 80) return;
      withBusy(submit, async () => {
        try {
          const values = { name: n, notes: notes.input.value, avoid: avoid.checked };
          if (initial) await updateEquipment(initial.id, values); else await addEquipment(profile.id, values);
          toast(initial ? 'Attrezzo aggiornato.' : 'Attrezzo aggiunto.', 'success');
          await onSaved();
          if (!initial) { name.input.value = ''; notes.input.value = ''; notes.sync(); avoid.checked = false; }
        } catch (err) { error.textContent = err.message; }
      });
    } }, name.wrap, notes.wrap,
    h('label', { class: 'check-row', for: `${id}-avoid` }, avoid, h('span', null, 'Preferisco non usarlo')),
    error, h('div', { class: 'row-center' }, submit, onCancel ? h('button', { class: 'btn btn-text', type: 'button', onclick: onCancel }, 'Annulla') : null));
    return initial ? h('div', { class: 'card stack' }, form) : form;
  }

  formHost.append(h('h2', { class: 'card-title' }, 'Aggiungi un attrezzo'), equipmentForm({ onSaved: reload }));

  // Spazi, preferenze e indicazioni: private, usate per proporre attività compatibili.
  async function spacesCard() {
    let st;
    try { st = await getSettings(profile.id); } catch (err) { return errorBox(err.message); }
    const spaces = textField({ id: 'st-spaces', label: 'Spazio a disposizione', rows: 2, maxlength: 500, value: st.spaces, hint: 'Ad esempio: un angolo del salotto, il balcone, una stanza libera.' });
    const noEq = h('input', { type: 'checkbox', id: 'st-noeq', checked: st.prefers_no_equipment });
    const limits = textField({ id: 'st-limits', label: 'Limitazioni pratiche', rows: 2, maxlength: 500, value: st.limitations, hint: 'Ad esempio: soffitto basso, vicini sotto casa, poco tempo.' });
    const pro = textField({ id: 'st-pro', label: 'Indicazioni di chi ti segue', rows: 3, maxlength: 1000, value: st.professional_notes,
      hint: 'Scrivi qui ciò che ti ha detto il professionista. Le proposte ne tengono conto e hanno sempre la precedenza. ALE. non le interpreta e non le sostituisce.' });
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
    } }, h('h2', { class: 'card-title' }, 'Spazi e preferenze'), spaces.wrap,
    h('label', { class: 'check-row', for: 'st-noeq' }, noEq, h('span', null, 'Preferisco attività senza attrezzi')),
    limits.wrap, pro.wrap, err, save);
  }

  await reload();
  const spaces = await spacesCard();
  return h('main', { class: 'shell with-tabs' },
    pageHeader({ title: 'Attrezzatura e spazi', back: { href: '#/profilo', label: 'Profilo' } }),
    h('p', { class: 'muted' }, 'Scrivi cosa hai in casa e dove ti muovi. Potrai cambiarlo quando vuoi, ad esempio se compri qualcosa di nuovo.'),
    listHost, formHost, spaces);
}
