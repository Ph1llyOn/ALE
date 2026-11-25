// #/profilo/progressi — crescita personale: andamento di umore ed energia, obiettivi, abitudini consolidate, piccole conquiste.
// Nessuna classifica, nessun confronto, mai peso o misure.
import { h, field, errorBox, emptyState, withBusy, toast } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { listWellbeing, listProgress } from '../../core/api-personal.js';
import { listGoals, addGoal, setGoalDone, deleteGoal, listHabits, isConsolidated, listSessions } from '../../core/api-activities.js';
import { getAiPrefs } from '../../core/api-settings.js';
import { aiReflection } from '../../core/api-ai.js';
import { pageHeader } from '../../components/controls.js';
import { stat, sectionHead } from '../../components/visuals.js';
import { profileErrorView } from '../../components/profile-error.js';
import { icon } from '../../components/icons.js';
import { lastDays, alignSeries, sparkline, average } from '../../core/chart.js';
import { moodLabel, energyLabel } from '../../core/moods.js';
import { fmtDayMonth, fmtDate, localDay } from '../../core/format.js';
import { render } from '../../core/router.js';

const DAYS = 30;

export default async function progressView() {
  const { profile } = getState();
  if (!profile) return profileErrorView(getState().loadError);
  const header = pageHeader({ title: 'I tuoi progressi', back: { href: '#/profilo', label: 'Profilo' } });

  let logs; let records; let goals; let habits; let sessions; let ai;
  const days = lastDays(DAYS);
  try {
    [logs, records, goals, habits, sessions, ai] = await Promise.all([
      listWellbeing(profile.id, days[0]), listProgress(profile.id), listGoals(profile.id), listHabits(profile.id, days[0]), listSessions(profile.id), getAiPrefs(profile.id),
    ]);
  } catch (err) { return h('main', { class: 'shell with-tabs' }, header, errorBox(err.message, { onRetry: render })); }

  const week = lastDays(7);
  const sessionsWeek = sessions.filter((s) => week.includes(localDay(new Date(s.started_at)))).length;
  const habitDays = new Set(habits.flatMap((x) => x.logs.filter((d) => week.includes(d)))).size;
  const wbWeek = logs.filter((l) => week.includes(l.day)).length;

  const sections = [header,
    h('p', { class: 'muted' }, 'Qui vedi la tua crescita, con i tuoi tempi. Nessuna classifica e nessun confronto: conta solo il tuo percorso.'),
    h('section', { class: 'stat-row', 'aria-label': 'Ultimi 7 giorni' }, stat(String(sessionsWeek), 'allenamenti'), stat(String(habitDays), 'giorni con abitudini'), stat(String(wbWeek), 'giorni registrati'))];

  // --- andamento
  const moods = alignSeries(logs, days, 'mood'); const energies = alignSeries(logs, days, 'energy');
  const avgMood = average(moods); const avgEnergy = average(energies);
  const trends = h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, 'Come stai andando'));
  if (!logs.length) {
    trends.append(emptyState('Ancora nessun dato', 'Segna come ti senti nella sezione Benessere: qui vedrai l’andamento, con i tuoi tempi.'), h('a', { class: 'btn btn-secondary', href: '#/profilo/benessere' }, 'Vai a Benessere'));
  } else {
    trends.append(
      h('div', { class: 'spark-block' }, h('p', { class: 'muted small' }, `Umore · ultimi ${DAYS} giorni`), sparkline(moods, { label: `Andamento dell’umore negli ultimi ${DAYS} giorni` })),
      h('div', { class: 'spark-block' }, h('p', { class: 'muted small' }, `Energia · ultimi ${DAYS} giorni`), sparkline(energies, { label: `Andamento dell’energia negli ultimi ${DAYS} giorni` })),
      h('p', null, `In ${logs.length} ${logs.length === 1 ? 'giorno' : 'giorni'} ti sei fermata a notare come stavi. `, avgMood ? `In media: umore «${moodLabel(Math.round(avgMood))}», energia «${energyLabel(Math.round(avgEnergy))}».` : ''),
      h('p', { class: 'muted small' }, 'I giorni senza registro non contano: non c’è nulla da recuperare.'));
  }
  sections.push(trends);

  // --- riflessione (solo con il consenso)
  const reflect = h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, 'Una riflessione'));
  if (!ai.ai_enabled) {
    reflect.append(h('p', { class: 'muted' }, 'Se vuoi, ALE. può scriverti una breve riflessione sui tuoi progressi. Serve il tuo consenso: lo trovi in Impostazioni.'), h('a', { class: 'btn btn-secondary', href: '#/profilo/impostazioni' }, 'Vai a Impostazioni'));
  } else {
    const out = h('div', { class: 'stack', 'aria-live': 'polite' });
    const btn = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => withBusy(btn, async () => {
      try {
        const r = await aiReflection();
        out.replaceChildren(h('p', { class: 'ticket-body' }, r.text), h('p', { class: 'muted small' }, r.source === 'ai' ? 'Scritto da Claude, con i tuoi consensi.' : 'Messaggio preparato a mano: l’AI non è collegata.'));
      } catch (err) { toast(err.message, 'error'); }
    }) }, 'Scrivimi una riflessione');
    reflect.append(h('p', { class: 'muted' }, 'Una breve lettura dei tuoi ultimi giorni, senza giudizi.'), btn, out);
  }
  sections.push(reflect);

  // --- obiettivi
  const goalsCard = h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, 'I tuoi obiettivi'));
  const goalList = h('ul', { class: 'plain-list' });
  for (const g of goals) {
    const done = g.status === 'done';
    const btn = h('button', { class: 'check', type: 'button', 'aria-pressed': String(done), 'aria-label': `${g.title}: ${done ? 'raggiunto' : 'in corso'}`,
      onclick: async () => { try { await setGoalDone(profile.id, g, !done); if (!done) toast('Obiettivo raggiunto: complimenti!', 'success'); await render(); } catch (err) { toast(err.message, 'error'); } } }, icon('check', { size: 18 }));
    const del = h('button', { class: 'btn btn-text', type: 'button', 'aria-label': `Elimina ${g.title}`, onclick: async () => { try { await deleteGoal(g.id); await render(); } catch (err) { toast(err.message, 'error'); } } }, icon('trash', { size: 18 }));
    goalList.append(h('li', { class: `row${done ? ' exercise-done' : ''}` }, btn, h('span', { class: 'grow' }, h('span', { class: 'list-title' }, g.title),
      g.target_date && !done ? h('span', { class: 'muted block small' }, `entro il ${fmtDate(`${g.target_date}T12:00:00`)}`) : null, g.notes ? h('span', { class: 'muted block small ticket-body-plain' }, g.notes) : null), del));
  }
  if (goals.length) goalsCard.append(goalList); else goalsCard.append(emptyState('Ancora nessun obiettivo', 'Un obiettivo piccolo e gentile, scelto da te.'));
  const gTitle = field({ id: 'g-title', label: 'Nuovo obiettivo', maxlength: 120, required: false, autocomplete: 'off' });
  const gDate = h('input', { type: 'date', id: 'g-date', class: 'input', 'aria-label': 'Entro quando (facoltativo)' });
  const gBtn = h('button', { class: 'btn', type: 'submit' }, 'Aggiungi');
  goalsCard.append(h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    const t = gTitle.input.value.trim();
    gTitle.setError(t ? null : 'Scrivi l’obiettivo.');
    if (!t) return;
    withBusy(gBtn, async () => { try { await addGoal(profile.id, { title: t, targetDate: gDate.value }); toast('Obiettivo aggiunto.', 'success'); await render(); } catch (err) { toast(err.message, 'error'); } });
  } }, gTitle.wrap, h('div', { class: 'field' }, h('label', { class: 'label', for: 'g-date' }, 'Entro quando (facoltativo)'), gDate), gBtn));
  sections.push(goalsCard);

  // --- abitudini consolidate
  const consolidated = habits.filter((x) => isConsolidated(x.logs));
  sections.push(h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, 'Abitudini consolidate'),
    consolidated.length ? h('div', { class: 'chips' }, consolidated.map((x) => h('span', { class: 'chip' }, x.name))) : h('p', { class: 'muted' }, 'Un’abitudine diventa “consolidata” quando la fai in gran parte dei giorni. Ci vuole tempo, e va bene così.')));

  // --- piccole conquiste
  sections.push(sectionHead('Piccole conquiste'));
  sections.push(h('section', { class: 'card stack' }, records.length
    ? h('ul', { class: 'plain-list' }, records.map((r) => h('li', null, h('span', { class: 'list-title' }, r.title), h('span', { class: 'muted block small' }, fmtDayMonth(`${r.achieved_on}T12:00:00`)))))
    : emptyState('Qui compariranno le tue conquiste', 'Abitudini consolidate, obiettivi raggiunti, allenamenti completati: le troverai qui.')));

  return h('main', { class: 'shell with-tabs' }, ...sections);
}
