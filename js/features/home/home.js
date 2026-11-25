import { h, avatarEl, errorBox, emptyState } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { greeting } from '../../core/greeting.js';
import { avatarUrl } from '../../core/api.js';
import { refreshUserData } from '../../core/session.js';
import { render } from '../../core/router.js';

export default async function homeView() {
  const { profile, partner, partnership, loadError } = getState();
  if (!profile) {
    return h('main', { class: 'shell' }, errorBox(loadError || 'Non riesco a caricare il tuo profilo.', {
      onRetry: async () => { await refreshUserData(); render(); },
    }));
  }
  const isAlessia = profile.role === 'alessia';
  const partnerAvatar = partner ? await avatarUrl(partner.avatar_path) : null;

  const header = isAlessia
    ? h('header', { class: 'page-header' },
        h('p', { class: 'eyebrow' }, `Ciao, ${profile.display_name}`),
        h('h1', { class: 'page-title', 'data-focus': true }, greeting().text))
    : h('header', { class: 'page-header' },
        h('p', { class: 'eyebrow' }, 'Area di Phill'),
        h('h1', { class: 'page-title', 'data-focus': true }, `Ciao, ${profile.display_name}`));

  let linkCard;
  if (partnership && partner) {
    linkCard = h('section', { class: 'card row' },
      avatarEl(partnerAvatar, partner.display_name),
      h('div', { class: 'grow' },
        h('p', { class: 'card-title' }, isAlessia ? `Sei collegata con ${partner.display_name}` : `Sei collegato con ${partner.display_name}`),
        h('p', { class: 'muted' }, isAlessia
          ? 'Condividi solo ciò che vuoi: decidi tu cosa può vedere.'
          : 'Vedrai qui soltanto ciò che Alessia sceglie di condividere.')),
      h('a', { class: 'btn btn-secondary', href: '#/profilo/collegamento' }, 'Gestisci'));
  } else {
    linkCard = h('section', { class: 'card stack' },
      h('p', { class: 'card-title' }, isAlessia ? 'Invita Phill' : 'Collegati ad Alessia'),
      h('p', { class: 'muted' }, isAlessia
        ? 'Crea un codice d’invito da condividere con Phill. Scade dopo 48 ore.'
        : 'Inserisci il codice che Alessia ti ha dato per collegare i vostri account.'),
      h('a', { class: 'btn', href: '#/profilo/collegamento' }, isAlessia ? 'Crea un invito' : 'Inserisci il codice'));
  }

  const body = isAlessia
    ? h('section', { class: 'card' }, emptyState('Il tuo giorno', 'Qui compariranno le tue attività e i promemoria, quando le aggiungerai.'))
    : h('section', { class: 'card' }, emptyState('Niente da vedere, per ora', 'Quando Alessia condividerà qualcosa, lo troverai qui.'));

  return h('main', { class: 'shell with-tabs' }, header, linkCard, body);
}
