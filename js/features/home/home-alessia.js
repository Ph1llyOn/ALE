// Home di Alessia: saluto, pensiero del giorno (AI se consentita, altrimenti preparato a mano), "il tuo giorno",
// statistiche gentili, biglietti di Phill, schede e notifiche.
import { h, avatarEl, emptyState, errorBox } from '../../core/ui.js';
import { greeting } from '../../core/greeting.js';
import { avatarUrl } from '../../core/api.js';
import { listInbox, markRead, isUnread, isArchived } from '../../core/api-messages.js';
import { listWellbeing } from '../../core/api-personal.js';
import { listWorkouts, inProgressSession, listHabits, listSessions } from '../../core/api-activities.js';
import { listEvents } from '../../core/api-calendar.js';
import { getSettings, getAiPrefs, unreadCount } from '../../core/api-settings.js';
import { aiDaily } from '../../core/api-ai.js';
import { messageCard } from '../../components/message-card.js';
import { icon } from '../../components/icons.js';
import { hero, ring, stat, tile, exerciseThumb, sectionHead } from '../../components/visuals.js';
import { localDay } from '../../core/format.js';
import { lastDays } from '../../core/chart.js';
import { moodLabel } from '../../core/moods.js';
import { dailyFallback } from '../../data/motivation.js';
import { timeOf, dayKey } from '../../data/calendar-util.js';
import { navigate } from '../../core/router.js';

const SHOWN = 3;
const safe = async (promise, fallback) => { try { return await promise; } catch (err) { console.warn(err); return fallback; } };

export default async function homeAlessia({ profile, partner, partnership }) {
  const today = localDay();
  const week = lastDays(7);
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const [settings, ai, inbox, todayLog, workouts, session, habits, sessions, events, unread] = await Promise.all([
    safe(getSettings(profile.id), null), safe(getAiPrefs(profile.id), { ai_enabled: false }),
    partnership ? safe(listInbox(profile.id, { limit: 30 }), null) : Promise.resolve([]),
    safe(listWellbeing(profile.id, today), []), safe(listWorkouts(profile.id), []), safe(inProgressSession(profile.id), null),
    safe(listHabits(profile.id, week[0]), []), safe(listSessions(profile.id, { limit: 20 }), []),
    safe(listEvents(profile.id, dayStart.toISOString(), dayEnd.toISOString()), []), safe(unreadCount(profile.id), 0),
  ]);

  // Primo accesso: si propone la configurazione guidata (saltabile).
  if (settings && !settings.onboarding_done_at && Object.keys(settings.onboarding_steps).length === 0) {
    queueMicrotask(() => navigate('/benvenuta', { replace: true }));
    return h('main', { class: 'shell' });
  }

  // --- barra superiore
  const bell = h('a', { class: 'bell', href: '#/notifiche', 'aria-label': unread ? `Notifiche: ${unread} da leggere` : 'Notifiche' }, icon('mail', { size: 22 }), unread ? h('span', { class: 'bell-count' }, String(Math.min(unread, 99))) : null);
  const top = h('div', { class: 'topbar' }, h('p', { class: 'eyebrow' }, `Ciao, ${profile.display_name}`), bell);

  // --- pensiero del giorno
  const g = greeting();
  let thought = dailyFallback(); let source = 'fallback';
  if (ai.ai_enabled) {
    const cached = (() => { try { return JSON.parse(sessionStorage.getItem(`ale.daily.${today}`)); } catch { return null; } })();
    const r = cached ?? await safe(aiDaily(), null);
    if (r?.text) {
      thought = { title: r.title, text: r.text }; source = r.source;
      try { sessionStorage.setItem(`ale.daily.${today}`, JSON.stringify(r)); } catch { /* ignora */ }
    }
  }
  const heroEl = hero({ eyebrow: g.text, title: thought.title, text: thought.text,
    cta: session ? { label: 'Riprendi l’allenamento', href: `#/attivita/sessione?id=${session.id}` } : { label: 'Cosa faccio oggi?', href: '#/attivita' } });
  const origin = h('p', { class: 'muted small center' }, source === 'ai' ? 'Pensato per te dall’assistente, con i tuoi consensi.' : 'Un pensiero scelto per te.');

  const sections = [top, heroEl, origin];

  // --- il tuo giorno
  const doneHabits = habits.filter((x) => x.logs.includes(today)).length;
  const dayItems = [];
  for (const e of events.filter((x) => x.status === 'confirmed')) dayItems.push({ time: e.all_day ? 'Tutto il giorno' : timeOf(e.starts_at), title: e.title, done: e.completed });
  const dayCard = h('section', { class: 'card stack', 'aria-labelledby': 'giorno-title' },
    h('div', { class: 'goal-card' },
      ring({ percent: habits.length ? (doneHabits / habits.length) * 100 : 0, label: habits.length ? `${doneHabits}/${habits.length}` : '—', ariaLabel: habits.length ? `${doneHabits} abitudini su ${habits.length} fatte oggi` : 'Nessuna abitudine' }),
      h('div', { class: 'goal-main' }, h('h2', { class: 'card-title', id: 'giorno-title' }, 'Il tuo giorno'),
        h('p', { class: 'muted' }, habits.length ? 'Abitudini di oggi. Quello che riesci va benissimo.' : 'Aggiungi qualche piccola abitudine, quando ti va.'),
        h('a', { class: 'link-small', href: '#/attivita' }, habits.length ? 'Vedi le abitudini' : 'Inizia da qui'))),
    dayItems.length ? h('ul', { class: 'plain-list' }, dayItems.map((i) => h('li', { class: `row${i.done ? ' exercise-done' : ''}` }, h('span', { class: 'chip' }, i.time), h('span', { class: 'grow list-title' }, i.title)))) : h('p', { class: 'muted small' }, 'Niente in calendario per oggi.'),
    todayLog[0]
      ? h('p', null, `Oggi ti senti «${moodLabel(todayLog[0].mood)}». `, h('a', { href: '#/profilo/benessere' }, 'Aggiorna'))
      : h('a', { class: 'btn btn-secondary', href: '#/profilo/benessere' }, 'Come ti senti oggi?'));
  sections.push(dayCard);

  // --- statistiche della settimana
  const sessionsWeek = sessions.filter((s) => week.includes(dayKey(new Date(s.started_at)))).length;
  const habitDays = new Set(habits.flatMap((x) => x.logs.filter((d) => week.includes(d)))).size;
  sections.push(h('section', { class: 'stat-row', 'aria-label': 'Questa settimana' }, stat(String(sessionsWeek), 'allenamenti'), stat(String(habitDays), 'giorni con abitudini'), stat(String(unread), 'da leggere')));

  // --- biglietti di Phill
  if (partnership && partner) {
    const card = h('section', { class: 'card stack', 'aria-labelledby': 'biglietti-title' },
      h('div', { class: 'row' }, h('h2', { class: 'card-title grow', id: 'biglietti-title' }, `Biglietti di ${partner.display_name}`), h('a', { class: 'link-small', href: '#/biglietti' }, 'Tutti')));
    if (inbox === null) card.append(errorBox('Non riesco a leggere i biglietti.'));
    else {
      const all = inbox.filter((m) => !isArchived(m)); const latest = all.slice(0, SHOWN);
      if (!latest.length) card.append(emptyState('Ancora nessun biglietto', `Quando ${partner.display_name} ti scriverà, i suoi biglietti compariranno qui.`));
      else {
        for (const m of latest) card.append(messageCard(m, { senderName: partner.display_name, unread: isUnread(m) }));
        const more = all.slice(SHOWN).filter(isUnread).length;
        if (more) card.append(h('a', { class: 'notice', href: '#/biglietti' }, `Ci sono altri ${more} biglietti da leggere.`));
        markRead(profile.id, latest.filter(isUnread)).catch((e) => console.warn('markRead', e));
      }
    }
    sections.push(card);
  } else {
    sections.push(h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, 'In attesa di Phill'),
      h('p', { class: 'muted' }, 'Appena Phill configura il suo profilo, vi collegate da soli e i suoi biglietti arriveranno qui. Decidi tu cosa condividere: di default nulla.')));
  }

  // --- schede
  if (workouts.length) {
    sections.push(sectionHead('Le tue schede', h('a', { class: 'link-small', href: '#/attivita' }, 'Tutte')));
    sections.push(h('div', { class: 'hscroll' }, workouts.slice(0, 8).map((w) => tile({
      href: `#/attivita/scheda?id=${w.id}`, art: exerciseThumb(w.keys[0], { className: 'tile-thumb' }), title: w.title, sub: `${w.exerciseCount} esercizi` }))));
  }

  // --- completamento della configurazione
  if (settings && !settings.onboarding_done_at) {
    const skipped = Object.values(settings.onboarding_steps).filter((v) => v === 'skipped').length;
    sections.push(h('a', { class: 'notice', href: '#/benvenuta' }, skipped ? `Hai saltato ${skipped} ${skipped === 1 ? 'passo' : 'passi'} della configurazione: vuoi completarla?` : 'Vuoi completare la configurazione guidata?'));
  }

  // --- collegamento
  if (partnership && partner) {
    const url = await safe(avatarUrl(partner.avatar_path), null);
    sections.push(h('a', { class: 'list-row card-row', href: '#/profilo/collegamento' }, avatarEl(url, partner.display_name, 'sm'),
      h('span', { class: 'grow' }, h('span', { class: 'list-title' }, `Sei collegata con ${partner.display_name}`), h('span', { class: 'muted block' }, 'Condividi solo ciò che vuoi.')),
      icon('chevron', { size: 18, className: 'icon list-chevron' })));
  }

  return h('main', { class: 'shell with-tabs' }, ...sections);
}
