import { h } from '../core/ui.js';
import { heart } from './icons.js';
import { fmtRelative } from '../core/format.js';

/**
 * Biglietto: titolo, testo (a capo rispettati), firma "Da <nome>" e data. Il testo entra sempre come nodo di testo.
 * options: { senderName, unread, actions }
 */
export function messageCard(m, { senderName = 'Phill', unread = false, actions = null, extra = null, showDate = true } = {}) {
  return h('article', { class: `ticket${unread ? ' is-unread' : ''}` },
    h('div', { class: 'ticket-head' },
      h('span', { class: 'ticket-ornament' }, heart({ size: 13 })),
      m.title ? h('h3', { class: 'ticket-title' }, m.title) : null,
      unread ? h('span', { class: 'dot', role: 'img', 'aria-label': 'Non ancora letto' }) : null),
    h('p', { class: 'ticket-body' }, m.body),
    h('footer', { class: 'ticket-foot' },
      h('span', { class: 'ticket-sign' }, `Da ${senderName}`),
      showDate ? h('span', { class: 'muted' }, fmtRelative(m.sent_at ?? m.send_at), m.edited_at ? ' · modificato' : '') : null,
    ),
    extra,
    actions ? h('div', { class: 'ticket-actions' }, actions) : null);
}
