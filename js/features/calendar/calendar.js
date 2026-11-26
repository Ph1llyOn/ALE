// #/calendario — vista mensile e settimanale, sette categorie, creazione/modifica/eliminazione/completamento, proposte di Phill.
import { h, field, textField, errorBox, emptyState, withBusy, toast, spinner, chip } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { listEvents, listProposedEvents, createEvent, updateEvent, setEventCompleted, decideEvent, deleteEvent } from '../../core/api-calendar.js';
import { segmented, pageHeader } from '../../components/controls.js';
import { profileErrorView } from '../../components/profile-error.js';
import { icon } from '../../components/icons.js';
import {
  CATEGORIES, categoryLabel, monthGrid, monthRange, weekRange, weekDays, eventsByDay, dayKey, parseDayKey, addDays, addMonths, sameDay,
  toIso, timeOf, validateEvent, MONTHS, WEEKDAYS_SHORT, WEEKDAYS_LONG,
} from '../../data/calendar-util.js';

let view = 'mese';

export default async function calendarView() {
  const { profile } = getState();
  if (!profile) return profileErrorView(getState().loadError);

  let anchor = new Date();       // mese/settimana mostrati
  let selected = dayKey(new Date());
  let events = []; let proposals = [];
  const host = h('div', { class: 'stack' });
  const agenda = h('section', { class: 'card stack', 'aria-live': 'polite' });
  const formHost = h('div');
  const proposalHost = h('div', { class: 'stack' });

  const seg = segmented({
    label: 'Vista del calendario',
    options: [{ value: 'mese', label: 'Mese' }, { value: 'settimana', label: 'Settimana' }],
    value: view, onChange: (v) => { view = v; load(); },
  });

  async function load() {
    host.replaceChildren(spinner());
    try {
      const range = view === 'mese' ? monthRange(anchor.getFullYear(), anchor.getMonth()) : weekRange(anchor);
      [events, proposals] = await Promise.all([listEvents(profile.id, range.from, range.to), listProposedEvents(profile.id)]);
    } catch (err) { host.replaceChildren(errorBox(err.message, { onRetry: load })); return; }
    paint();
  }

  const confirmed = () => events.filter((e) => e.status === 'confirmed');
  const nav = (delta) => { anchor = view === 'mese' ? addMonths(anchor, delta) : addDays(anchor, delta * 7); load(); };

  function paint() {
    const byDay = eventsByDay(confirmed());
    const title = view === 'mese'
      ? `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
      : (() => { const d = weekDays(anchor); return `${d[0].getDate()} ${MONTHS[d[0].getMonth()].slice(0, 3)} – ${d[6].getDate()} ${MONTHS[d[6].getMonth()].slice(0, 3)}`; })();
    const bar = h('div', { class: 'cal-bar' },
      h('button', { class: 'btn btn-text', type: 'button', 'aria-label': 'Precedente', onclick: () => nav(-1) }, '‹'),
      h('h2', { class: 'cal-title' }, title),
      h('button', { class: 'btn btn-text', type: 'button', 'aria-label': 'Successivo', onclick: () => nav(1) }, '›'));
    const today = h('button', { class: 'btn btn-text', type: 'button', onclick: () => { anchor = new Date(); selected = dayKey(anchor); load(); } }, 'Oggi');

    const cell = (d, inMonth = true) => {
      const k = dayKey(d);
      const n = byDay.get(k)?.length ?? 0;
      return h('button', { type: 'button', class: `cal-cell${inMonth ? '' : ' out'}${k === selected ? ' selected' : ''}${sameDay(d, new Date()) ? ' today' : ''}`,
        'aria-label': `${d.getDate()} ${MONTHS[d.getMonth()]}${n ? `, ${n} ${n === 1 ? 'evento' : 'eventi'}` : ''}`, 'aria-pressed': String(k === selected),
        onclick: () => { selected = k; paint(); } },
        h('span', { class: 'cal-num' }, String(d.getDate())),
        n ? h('span', { class: 'cal-dots' }, Array.from({ length: Math.min(n, 3) }, () => h('span', { class: 'cal-dot' }))) : null);
    };

    const head = h('div', { class: 'cal-grid cal-head', 'aria-hidden': 'true' }, WEEKDAYS_SHORT.map((w) => h('span', null, w)));
    const grid = h('div', { class: 'cal-grid' });
    if (view === 'mese') for (const wk of monthGrid(anchor.getFullYear(), anchor.getMonth())) for (const d of wk) grid.append(cell(d, d.getMonth() === anchor.getMonth()));
    else for (const d of weekDays(anchor)) grid.append(cell(d));

    host.replaceChildren(h('section', { class: 'card stack' }, bar, head, grid, h('div', { class: 'row-center' }, today)));
    paintAgenda(byDay);
    paintProposals();
  }

  function paintAgenda(byDay) {
    const d = parseDayKey(selected);
    const list = byDay.get(selected) ?? [];
    agenda.replaceChildren(
      h('div', { class: 'row' }, h('h2', { class: 'card-title grow' }, `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`),
        h('button', { class: 'btn', type: 'button', onclick: () => openForm(null) }, '+ Evento')),
      list.length ? h('ul', { class: 'plain-list' }, list.map(eventRow)) : emptyState('Niente in programma', 'Una giornata libera è una bella giornata.'));
  }

  function eventRow(e) {
    const done = h('button', { class: 'check', type: 'button', 'aria-pressed': String(e.completed), 'aria-label': `${e.title}: ${e.completed ? 'fatto' : 'da fare'}`,
      onclick: async () => { try { await setEventCompleted(e.id, !e.completed); e.completed = !e.completed; paint(); } catch (err) { toast(err.message, 'error'); } } }, icon('check', { size: 18 }));
    return h('li', { class: `row event-row${e.completed ? ' exercise-done' : ''}` }, done,
      h('div', { class: 'grow' }, h('p', { class: 'list-title' }, e.title),
        h('p', { class: 'muted small' }, e.all_day ? 'Tutto il giorno' : `${timeOf(e.starts_at)}${e.ends_at ? `–${timeOf(e.ends_at)}` : ''}`, ' · ', categoryLabel(e.category)),
        e.notes ? h('p', { class: 'muted small ticket-body-plain' }, e.notes) : null),
      h('button', { class: 'btn btn-text', type: 'button', 'aria-label': `Modifica ${e.title}`, onclick: () => openForm(e) }, icon('edit', { size: 18 })));
  }

  function paintProposals() {
    if (!proposals.length) { proposalHost.replaceChildren(); return; }
    const run = (e, status, text) => async (ev) => withBusy(ev.currentTarget, async () => {
      try { await decideEvent(e.id, status); toast(text, 'success'); await load(); } catch (err) { toast(err.message, 'error'); }
    });
    proposalHost.replaceChildren(h('div', { class: 'section-head' }, h('h2', null, 'Proposte da Phill')),
      ...proposals.map((e) => h('article', { class: 'card stack' },
        h('p', { class: 'card-title' }, e.title),
        h('p', { class: 'muted' }, `${parseDayKey(dayKey(new Date(e.starts_at))).getDate()} ${MONTHS[new Date(e.starts_at).getMonth()]}${e.all_day ? '' : ` · ${timeOf(e.starts_at)}`} · ${categoryLabel(e.category)}`),
        e.notes ? h('p', { class: 'muted ticket-body-plain' }, e.notes) : null,
        h('p', { class: 'muted small' }, 'È una proposta: decidi tu. Se accetti, entra nel tuo calendario.'),
        h('div', { class: 'row-center' },
          h('button', { class: 'btn', type: 'button', onclick: run(e, 'confirmed', 'Evento aggiunto.') }, 'Accetta'),
          h('button', { class: 'btn btn-text', type: 'button', onclick: run(e, 'declined', 'Proposta messa da parte.') }, 'Non ora')))));
  }

  function openForm(e) {
    const title = field({ id: 'ev-title', label: 'Nome dell’evento', value: e?.title ?? '', maxlength: 120, autocomplete: 'off' });
    const catSel = h('select', { id: 'ev-cat', class: 'input', 'aria-label': 'Categoria' }, CATEGORIES.map((c) => h('option', { value: c.key, selected: (e?.category ?? 'personal') === c.key }, c.label)));
    const day = h('input', { id: 'ev-day', type: 'date', class: 'input', value: e ? dayKey(new Date(e.starts_at)) : selected, required: true });
    const allDay = h('input', { id: 'ev-all', type: 'checkbox', checked: Boolean(e?.all_day) });
    const start = h('input', { id: 'ev-start', type: 'time', class: 'input', value: e && !e.all_day ? timeOf(e.starts_at) : '09:00' });
    const end = h('input', { id: 'ev-end', type: 'time', class: 'input', value: e?.ends_at ? timeOf(e.ends_at) : '' });
    const times = h('div', { class: 'mini-row', hidden: Boolean(e?.all_day) },
      h('label', { class: 'mini-field' }, h('span', { class: 'muted small' }, 'Inizio'), start), h('label', { class: 'mini-field' }, h('span', { class: 'muted small' }, 'Fine'), end));
    allDay.addEventListener('change', () => { times.hidden = allDay.checked; });
    const notes = textField({ id: 'ev-notes', label: 'Note (facoltative)', rows: 2, maxlength: 2000, value: e?.notes ?? '' });
    const error = h('p', { class: 'form-error', role: 'alert' });
    const save = h('button', { class: 'btn', type: 'submit' }, e ? 'Salva' : 'Aggiungi');
    const form = h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
      ev.preventDefault();
      error.textContent = '';
      const err = validateEvent({ title: title.input.value, day: day.value, time: start.value, endTime: end.value, allDay: allDay.checked });
      if (err) { error.textContent = err; return; }
      const payload = {
        title: title.input.value, category: catSel.value, allDay: allDay.checked, notes: notes.input.value,
        startsAt: toIso(day.value, allDay.checked ? '' : start.value), endsAt: !allDay.checked && end.value ? toIso(day.value, end.value) : null,
      };
      withBusy(save, async () => {
        try {
          if (e) await updateEvent(e.id, payload); else await createEvent(profile.id, payload);
          toast(e ? 'Evento aggiornato.' : 'Evento aggiunto.', 'success');
          selected = day.value; anchor = parseDayKey(day.value); formHost.replaceChildren(); await load();
        } catch (er) { error.textContent = er.message; }
      });
    } },
    title.wrap,
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'ev-cat' }, 'Categoria'), catSel),
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'ev-day' }, 'Giorno'), day),
    h('label', { class: 'check-row', for: 'ev-all' }, allDay, h('span', null, 'Tutto il giorno')), times, notes.wrap, error,
    h('div', { class: 'row-center' }, save, h('button', { class: 'btn btn-text', type: 'button', onclick: () => formHost.replaceChildren() }, 'Annulla'),
      e ? (() => {
        const del = h('button', { class: 'btn btn-text btn-danger-text', type: 'button', onclick: () => {
          if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tocca ancora per eliminare'; return; }
          withBusy(del, async () => { try { await deleteEvent(e.id); toast('Evento eliminato.'); formHost.replaceChildren(); await load(); } catch (er) { toast(er.message, 'error'); } });
        } }, 'Elimina');
        return del;
      })() : null));
    formHost.replaceChildren(h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, e ? 'Modifica l’evento' : 'Nuovo evento'), form));
    formHost.scrollIntoView({ behavior: 'smooth', block: 'center' });
    title.input.focus();
  }

  await load();
  void chip;
  return h('main', { class: 'shell with-tabs' }, pageHeader({ title: 'Calendario', eyebrow: 'La tua settimana' }), seg.el, host, agenda, formHost, proposalHost,
    h('p', { class: 'muted small center' }, 'Il calendario è tuo: serve a organizzarti, non a controllarti.'));
}
