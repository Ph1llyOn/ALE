// #/biglietti — i biglietti di Phill, per Alessia. Può nasconderli dalla propria vista: la cronologia di Phill non cambia.
import { h, errorBox, emptyState, withBusy, toast, spinner } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { listInbox, markRead, setArchived, isUnread, isArchived } from '../../core/api-messages.js';
import { messageCard } from '../../components/message-card.js';
import { segmented, pageHeader } from '../../components/controls.js';
import { profileErrorView } from '../../components/profile-error.js';

export default async function inboxView() {
  const { profile, partner } = getState();
  if (!profile) return profileErrorView(getState().loadError);
  const name = partner?.display_name ?? 'Phill';

  let tab = 'visibili';
  const list = h('div', { class: 'stack', 'aria-live': 'polite' });
  const seg = segmented({
    label: 'Quali biglietti vedere',
    options: [{ value: 'visibili', label: 'Biglietti' }, { value: 'nascosti', label: 'Nascosti' }],
    value: tab,
    onChange: (v) => { tab = v; paint(); },
  });
  let all = [];

  const reload = async () => {
    list.replaceChildren(spinner());
    try { all = await listInbox(profile.id); }
    catch (err) { list.replaceChildren(errorBox(err.message, { onRetry: reload })); return; }
    paint(true);
  };

  function paint(markSeen = false) {
    const shown = all.filter((m) => (tab === 'nascosti' ? isArchived(m) : !isArchived(m)));
    if (!shown.length) {
      list.replaceChildren(tab === 'nascosti'
        ? emptyState('Nessun biglietto nascosto', 'I biglietti che nascondi restano qui, e puoi riportarli in vista quando vuoi.')
        : emptyState('Ancora nessun biglietto', `Quando ${name} ti scriverà, i suoi biglietti compariranno qui.`));
      return;
    }
    const nodes = shown.map((m) => {
      const btn = h('button', { class: 'btn btn-text', type: 'button', onclick: () => withBusy(btn, async () => {
        try {
          await setArchived(profile.id, m.id, tab !== 'nascosti');
          toast(tab === 'nascosti' ? 'Biglietto riportato in vista.' : 'Biglietto nascosto.');
          await reload();
        } catch (err) { toast(err.message, 'error'); }
      }) }, tab === 'nascosti' ? 'Riporta in vista' : 'Nascondi');
      return messageCard(m, { senderName: name, unread: isUnread(m), actions: btn });
    });
    list.replaceChildren(...nodes);
    if (markSeen && tab === 'visibili') {
      const unread = shown.filter(isUnread);
      if (unread.length) markRead(profile.id, unread).catch((e) => console.warn('markRead', e));
    }
  }

  await reload();
  return h('main', { class: 'shell with-tabs' },
    pageHeader({ title: `I biglietti di ${name}`, back: { href: '#/home', label: 'Home' } }),
    seg.el, list,
    h('p', { class: 'muted small center' }, `Solo tu vedi se e quando li leggi. ${name} non lo sa.`));
}
