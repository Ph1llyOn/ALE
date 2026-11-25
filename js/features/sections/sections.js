// Sezioni previste dalla specifica ma non ancora costruite: nessun dato finto, solo un invito alla pazienza.
import { h, emptyState } from '../../core/ui.js';
import { pageHeader } from '../../components/controls.js';
import { icon } from '../../components/icons.js';

function comingSoon({ title, iconName, text, bullets }) {
  return async function view() {
    return h('main', { class: 'shell with-tabs' },
      pageHeader({ title }),
      h('section', { class: 'card stack center soon' },
        h('span', { class: 'soon-icon' }, icon(iconName, { size: 32 })),
        emptyState('Sta arrivando', text),
        h('ul', { class: 'plain-list muted left' }, bullets.map((b) => h('li', null, b)))),
      h('p', { class: 'muted small center' }, 'Un piccolo passo alla volta.'));
  };
}

export const attivitaView = comingSoon({
  title: 'Attività', iconName: 'activity',
  text: 'Qui troverai i tuoi allenamenti e le tue abitudini.',
  bullets: ['Schede e allenamenti liberi', 'Abitudini di ogni giorno', 'Nessuna classifica, nessuna pressione'],
});

export const calendarioView = comingSoon({
  title: 'Calendario', iconName: 'calendar',
  text: 'Qui organizzerai la tua settimana, con calma.',
  bullets: ['Vista mensile e settimanale', 'Passeggiate, riposo, impegni', 'Phill potrà proporti eventi: li approvi tu'],
});

export const diarioView = comingSoon({
  title: 'Diario', iconName: 'book',
  text: 'Qui potrai scrivere, liberamente o con qualche spunto.',
  bullets: ['Scrittura libera e guidata', 'Privato: lo vedi solo tu', 'Condividi una voce solo se vuoi'],
});
