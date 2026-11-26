// #/condiviso (solo Phill) — il dettaglio di ciò che Alessia ha scelto di condividere. Se non condivide, qui non c'è nulla:
// lo decide il database (RLS), questa pagina si limita a leggere.
import { h, errorBox, emptyState, chip } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { pageHeader } from '../../components/controls.js';
import { profileErrorView } from '../../components/profile-error.js';
import { sharedWithMe, sharedWellbeing, sharedProgress, sharedEquipment, sharedHabits, sharedGoals, sharedSessions } from '../../core/api-partner.js';
import { listSharedEvents } from '../../core/api-calendar.js';
import { listSharedEntries } from '../../core/api-journal.js';
import { lastDays, alignSeries, sparkline } from '../../core/chart.js';
import { fmtDayMonth, fmtDateTime, fmtDate, localDay } from '../../core/format.js';
import { moodLabel, energyLabel } from '../../core/moods.js';
import { categoryLabel } from '../../data/calendar-util.js';

export default async function sharedView() {
  const { profile, partner, partnership } = getState();
  if (!profile) return profileErrorView(getState().loadError);
  const root = h('main', { class: 'shell with-tabs stack' }, pageHeader({ eyebrow: 'Area di Phill', title: 'Condiviso con te' }));
  if (!(partnership && partner)) { root.append(h('div', { class: 'card muted' }, 'Qui vedrai ciò che Alessia sceglie di condividere, appena sarete collegati.')); return root; }

  let shared;
  try { shared = await sharedWithMe(partner.id, profile.id); } catch (err) { root.append(errorBox(err.message)); return root; }
  root.append(h('p', { class: 'muted' }, `Qui c’è solo ciò che ${partner.display_name} ha deciso di condividere. Può cambiare idea in qualsiasi momento.`));
  if (!shared.size) { root.append(h('div', { class: 'card' }, emptyState('Per ora non è condiviso nulla', 'Va benissimo così: sceglie lei cosa e quando.'))); return root; }

  const days = lastDays(14);
  const since = days[0];
  const sections = [
    ['wellbeing', 'Benessere', async () => {
      const logs = await sharedWellbeing(partner.id, since);
      if (!logs.length) return h('p', { class: 'muted' }, 'Nessun giorno segnato negli ultimi 14 giorni.');
      return h('div', { class: 'stack' }, sparkline(alignSeries(logs, days, 'mood'), { label: 'Come è andato l’umore negli ultimi 14 giorni' }),
        h('ul', { class: 'plain-list' }, logs.slice(0, 5).map((l) => h('li', null, h('span', { class: 'list-title' }, l.day === localDay() ? 'Oggi' : fmtDayMonth(`${l.day}T12:00:00`)),
          h('span', { class: 'muted block small' }, `Umore «${moodLabel(l.mood)}» · energia «${energyLabel(l.energy)}»`)))),
        h('p', { class: 'muted small' }, 'Le note personali non si possono mai condividere.'));
    }],
    ['activities', 'Attività', async () => {
      const s = await sharedSessions(partner.id);
      return s.length ? h('ul', { class: 'plain-list' }, s.map((x) => h('li', null, h('span', { class: 'list-title' }, x.title),
        h('span', { class: 'muted block small' }, `${fmtDate(x.started_at)} · ${x.done}/${x.total} esercizi`)))) : h('p', { class: 'muted' }, 'Nessun allenamento finito di recente.');
    }],
    ['habits', 'Abitudini', async () => {
      const hs = await sharedHabits(partner.id, since);
      return hs.length ? h('ul', { class: 'plain-list' }, hs.map((x) => h('li', null, h('span', { class: 'list-title' }, x.name),
        h('span', { class: 'muted block small' }, `${x.days.length} giorni su 14`)))) : h('p', { class: 'muted' }, 'Nessuna abitudine aggiunta.');
    }],
    ['progress', 'Progressi e obiettivi', async () => {
      const [recs, goals] = await Promise.all([sharedProgress(partner.id, 8), sharedGoals(partner.id)]);
      return h('div', { class: 'stack' },
        recs.length ? h('ul', { class: 'plain-list' }, recs.map((r) => h('li', null, h('span', { class: 'list-title' }, r.title), h('span', { class: 'muted block small' }, fmtDayMonth(`${r.achieved_on}T12:00:00`))))) : h('p', { class: 'muted' }, 'Ancora nessuna piccola conquista segnata.'),
        goals.length ? h('div', { class: 'stack' }, h('p', { class: 'card-title' }, 'Obiettivi'), h('ul', { class: 'plain-list' }, goals.map((g) => h('li', { class: 'row' }, h('span', { class: 'grow list-title' }, g.title), chip(g.status === 'done' ? 'Raggiunto' : 'In corso', g.status === 'done' ? 'ok' : ''))))) : null);
    }],
    ['calendar', 'Calendario', async () => {
      const from = new Date().toISOString(); const to = new Date(Date.now() + 14 * 86400000).toISOString();
      const ev = await listSharedEvents(partner.id, from, to);
      return ev.length ? h('ul', { class: 'plain-list' }, ev.map((e) => h('li', null, h('span', { class: 'list-title' }, e.title),
        h('span', { class: 'muted block small' }, `${categoryLabel(e.category)} · ${e.all_day ? fmtDate(e.starts_at) : fmtDateTime(e.starts_at)}`)))) : h('p', { class: 'muted' }, 'Nessun evento nei prossimi 14 giorni.');
    }],
    ['equipment', 'Attrezzi', async () => {
      const items = await sharedEquipment(partner.id);
      return items.length ? h('div', { class: 'chips' }, items.map((i) => chip(i.name, i.avoid ? 'muted' : ''))) : h('p', { class: 'muted' }, 'Nessun attrezzo inserito.');
    }],
    ['journal', 'Diario', async () => {
      const entries = await listSharedEntries(partner.id, { limit: 10 });
      return entries.length ? h('div', { class: 'stack' }, entries.map((e) => h('article', { class: 'stack' },
        h('p', { class: 'list-title' }, e.title || 'Senza titolo'), h('p', { class: 'muted small' }, fmtDate(e.created_at)), h('p', { class: 'prewrap' }, e.body))))
        : h('p', { class: 'muted' }, 'Nessuna voce condivisa: Alessia sceglie le voci una per una.');
    }],
  ];
  for (const [key, title, load] of sections) {
    if (!shared.has(key)) continue;
    const card = h('section', { class: 'card stack', 'aria-label': title }, h('h2', { class: 'card-title' }, title));
    root.append(card);
    try { card.append(await load()); } catch (err) { card.append(errorBox(err.message)); }
  }
  return root;
}
