// #/profilo/privacy — chi controlla i dati sei tu: condivisione, esportazione, eliminazione dell'account.
import { h, field, errorBox, withBusy, toast, spinner } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import { CATEGORIES, mySharing, setSharing, revokeAllSharing, exportMyData, deleteMyAccount } from '../../core/api-privacy.js';
import { toggle, pageHeader } from '../../components/controls.js';
import { profileErrorView } from '../../components/profile-error.js';
import { navigate } from '../../core/router.js';
import { localDay } from '../../core/format.js';

export default async function privacyView() {
  const { profile, partner, partnership, session } = getState();
  if (!profile) return profileErrorView(getState().loadError);
  const isAlessia = profile.role === 'alessia';
  const partnerName = partner?.display_name ?? (isAlessia ? 'Phill' : 'Alessia');
  const linked = Boolean(partnership && partner);

  const sections = [pageHeader({ title: 'Privacy e dati', back: { href: '#/profilo', label: 'Profilo' } })];

  // --- Condivisione (la decide chi possiede i dati: Alessia)
  if (isAlessia) {
    const card = h('section', { class: 'card stack', 'aria-labelledby': 'cond-title' }, h('h2', { class: 'card-title', id: 'cond-title' }, `Cosa condividi con ${partnerName}`));
    sections.push(card);
    card.append(h('p', { class: 'muted' }, 'Per impostazione predefinita non condividi nulla. Ogni voce si attiva e si disattiva quando vuoi, con effetto immediato.'));
    if (!linked) {
      card.append(h('p', { class: 'notice' }, 'Non sei collegata con nessuno: finché non lo sei, nessuno può vedere i tuoi dati.'));
    } else {
      card.append(spinner());
      try {
        const shared = await mySharing(profile.id);
        const list = h('div', { class: 'switch-list' });
        const switches = [];
        for (const c of CATEGORIES) {
          const t = toggle({
            label: c.title, description: c.text, checked: shared.has(c.key),
            onChange: async (next) => {
              try {
                await setSharing(c.key, next);
                toast(next ? `Ora ${partnerName} può vedere: ${c.title}.` : `${partnerName} non vede più: ${c.title}.`);
              } catch (err) { toast(err.message, 'error'); throw err; }
            },
          });
          switches.push([c.key, t]);
          list.append(t.el);
        }
        const stopAll = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => withBusy(stopAll, async () => {
          try {
            await revokeAllSharing();
            for (const [, t] of switches) t.input.checked = false;
            toast(`Non condividi più nulla con ${partnerName}.`, 'success');
          } catch (err) { toast(err.message, 'error'); }
        }) }, 'Smetti di condividere tutto');
        card.replaceChildren(card.firstChild, card.children[1], list, stopAll,
          h('p', { class: 'muted small' }, 'Le note di benessere non si condividono mai. Del diario condividi solo le singole voci che scegli, e solo se attivi anche “Diario”.'));
      } catch (err) {
        card.replaceChildren(card.firstChild, errorBox(err.message, { onRetry: () => location.reload() }));
      }
    }
  } else {
    sections.push(h('section', { class: 'card stack' },
      h('h2', { class: 'card-title' }, 'Cosa vedi di Alessia'),
      h('p', { class: 'muted' }, 'Vedi soltanto ciò che Alessia sceglie di condividere con te, e solo finché lo desidera. Il resto è privato, anche se siete collegati.')));
  }

  // --- I tuoi dati: esportazione
  const exportError = h('p', { class: 'form-error', role: 'alert' });
  const exportBtn = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => withBusy(exportBtn, async () => {
    exportError.textContent = '';
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: `ale-i-miei-dati-${localDay()}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast('Ho preparato i tuoi dati.', 'success');
    } catch (err) { exportError.textContent = err.message; }
  }) }, 'Scarica i miei dati');
  sections.push(h('section', { class: 'card stack' },
    h('h2', { class: 'card-title' }, 'I tuoi dati'),
    h('p', { class: 'muted' }, 'Scarica una copia di tutto ciò che ALE. conserva su di te, in un file leggibile.'),
    exportBtn, exportError));

  // --- Eliminazione dell'account
  const password = field({ id: 'del-password', label: 'La tua password', type: 'password', autocomplete: 'current-password' });
  const confirmText = field({ id: 'del-confirm', label: 'Scrivi ELIMINA per confermare', autocomplete: 'off' });
  const delError = h('p', { class: 'form-error', role: 'alert' });
  const delBtn = h('button', { class: 'btn btn-danger', type: 'submit' }, 'Elimina definitivamente il mio account');
  const delForm = h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    delError.textContent = '';
    password.setError(password.input.value ? null : 'Inserisci la password.');
    const okText = confirmText.input.value.trim().toUpperCase() === 'ELIMINA';
    confirmText.setError(okText ? null : 'Scrivi ELIMINA per procedere.');
    if (!password.input.value || !okText) return;
    withBusy(delBtn, async () => {
      try {
        await deleteMyAccount({ email: session.user.email, password: password.input.value, userId: profile.id });
        toast('Il tuo account è stato eliminato.');
        navigate('/accedi');
      } catch (err) {
        delError.textContent = err.message;
        password.input.value = '';
      }
    });
  } },
  h('ul', { class: 'plain-list' },
    h('li', null, 'Elimineremo il tuo profilo, la tua foto e tutti i tuoi dati.'),
    linked ? h('li', null, `Anche la conversazione con ${partnerName} sparirà, per entrambi.`) : null,
    h('li', null, 'Non si può annullare.')),
  password.wrap, confirmText.wrap, delError, delBtn);
  sections.push(h('details', { class: 'card danger-zone' },
    h('summary', null, 'Elimina il mio account'),
    h('div', { class: 'stack danger-body' }, delForm)));

  return h('main', { class: 'shell with-tabs' }, ...sections);
}
