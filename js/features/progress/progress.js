// #/profilo/progressi — crescita personale. Nessuna classifica, nessun confronto, mai peso o misure.
import { h, errorBox, emptyState } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { listWellbeing, listProgress } from '../../core/api-personal.js';
import { pageHeader } from '../../components/controls.js';
import { profileErrorView } from '../../components/profile-error.js';
import { lastDays, alignSeries, sparkline, average } from '../../core/chart.js';
import { moodLabel, energyLabel } from '../../core/moods.js';
import { fmtDayMonth } from '../../core/format.js';

const DAYS = 30;

export default async function progressView() {
  const { profile } = getState();
  if (!profile) return profileErrorView(getState().loadError);
  const header = pageHeader({ title: 'I tuoi progressi', back: { href: '#/profilo', label: 'Profilo' } });

  let logs; let records;
  try {
    const days = lastDays(DAYS);
    [logs, records] = await Promise.all([listWellbeing(profile.id, days[0]), listProgress(profile.id)]);
    const moods = alignSeries(logs, days, 'mood');
    const energies = alignSeries(logs, days, 'energy');
    const avgMood = average(moods);
    const avgEnergy = average(energies);

    const trends = h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, 'Come stai andando'));
    if (!logs.length) {
      trends.append(emptyState('Ancora nessun dato', 'Segna come ti senti nella sezione Benessere: qui vedrai l’andamento, con i tuoi tempi.'),
        h('a', { class: 'btn btn-secondary', href: '#/profilo/benessere' }, 'Vai a Benessere'));
    } else {
      trends.append(
        h('div', { class: 'spark-block' }, h('p', { class: 'muted small' }, `Umore · ultimi ${DAYS} giorni`), sparkline(moods, { label: `Andamento dell’umore negli ultimi ${DAYS} giorni` })),
        h('div', { class: 'spark-block' }, h('p', { class: 'muted small' }, `Energia · ultimi ${DAYS} giorni`), sparkline(energies, { label: `Andamento dell’energia negli ultimi ${DAYS} giorni` })),
        h('p', null, `In ${logs.length} ${logs.length === 1 ? 'giorno' : 'giorni'} ti sei fermata a notare come stavi. `,
          avgMood ? `In media: umore «${moodLabel(Math.round(avgMood))}», energia «${energyLabel(Math.round(avgEnergy))}».` : ''),
        h('p', { class: 'muted small' }, 'I giorni senza registro non contano: non c’è nulla da recuperare.'));
    }

    const wins = h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, 'Piccole conquiste'));
    if (!records.length) {
      wins.append(emptyState('Qui compariranno le tue conquiste', 'Abitudini consolidate, obiettivi raggiunti, allenamenti completati: le troverai qui man mano che usi ALE.'));
    } else {
      wins.append(h('ul', { class: 'plain-list' }, records.map((r) => h('li', null,
        h('span', { class: 'list-title' }, r.title), h('span', { class: 'muted block small' }, fmtDayMonth(`${r.achieved_on}T12:00:00`))))));
    }

    return h('main', { class: 'shell with-tabs' }, header,
      h('p', { class: 'muted' }, 'Qui vedi la tua crescita, con i tuoi tempi. Nessuna classifica e nessun confronto: conta solo il tuo percorso.'),
      trends, wins);
  } catch (err) {
    return h('main', { class: 'shell with-tabs' }, header, errorBox(err.message, { onRetry: () => location.reload() }));
  }
}
