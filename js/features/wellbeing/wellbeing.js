// #/profilo/benessere — umore, energia e una nota facoltativa. Tutto privato di default; la nota non è mai condivisibile.
import { h, errorBox, emptyState, withBusy, toast, textField, spinner } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { listWellbeing, saveWellbeing, deleteWellbeing } from '../../core/api-personal.js';
import { scale, pageHeader } from '../../components/controls.js';
import { profileErrorView } from '../../components/profile-error.js';
import { MOODS, ENERGIES, moodLabel, energyLabel } from '../../core/moods.js';
import { localDay, fmtDayLabel } from '../../core/format.js';
import { lastDays, alignSeries, sparkline } from '../../core/chart.js';

const HISTORY_DAYS = 14;

export default async function wellbeingView() {
  const { profile } = getState();
  if (!profile) return profileErrorView(getState().loadError);

  const today = localDay();
  const days = lastDays(HISTORY_DAYS);
  let logs = [];
  let day = today;
  let mood = null;
  let energy = null;

  const formHost = h('section', { class: 'card stack' });
  const historyHost = h('section', { class: 'card stack' });

  async function load() {
    logs = await listWellbeing(profile.id, days[0]);
  }

  function paintForm() {
    const existing = logs.find((l) => l.day === day);
    mood = existing?.mood ?? null;
    energy = existing?.energy ?? null;
    const note = textField({ id: 'wb-note', label: 'Una nota, se ti va', rows: 3, maxlength: 1000, value: existing?.note ?? '',
      hint: 'La nota resta solo tua, anche se condividi umore ed energia.' });
    const dateInput = h('input', { type: 'date', id: 'wb-day', class: 'input', value: day, max: today, 'aria-label': 'Giorno da registrare',
      onchange: () => { if (dateInput.value && dateInput.value <= today) { day = dateInput.value; paintForm(); } else dateInput.value = day; } });
    const error = h('p', { class: 'form-error', role: 'alert' });
    const save = h('button', { class: 'btn', type: 'submit' }, existing ? 'Aggiorna' : 'Salva');

    const form = h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
      ev.preventDefault();
      error.textContent = '';
      if (!mood || !energy) { error.textContent = 'Scegli un valore per l’umore e uno per l’energia.'; return; }
      withBusy(save, async () => {
        try {
          await saveWellbeing(profile.id, { day, mood, energy, note: note.input.value });
          await load();
          toast('Salvato. Grazie di averlo segnato.', 'success');
          paintForm();
          paintHistory();
        } catch (err) { error.textContent = err.message; }
      });
    } },
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'wb-day' }, 'Giorno'), dateInput),
    scale({ name: 'mood', label: 'Come ti senti?', options: MOODS, value: mood, onChange: (v) => { mood = v; } }),
    scale({ name: 'energy', label: 'Quanta energia hai?', options: ENERGIES, value: energy, onChange: (v) => { energy = v; } }),
    note.wrap, error,
    h('div', { class: 'row-center' }, save, existing ? deleteButton(existing) : null));

    formHost.replaceChildren(
      h('h2', { class: 'card-title' }, day === today ? 'Come ti senti oggi?' : `Come ti sentivi il ${fmtDayLabel(day)}?`),
      h('p', { class: 'muted' }, 'Non ci sono risposte giuste o sbagliate. Serve solo a te.'),
      form);
  }

  function deleteButton(existing) {
    const btn = h('button', { class: 'btn btn-text btn-danger-text', type: 'button', onclick: () => {
      if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Tocca ancora per eliminare'; return; }
      withBusy(btn, async () => {
        try { await deleteWellbeing(existing.id); await load(); toast('Registro eliminato.'); paintForm(); paintHistory(); }
        catch (err) { toast(err.message, 'error'); }
      });
    } }, 'Elimina questo giorno');
    return btn;
  }

  function paintHistory() {
    const recent = logs.slice(0, HISTORY_DAYS);
    if (!recent.length) {
      historyHost.replaceChildren(h('h2', { class: 'card-title' }, 'Gli ultimi giorni'), emptyState('Ancora nessun registro', 'Quando ne segnerai qualcuno, lo vedrai qui.'));
      return;
    }
    historyHost.replaceChildren(
      h('h2', { class: 'card-title' }, 'Gli ultimi giorni'),
      h('div', { class: 'spark-block' }, h('p', { class: 'muted small' }, 'Umore'), sparkline(alignSeries(logs, days, 'mood'), { label: 'Andamento dell’umore negli ultimi 14 giorni' })),
      h('div', { class: 'spark-block' }, h('p', { class: 'muted small' }, 'Energia'), sparkline(alignSeries(logs, days, 'energy'), { label: 'Andamento dell’energia negli ultimi 14 giorni' })),
      h('ul', { class: 'plain-list' }, recent.map((l) => h('li', { class: 'row' },
        h('span', { class: 'grow' }, h('span', { class: 'list-title' }, fmtDayLabel(l.day)),
          h('span', { class: 'muted block small' }, `${moodLabel(l.mood)} · energia ${energyLabel(l.energy).toLowerCase()}`)),
        h('button', { class: 'btn btn-text', type: 'button', onclick: () => { day = l.day; paintForm(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }, 'Modifica')))));
  }

  const main = h('main', { class: 'shell with-tabs' },
    pageHeader({ title: 'Benessere', back: { href: '#/profilo', label: 'Profilo' } }), spinner());
  try {
    await load();
    paintForm();
    paintHistory();
    main.replaceChildren(pageHeader({ title: 'Benessere', back: { href: '#/profilo', label: 'Profilo' } }), formHost, historyHost,
      h('p', { class: 'muted small center' }, 'Umore ed energia sono privati. Puoi decidere se condividerli con Phill in Profilo › Privacy e dati.'));
  } catch (err) {
    main.replaceChildren(pageHeader({ title: 'Benessere', back: { href: '#/profilo', label: 'Profilo' } }), errorBox(err.message, { onRetry: () => location.reload() }));
  }
  return main;
}
