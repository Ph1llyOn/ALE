// #/messaggi — l'area di Phill per scrivere biglietti: subito o programmati, con modifica, eliminazione e storico.
// Phill NON vede se Alessia ha letto: nessuna ricevuta, nessuna pressione.
import { h, field, textField, errorBox, emptyState, withBusy, toast, spinner, chip } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import {
  listSent, listScheduled, sendNow, schedule, updateSent, deleteSent, updateScheduled, cancelScheduled, deleteScheduled,
} from '../../core/api-messages.js';
import { messageCard } from '../../components/message-card.js';
import { segmented, pageHeader } from '../../components/controls.js';
import { profileErrorView } from '../../components/profile-error.js';
import { toLocalInputValue, fromLocalInputValue, minScheduleDate, validateSchedule, fmtDateTime } from '../../core/format.js';

const BODY_MAX = 2000;
const TITLE_MAX = 120;

export default async function phillMessagesView() {
  const { profile, partner, partnership } = getState();
  if (!profile) return profileErrorView(getState().loadError);

  const header = pageHeader({ title: 'I tuoi biglietti', eyebrow: 'Messaggi' });
  if (!(partnership && partner)) {
    return h('main', { class: 'shell with-tabs' }, header, h('section', { class: 'card stack' },
      h('p', null, 'Per scrivere dei biglietti devi essere collegato ad Alessia.'),
      h('a', { class: 'btn', href: '#/profilo/collegamento' }, 'Inserisci il codice')));
  }

  let tab = 'scrivi';
  const body = h('div', { class: 'stack' });
  const seg = segmented({
    label: 'Sezioni dei messaggi',
    options: [{ value: 'scrivi', label: 'Scrivi' }, { value: 'inviati', label: 'Inviati' }, { value: 'programmati', label: 'Programmati' }],
    value: tab,
    onChange: (v) => { tab = v; show(); },
  });
  const go = (next) => { tab = next; seg.select(next); show(); };

  async function show() {
    body.replaceChildren(spinner());
    try {
      if (tab === 'scrivi') body.replaceChildren(composeForm({ partner, profile, onDone: (kind) => go(kind === 'now' ? 'inviati' : 'programmati') }));
      else if (tab === 'inviati') body.replaceChildren(await sentList({ profile, partner, refresh: show }));
      else body.replaceChildren(await scheduledList({ profile, partner, refresh: show }));
    } catch (err) {
      body.replaceChildren(errorBox(err.message, { onRetry: show }));
    }
  }

  await show();
  return h('main', { class: 'shell with-tabs' }, header, seg.el, body);
}

// ----------------------------------------------------------------------------
/** Form di scrittura. mode: 'new' | 'edit-sent' | 'edit-scheduled'. */
function composeForm({ partner, profile, mode = 'new', initial = {}, onDone, onCancel }) {
  const title = field({ id: `title-${mode}`, label: 'Titolo (facoltativo)', value: initial.title ?? '', maxlength: TITLE_MAX, required: false, autocomplete: 'off' });
  const text = textField({ id: `body-${mode}`, label: 'Il tuo biglietto', rows: 6, maxlength: BODY_MAX, required: true, value: initial.body ?? '',
    placeholder: `Scrivi qualcosa di dolce per ${partner.display_name}…` });
  const error = h('p', { class: 'form-error', role: 'alert' });

  // quando: subito o programmato (solo per i nuovi e per i programmati)
  const canChooseWhen = mode === 'new';
  const showWhen = mode === 'new' || mode === 'edit-scheduled';
  let when = mode === 'edit-scheduled' ? 'later' : 'now';
  const defaultLater = initial.send_at ? new Date(initial.send_at) : (() => { const d = minScheduleDate(); d.setHours(d.getHours() + 1); return d; })();
  const dateInput = h('input', { type: 'datetime-local', id: `when-${mode}`, class: 'input', min: toLocalInputValue(minScheduleDate()), value: toLocalInputValue(defaultLater), 'aria-describedby': `when-${mode}-msg` });
  const dateMsg = h('p', { id: `when-${mode}-msg`, class: 'field-msg', 'aria-live': 'polite' }, 'Il biglietto arriverà ad Alessia nel momento scelto.');
  const dateBox = h('div', { class: 'field', hidden: when === 'now' }, h('label', { class: 'label', for: `when-${mode}` }, 'Quando'), dateInput, dateMsg);
  const submit = h('button', { class: 'btn', type: 'submit' });
  const paintSubmit = () => {
    submit.textContent = mode === 'new' ? (when === 'now' ? 'Invia ora' : 'Programma') : 'Salva le modifiche';
  };
  paintSubmit();

  const whenChoice = canChooseWhen
    ? h('fieldset', { class: 'choices' }, h('legend', { class: 'label' }, 'Quando inviarlo'),
      h('div', { class: 'choice-row' },
        ...[['now', 'Subito', 'Arriva adesso'], ['later', 'Programmato', 'Scegli data e ora']].map(([value, titleText, sub]) => {
          const input = h('input', { type: 'radio', name: `when-${mode}`, id: `when-${mode}-${value}`, value, class: 'sr-only', checked: when === value,
            onchange: () => { when = value; dateBox.hidden = value === 'now'; paintSubmit(); } });
          return h('label', { class: 'choice', for: `when-${mode}-${value}` }, input, h('span', { class: 'choice-title' }, titleText), h('span', { class: 'muted' }, sub));
        })))
    : null;

  const form = h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    error.textContent = '';
    const t = text.input.value.trim();
    text.setError(t ? (t.length > BODY_MAX ? `Al massimo ${BODY_MAX} caratteri.` : null) : 'Scrivi qualcosa nel biglietto.');
    const needsDate = showWhen && when === 'later';
    const dErr = needsDate ? validateSchedule(dateInput.value) : null;
    dateMsg.textContent = dErr || 'Il biglietto arriverà ad Alessia nel momento scelto.';
    dateMsg.classList.toggle('is-error', Boolean(dErr));
    if (!t || t.length > BODY_MAX || dErr) return;
    withBusy(submit, async () => {
      try {
        const values = { title: title.input.value, body: t };
        if (mode === 'new' && when === 'now') {
          await sendNow({ senderId: profile.id, recipientId: partner.id, ...values });
          toast('Biglietto inviato.', 'success');
          onDone?.('now');
        } else if (mode === 'new') {
          await schedule({ senderId: profile.id, recipientId: partner.id, ...values, sendAtIso: fromLocalInputValue(dateInput.value) });
          toast('Biglietto programmato.', 'success');
          onDone?.('later');
        } else if (mode === 'edit-sent') {
          await updateSent(initial.id, values);
          toast('Biglietto modificato.', 'success');
          onDone?.();
        } else {
          await updateScheduled(initial.id, { ...values, sendAtIso: fromLocalInputValue(dateInput.value) });
          toast('Biglietto aggiornato.', 'success');
          onDone?.();
        }
      } catch (err) { error.textContent = err.message; }
    });
  } }, title.wrap, text.wrap, whenChoice, showWhen ? dateBox : null, error,
  h('div', { class: 'row-center' }, submit, onCancel ? h('button', { class: 'btn btn-text', type: 'button', onclick: onCancel }, 'Annulla') : null));

  return h('section', { class: 'card stack' },
    mode === 'new' ? h('p', { class: 'muted' }, `Un biglietto per ${partner.display_name}: arriverà nella sua Home, firmato «Da ${profile.display_name}».`) : h('p', { class: 'card-title' }, 'Modifica il biglietto'),
    form);
}

// ----------------------------------------------------------------------------
function confirmDelete({ label, onConfirm }) {
  const box = h('div', { class: 'confirm', hidden: true, role: 'alert' });
  const ask = h('button', { class: 'btn btn-text btn-danger-text', type: 'button', onclick: () => { box.hidden = false; ask.hidden = true; yes.focus(); } }, label);
  const yes = h('button', { class: 'btn btn-danger', type: 'button', onclick: () => withBusy(yes, onConfirm) }, 'Sì, elimina');
  const no = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { box.hidden = true; ask.hidden = false; } }, 'No');
  box.append(h('p', null, 'Eliminare questo biglietto?'), h('div', { class: 'row-center' }, yes, no));
  return [ask, box];
}

async function sentList({ profile, partner, refresh }) {
  const items = await listSent(profile.id);
  if (!items.length) return h('div', { class: 'card' }, emptyState('Ancora nessun biglietto inviato', 'I biglietti che invii restano qui, per rileggerli o correggerli.'));
  const wrap = h('div', { class: 'stack' });
  for (const m of items) {
    const slot = h('div');
    const view = () => slot.replaceChildren(messageCard(m, { senderName: profile.display_name, actions: [
      h('button', { class: 'btn btn-text', type: 'button', onclick: edit }, 'Modifica'),
      ...confirmDelete({ label: 'Elimina', onConfirm: async () => {
        try { await deleteSent(m.id); toast('Biglietto eliminato.'); await refresh(); } catch (err) { toast(err.message, 'error'); }
      } }),
    ] }));
    const edit = () => slot.replaceChildren(composeForm({ partner, profile, mode: 'edit-sent', initial: m, onDone: refresh, onCancel: view }));
    view();
    wrap.append(slot);
  }
  wrap.append(h('p', { class: 'muted small center' }, 'Se modifichi o elimini un biglietto, cambia anche per Alessia.'));
  return wrap;
}

const STATUS = {
  pending: { text: 'In attesa', kind: '' },
  failed: { text: 'Non è stato possibile inviarlo', kind: 'warn' },
  cancelled: { text: 'Annullato', kind: 'muted' },
};

async function scheduledList({ profile, partner, refresh }) {
  const items = await listScheduled(profile.id);
  if (!items.length) return h('div', { class: 'card' }, emptyState('Nessun biglietto programmato', 'Programma un biglietto per farlo arrivare nel momento giusto, anche quando non ci sei.'));
  const wrap = h('div', { class: 'stack' });
  for (const m of items) {
    const slot = h('div');
    const st = STATUS[m.status] ?? STATUS.pending;
    const run = (fn, okText) => async () => { try { await fn(); toast(okText); await refresh(); } catch (err) { toast(err.message, 'error'); } };
    const view = () => {
      const actions = [];
      if (m.status === 'pending') {
        actions.push(h('button', { class: 'btn btn-text', type: 'button', onclick: edit }, 'Modifica'));
        const cancel = h('button', { class: 'btn btn-text', type: 'button', onclick: () => withBusy(cancel, run(() => cancelScheduled(m.id), 'Invio annullato.')) }, 'Annulla invio');
        actions.push(cancel);
      }
      actions.push(...confirmDelete({ label: 'Elimina', onConfirm: run(() => deleteScheduled(m.id), 'Biglietto eliminato.') }));
      slot.replaceChildren(messageCard({ ...m, sent_at: m.send_at }, {
        senderName: profile.display_name, actions, showDate: false,
        extra: h('p', { class: 'ticket-when' }, chip(st.text, st.kind), m.status === 'pending' ? ` Partirà il ${fmtDateTime(m.send_at)}` : ` Era previsto per il ${fmtDateTime(m.send_at)}`),
      }));
    };
    const edit = () => slot.replaceChildren(composeForm({ partner, profile, mode: 'edit-scheduled', initial: m, onDone: refresh, onCancel: view }));
    view();
    wrap.append(slot);
  }
  return wrap;
}
