import { h, avatarEl, emptyState, errorBox } from '../../core/ui.js';
import { greeting } from '../../core/greeting.js';
import { avatarUrl } from '../../core/api.js';
import { listInbox, markRead, isUnread, isArchived } from '../../core/api-messages.js';
import { listWellbeing } from '../../core/api-personal.js';
import { messageCard } from '../../components/message-card.js';
import { icon } from '../../components/icons.js';
import { localDay } from '../../core/format.js';
import { moodLabel, energyLabel } from '../../core/moods.js';

const SHOWN = 3;

export default async function homeAlessia({ profile, partner, partnership }) {
  const header = h('header', { class: 'page-header' },
    h('p', { class: 'eyebrow' }, `Ciao, ${profile.display_name}`),
    h('h1', { class: 'page-title', 'data-focus': true }, greeting().text));

  const sections = [header];

  // --- Biglietti di Phill
  if (partnership && partner) {
    const card = h('section', { class: 'card stack', 'aria-labelledby': 'biglietti-title' });
    sections.push(card);
    card.append(h('div', { class: 'row' },
      h('h2', { class: 'card-title grow', id: 'biglietti-title' }, `Biglietti di ${partner.display_name}`),
      h('a', { class: 'link-small', href: '#/biglietti' }, 'Tutti')));
    try {
      const all = (await listInbox(profile.id, { limit: 30 })).filter((m) => !isArchived(m));
      const latest = all.slice(0, SHOWN);
      if (!latest.length) {
        card.append(emptyState('Ancora nessun biglietto', `Quando ${partner.display_name} ti scriverà, i suoi biglietti compariranno qui.`));
      } else {
        for (const m of latest) card.append(messageCard(m, { senderName: partner.display_name, unread: isUnread(m) }));
        const unreadMore = all.slice(SHOWN).filter(isUnread).length;
        if (unreadMore) card.append(h('a', { class: 'notice', href: '#/biglietti' }, `Ci sono altri ${unreadMore} biglietti da leggere.`));
        // Vedendoli, li consideriamo letti (la ricevuta è privata: Phill non la vede mai).
        markRead(profile.id, latest.filter(isUnread)).catch((e) => console.warn('markRead', e));
      }
    } catch (err) {
      card.append(errorBox(err.message));
    }
  } else {
    sections.push(h('section', { class: 'card stack' },
      h('h2', { class: 'card-title' }, 'In attesa di Phill'),
      h('p', { class: 'muted' }, 'Appena Phill configura il suo profilo, vi collegate da soli e i suoi biglietti arriveranno qui. Decidi tu cosa condividere: di default nulla.')));
  }

  // --- Il tuo giorno
  const today = localDay();
  let todayLog = null;
  try { todayLog = (await listWellbeing(profile.id, today))[0] ?? null; } catch { /* la card resta neutra */ }
  const dayCard = h('section', { class: 'card stack', 'aria-labelledby': 'giorno-title' }, h('h2', { class: 'card-title', id: 'giorno-title' }, 'Il tuo giorno'));
  if (todayLog) {
    dayCard.append(
      h('p', null, `Oggi: umore «${moodLabel(todayLog.mood)}», energia «${energyLabel(todayLog.energy)}».`),
      h('a', { class: 'btn btn-secondary', href: '#/profilo/benessere' }, 'Aggiorna'));
  } else {
    dayCard.append(
      h('p', { class: 'muted' }, 'Quando ti va, puoi segnare come ti senti. Nessun obbligo, nessun voto.'),
      h('a', { class: 'btn btn-secondary', href: '#/profilo/benessere' }, 'Come ti senti oggi?'));
  }
  dayCard.append(h('p', { class: 'muted small' }, 'Qui compariranno anche le attività e i promemoria, quando li aggiungerai.'));
  sections.push(dayCard);

  // --- Collegamento (se già collegata, un riquadro discreto)
  if (partnership && partner) {
    const url = await avatarUrl(partner.avatar_path);
    sections.push(h('a', { class: 'list-row card-row', href: '#/profilo/collegamento' },
      avatarEl(url, partner.display_name, 'sm'),
      h('span', { class: 'grow' }, h('span', { class: 'list-title' }, `Sei collegata con ${partner.display_name}`),
        h('span', { class: 'muted block' }, 'Condividi solo ciò che vuoi.')),
      icon('chevron', { size: 18, className: 'icon list-chevron' })));
  }

  return h('main', { class: 'shell with-tabs' }, ...sections);
}
