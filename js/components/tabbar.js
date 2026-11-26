import { h } from '../core/ui.js';
import { icon } from './icons.js';

// Alessia: cinque sezioni (come da specifica). Phill: la sua dashboard dedicata, separata.
export const TABS = {
  alessia: [
    { href: '#/home', label: 'Home', icon: 'home', match: ['/home', '/biglietti', '/notifiche'] },
    { href: '#/attivita', label: 'Attività', icon: 'activity', match: ['/attivita', '/attivita/scheda', '/attivita/sessione'] },
    { href: '#/calendario', label: 'Calendario', icon: 'calendar', match: ['/calendario'] },
    { href: '#/diario', label: 'Diario', icon: 'book', match: ['/diario', '/diario/voce'] },
    { href: '#/profilo', label: 'Profilo', icon: 'user', match: ['/profilo', '/profilo/collegamento', '/profilo/privacy', '/profilo/benessere', '/profilo/progressi', '/profilo/attrezzatura', '/profilo/impostazioni'] },
  ],
  phill: [
    { href: '#/home', label: 'Home', icon: 'home', match: ['/home', '/notifiche'] },
    { href: '#/messaggi', label: 'Messaggi', icon: 'mail', match: ['/messaggi'] },
    { href: '#/proposte', label: 'Proposte', icon: 'calendar', match: ['/proposte'] },
    { href: '#/condiviso', label: 'Condiviso', icon: 'activity', match: ['/condiviso'] },
    { href: '#/profilo', label: 'Profilo', icon: 'user', match: ['/profilo', '/profilo/collegamento', '/profilo/privacy', '/profilo/impostazioni'] },
  ],
};

export function tabbar(currentPath, role = 'alessia') {
  const items = TABS[role] ?? TABS.alessia;
  return h('nav', { class: 'tabbar', 'aria-label': 'Navigazione principale' },
    items.map((it) => h('a', { href: it.href, class: 'tab', 'aria-current': it.match.includes(currentPath) ? 'page' : null },
      icon(it.icon, { className: 'tab-icon' }), h('span', null, it.label))));
}
