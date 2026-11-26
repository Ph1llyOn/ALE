// #/diario — storico delle voci (private di default) e accesso alla scrittura libera o guidata.
import { h, errorBox, emptyState, spinner } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { listEntries } from '../../core/api-journal.js';
import { pageHeader } from '../../components/controls.js';
import { hero } from '../../components/visuals.js';
import { profileErrorView } from '../../components/profile-error.js';
import { icon, heart } from '../../components/icons.js';
import { fmtRelative, fmtDate } from '../../core/format.js';
import { render } from '../../core/router.js';

const snippet = (t, n = 140) => { const s = String(t).replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n)}…` : s; };

export default async function journalView() {
  const { profile } = getState();
  if (!profile) return profileErrorView(getState().loadError);

  const list = h('div', { class: 'stack' }, spinner());
  const main = h('main', { class: 'shell with-tabs' },
    hero({ eyebrow: 'Diario', title: 'Scrivi', accent: 'per te', text: 'Uno spazio solo tuo. Nessuno lo legge, a meno che tu non decida di condividere una voce.',
      cta: { label: 'Nuova voce', href: '#/diario/voce' } }),
    h('div', { class: 'row-center' },
      h('a', { class: 'btn btn-secondary', href: '#/diario/voce?modo=guidata' }, 'Scrivi con uno spunto'),
      h('a', { class: 'btn btn-secondary', href: '#/diario/voce' }, 'Scrivi come vuoi')),
    pageHeader({ title: 'Le tue voci' }), list);

  try {
    const entries = await listEntries(profile.id);
    if (!entries.length) {
      list.replaceChildren(h('div', { class: 'card' }, emptyState('Ancora nessuna voce', 'Quando scriverai qualcosa, resterà qui, al sicuro.')));
    } else {
      list.replaceChildren(h('section', { class: 'list-card' }, entries.map((e) => h('a', { class: 'list-row diary-row', href: `#/diario/voce?id=${e.id}` },
        h('span', { class: 'list-icon' }, icon(e.mode === 'guided' ? 'spark' : 'book')),
        h('span', { class: 'grow' },
          h('span', { class: 'list-title' }, e.title || fmtDate(e.created_at)),
          h('span', { class: 'muted block small' }, snippet(e.body)),
          h('span', { class: 'muted block small' }, fmtRelative(e.created_at), e.shared_with_partner ? ' · ' : '', e.shared_with_partner ? h('span', { class: 'shared-badge' }, heart({ size: 11 }), ' condivisa') : '')),
        icon('chevron', { size: 18, className: 'icon list-chevron' })))));
    }
  } catch (err) {
    list.replaceChildren(errorBox(err.message, { onRetry: render }));
  }
  return main;
}
