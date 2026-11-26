import { h, avatarEl, emptyState, errorBox, chip } from '../../core/ui.js';
import { avatarUrl } from '../../core/api.js';
import { sharedWithMe, sharedWellbeing, sharedProgress, sharedEquipment } from '../../core/api-partner.js';
import { listSent } from '../../core/api-messages.js';
import { CATEGORIES } from '../../core/api-privacy.js';
import { lastDays, alignSeries, sparkline } from '../../core/chart.js';
import { localDay, fmtDayMonth, fmtRelative } from '../../core/format.js';
import { moodLabel, energyLabel } from '../../core/moods.js';

// Categorie per cui esiste già una schermata di dettaglio; per le altre mostriamo solo che sono condivise.
const WITH_DETAIL = new Set(['wellbeing', 'progress', 'equipment']);

export default async function homePhill({ profile, partner, partnership }) {
  const sections = [h('header', { class: 'page-header' },
    h('p', { class: 'eyebrow' }, 'Area di Phill'),
    h('h1', { class: 'page-title', 'data-focus': true }, `Ciao, ${profile.display_name}`))];

  if (!(partnership && partner)) {
    sections.push(h('section', { class: 'card stack' },
      h('h2', { class: 'card-title' }, 'In attesa di Alessia'),
      h('p', { class: 'muted' }, 'Appena Alessia configura il suo profilo, vi collegate da soli. Poi potrai scriverle dei biglietti e vedere solo ciò che sceglie di condividere.')));
    return h('main', { class: 'shell with-tabs' }, ...sections);
  }

  const partnerAvatar = await avatarUrl(partner.avatar_path);
  sections.push(h('section', { class: 'card stack' },
    h('div', { class: 'row' }, avatarEl(partnerAvatar, partner.display_name),
      h('div', { class: 'grow' }, h('p', { class: 'card-title' }, `Sei collegato con ${partner.display_name}`),
        h('p', { class: 'muted' }, 'Un biglietto, anche piccolo, fa sempre bene.'))),
    h('div', { class: 'row wrap' }, h('a', { class: 'btn', href: '#/messaggi' }, 'Scrivi un biglietto'), h('a', { class: 'btn btn-secondary', href: '#/proposte' }, 'Proponi qualcosa'))));

  // --- Riepilogo: SOLO ciò che Alessia condivide (lo decide il database, non l'interfaccia)
  const summary = h('section', { class: 'stack', 'aria-labelledby': 'riepilogo-title' }, h('h2', { class: 'section-title', id: 'riepilogo-title' }, 'Riepilogo'));
  sections.push(summary);
  try {
    const shared = await sharedWithMe(partner.id, profile.id);
    if (!shared.size) {
      summary.append(h('div', { class: 'card' }, emptyState('Per ora Alessia non ha condiviso nulla', 'Va benissimo così: sceglie lei cosa e quando. Se condividerà qualcosa, lo troverai qui.')));
    } else {
      if (shared.has('wellbeing')) summary.append(await wellbeingCard(partner));
      if (shared.has('progress')) summary.append(await progressCard(partner));
      if (shared.has('equipment')) summary.append(await equipmentCard(partner));
      const others = CATEGORIES.filter((c) => shared.has(c.key) && !WITH_DETAIL.has(c.key));
      if (others.length) {
        summary.append(h('div', { class: 'card stack' },
          h('p', { class: 'card-title' }, 'Condiviso con te'),
          h('div', { class: 'chips' }, others.map((c) => chip(c.title))),
          h('a', { class: 'link-small', href: '#/condiviso' }, 'Vedi il dettaglio')));
      }
    }
  } catch (err) {
    summary.append(errorBox(err.message));
  }

  // --- Ultimi biglietti inviati
  try {
    const sent = (await listSent(profile.id, { limit: 3 }));
    if (sent.length) {
      sections.push(h('section', { class: 'card stack' },
        h('div', { class: 'row' }, h('h2', { class: 'card-title grow' }, 'I tuoi ultimi biglietti'), h('a', { class: 'link-small', href: '#/messaggi' }, 'Storico')),
        h('ul', { class: 'plain-list' }, sent.map((m) => h('li', null,
          h('span', { class: 'list-title' }, m.title || 'Senza titolo'), h('span', { class: 'muted block small' }, fmtRelative(m.sent_at)))))));
    }
  } catch { /* sezione facoltativa */ }

  return h('main', { class: 'shell with-tabs' }, ...sections);
}

async function wellbeingCard(partner) {
  const days = lastDays(7);
  const logs = await sharedWellbeing(partner.id, days[0]);
  const card = h('div', { class: 'card stack' }, h('p', { class: 'card-title' }, 'Come sta andando'));
  if (!logs.length) {
    card.append(h('p', { class: 'muted' }, 'Nessun registro negli ultimi giorni.'));
    return card;
  }
  const latest = logs[0];
  card.append(
    h('p', null, `${logs[0].day === localDay() ? 'Oggi' : fmtDayMonth(`${latest.day}T12:00:00`)}: umore «${moodLabel(latest.mood)}», energia «${energyLabel(latest.energy)}».`),
    sparkline(alignSeries(logs, days, 'mood'), { label: 'Andamento dell’umore negli ultimi 7 giorni' }),
    h('p', { class: 'muted small' }, 'Umore degli ultimi 7 giorni. Le note personali restano sempre private.'));
  return card;
}

async function progressCard(partner) {
  const records = await sharedProgress(partner.id, 5);
  const card = h('div', { class: 'card stack' }, h('p', { class: 'card-title' }, 'Piccole conquiste'));
  if (!records.length) card.append(h('p', { class: 'muted' }, 'Ancora nulla da celebrare qui: arriverà.'));
  else card.append(h('ul', { class: 'plain-list' }, records.map((r) => h('li', null, h('span', { class: 'list-title' }, r.title), h('span', { class: 'muted block small' }, fmtDayMonth(`${r.achieved_on}T12:00:00`))))));
  return card;
}

async function equipmentCard(partner) {
  const items = await sharedEquipment(partner.id);
  const card = h('div', { class: 'card stack' }, h('p', { class: 'card-title' }, 'Attrezzatura a casa'));
  if (!items.length) card.append(h('p', { class: 'muted' }, 'Nessun attrezzo inserito.'));
  else card.append(h('div', { class: 'chips' }, items.map((i) => chip(i.name, i.avoid ? 'muted' : ''))), h('p', { class: 'muted small' }, 'Gli attrezzi in grigio sono quelli che preferisce non usare.'));
  return card;
}
