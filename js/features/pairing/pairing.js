import { h, field, withBusy, avatarEl, errorBox, toast, spinner } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import {
  avatarUrl, pendingInvitation, createInvitation, revokeInvitation, redeemInvitation, endPartnership, AppError,
} from '../../core/api.js';
import { validateInviteCode, formatInviteCode, normalizeInviteCode } from '../../core/validate.js';
import { refreshUserData } from '../../core/session.js';
import { render, navigate } from '../../core/router.js';
import { resolve } from '../../config.js';
import { pendingInviteCode, forgetInviteCode } from './invite-storage.js';

// Il codice in chiaro esiste solo qui, in memoria, subito dopo la creazione. Il database conserva solo l'hash.
let freshInvite = null; // { code, expires_at }

const fmtDate = (iso) => new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));

export default async function pairingView() {
  const { profile, partner, partnership, loadError } = getState();
  if (!profile) {
    return h('main', { class: 'shell' }, errorBox(loadError || 'Non riesco a caricare il tuo profilo.', {
      onRetry: async () => { await refreshUserData(); render(); },
    }));
  }
  const header = h('header', { class: 'page-header' },
    h('a', { class: 'back', href: '#/profilo' }, '‹ Profilo'),
    h('h1', { class: 'page-title', 'data-focus': true }, 'Collegamento'));

  let body;
  if (partnership && partner) body = await linkedCard(profile, partner);
  else if (profile.role === 'alessia') body = await inviterCard();
  else body = redeemCard();
  return h('main', { class: 'shell with-tabs' }, header, body);
}

// ----------------------------------------------------------------------------
async function linkedCard(profile, partner) {
  const isAlessia = profile.role === 'alessia';
  const url = await avatarUrl(partner.avatar_path);
  const confirmBox = h('div', { class: 'stack', hidden: true },
    h('p', { role: 'alert' }, 'Se scolleghi, i vostri account non saranno più collegati e per ricollegarvi servirà un nuovo invito.'));
  const error = h('p', { class: 'form-error', role: 'alert' });
  const yes = h('button', { class: 'btn btn-danger', type: 'button', onclick: () => withBusy(yes, async () => {
    try {
      await endPartnership();
      await refreshUserData();
      toast('Collegamento terminato.');
      render();
    } catch (e) { error.textContent = e.message; }
  }) }, 'Sì, scollega');
  const no = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { confirmBox.hidden = true; ask.hidden = false; } }, 'Annulla');
  confirmBox.append(h('div', { class: 'row-center' }, yes, no));
  const ask = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { confirmBox.hidden = false; ask.hidden = true; yes.focus(); } }, 'Scollega');

  return h('section', { class: 'card stack' },
    h('div', { class: 'row' }, avatarEl(url, partner.display_name),
      h('div', { class: 'grow' },
        h('p', { class: 'card-title' }, partner.display_name),
        h('p', { class: 'muted' }, isAlessia ? 'Phill è collegato al tuo account.' : 'Sei collegato ad Alessia.'))),
    h('p', { class: 'muted' }, isAlessia
      ? 'Il collegamento non dà accesso automatico ai tuoi dati: sceglierai tu cosa condividere e potrai cambiare idea in qualsiasi momento.'
      : 'Vedrai soltanto ciò che Alessia sceglie di condividere con te.'),
    ask, confirmBox, error);
}

// ----------------------------------------------------------------------------
async function inviterCard() {
  const card = h('section', { class: 'card stack' });
  const error = h('p', { class: 'form-error', role: 'alert' });

  const create = h('button', { class: 'btn', type: 'button', onclick: () => withBusy(create, async () => {
    try {
      freshInvite = await createInvitation();
      render();
    } catch (e) { error.textContent = e.message; }
  }) }, 'Crea un invito');

  if (freshInvite && new Date(freshInvite.expires_at) > new Date()) {
    const code = freshInvite.code;
    const link = `${resolve('./')}#/invito?codice=${code}`;
    const copy = async (text, ok) => {
      try { await navigator.clipboard.writeText(text); toast(ok, 'success'); }
      catch { toast('Non riesco a copiare: selezionalo e copialo a mano.', 'error'); }
    };
    const share = navigator.share
      ? h('button', { class: 'btn', type: 'button', onclick: async () => {
        try { await navigator.share({ title: 'ALE.', text: 'Ti invito su ALE.', url: link }); } catch { /* annullato */ }
      } }, 'Condividi il link')
      : null;
    card.append(
      h('h2', { class: 'card-title' }, 'Il tuo invito per Phill'),
      h('p', { class: 'muted' }, 'Mostralo solo a Phill. Per sicurezza il codice si vede una volta sola: se lo perdi, creane uno nuovo.'),
      h('p', { class: 'code', 'aria-label': `Codice ${code.split('').join(' ')}` }, formatInviteCode(code)),
      h('p', { class: 'muted' }, `Valido fino a ${fmtDate(freshInvite.expires_at)}. Si può usare una sola volta.`),
      h('div', { class: 'row-center' }, share,
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => copy(formatInviteCode(code), 'Codice copiato.') }, 'Copia il codice'),
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => copy(link, 'Link copiato.') }, 'Copia il link')),
      revokeButton(error));
    return card;
  }
  freshInvite = null;

  let pending = null;
  card.append(spinner());
  try { pending = await pendingInvitation(); }
  catch (e) { return errorBox(e.message, { onRetry: render }); }
  card.replaceChildren(...[
    h('h2', { class: 'card-title' }, 'Invita Phill'),
    h('p', { class: 'muted' }, 'Crea un codice (o un link) da dare a Phill. Vale 48 ore e si usa una volta sola. Poi decidi tu cosa condividere.'),
    pending ? h('p', { class: 'notice' }, `Hai già un invito attivo, valido fino a ${fmtDate(pending.expires_at)}. Il codice non può essere mostrato di nuovo: creane uno nuovo oppure annulla questo.`) : null,
    create,
    pending ? revokeButton(error) : null,
    error,
  ].filter(Boolean)); // replaceChildren(null) scriverebbe il testo "null"
  return card;
}

function revokeButton(error) {
  const btn = h('button', { class: 'btn btn-text', type: 'button', onclick: () => withBusy(btn, async () => {
    try { await revokeInvitation(); freshInvite = null; toast('Invito annullato.'); render(); }
    catch (e) { error.textContent = e.message; }
  }) }, 'Annulla l’invito');
  return btn;
}

// ----------------------------------------------------------------------------
function redeemCard() {
  const code = field({ id: 'invite-code', label: 'Codice invito', autocomplete: 'off', inputmode: 'text', maxlength: 14,
    value: formatInviteCode(pendingInviteCode()), hint: 'Sono 10 caratteri, ad esempio ABCDE-FGHJK.' });
  code.input.setAttribute('autocapitalize', 'characters');
  const error = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Collegati');
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    error.textContent = '';
    const err = validateInviteCode(code.input.value);
    code.setError(err);
    if (err) return;
    withBusy(submit, async () => {
      try {
        await redeemInvitation(normalizeInviteCode(code.input.value));
        forgetInviteCode();
        await refreshUserData();
        toast('Collegamento riuscito.', 'success');
        navigate('/home');
      } catch (e) {
        error.textContent = e instanceof AppError ? e.message : 'Qualcosa non ha funzionato. Riprova.';
        code.input.select();
      }
    });
  } }, code.wrap, error, submit);

  return h('section', { class: 'card stack' },
    h('h2', { class: 'card-title' }, 'Collegati ad Alessia'),
    h('p', { class: 'muted' }, 'Inserisci il codice che ti ha dato Alessia. Dopo il collegamento vedrai solo ciò che lei sceglie di condividere.'),
    form);
}
