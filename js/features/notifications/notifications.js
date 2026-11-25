// #/notifiche — le notifiche in-app. Toccandone una si apre la schermata giusta; si possono segnare tutte come lette.
import { h, errorBox, emptyState, withBusy, toast, spinner } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { listNotifications, markNotificationsRead } from '../../core/api-settings.js';
import { pageHeader } from '../../components/controls.js';
import { profileErrorView } from '../../components/profile-error.js';
import { icon } from '../../components/icons.js';
import { fmtRelative } from '../../core/format.js';
import { navigate, render } from '../../core/router.js';

const ICON = { message: 'mail', proposal: 'activity', daily: 'heart', reminder: 'clock' };

export default async function notificationsView() {
  const { profile } = getState();
  if (!profile) return profileErrorView(getState().loadError);
  const header = pageHeader({ title: 'Notifiche', back: { href: '#/home', label: 'Home' } });
  const list = h('div', { class: 'stack' }, spinner());
  const main = h('main', { class: 'shell with-tabs' }, header, list);

  try {
    const items = await listNotifications(profile.id);
    if (!items.length) {
      list.replaceChildren(h('div', { class: 'card' }, emptyState('Nessuna notifica', 'Biglietti, proposte e promemoria arriveranno qui.')));
    } else {
      const unread = items.filter((n) => !n.read_at);
      const all = h('button', { class: 'btn btn-secondary', type: 'button', hidden: !unread.length, onclick: () => withBusy(all, async () => {
        try { await markNotificationsRead(unread.map((n) => n.id)); toast('Fatto.'); await render(); } catch (err) { toast(err.message, 'error'); }
      }) }, 'Segna tutte come lette');
      list.replaceChildren(all, h('section', { class: 'list-card' }, items.map((n) => h('button', { type: 'button', class: `list-row notif-row${n.read_at ? '' : ' unread'}`,
        onclick: async () => {
          if (!n.read_at) { try { await markNotificationsRead([n.id]); } catch { /* non blocca la navigazione */ } }
          if (n.link) navigate(n.link.replace(/^#/, '')); else await render();
        } },
        h('span', { class: 'list-icon' }, icon(ICON[n.kind] ?? 'heart')),
        h('span', { class: 'grow' }, h('span', { class: 'list-title' }, n.title), n.body ? h('span', { class: 'muted block small' }, n.body) : null, h('span', { class: 'muted block small' }, fmtRelative(n.created_at))),
        n.read_at ? null : h('span', { class: 'dot', role: 'img', 'aria-label': 'Non letta' })))));
    }
  } catch (err) { list.replaceChildren(errorBox(err.message, { onRetry: render })); }
  return main;
}
