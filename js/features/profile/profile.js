import { profileErrorView } from '../../components/profile-error.js';
import { h, field, withBusy, avatarEl, toast } from '../../core/ui.js';
import { getState, setState } from '../../core/store.js';
import { updateDisplayName, uploadAvatar, removeAvatar, avatarUrl, signOut, AppError } from '../../core/api.js';
import { validateName } from '../../core/validate.js';
import { initThemeToggle } from '../../core/theme.js';
import { toAvatarBlob } from './image.js';

export default async function profileView() {
  const { profile, session, loadError } = getState();
  if (!profile) return profileErrorView(loadError);
  const isAlessia = profile.role === 'alessia';
  let url = await avatarUrl(profile.avatar_path);

  // --- avatar
  const avatarHost = h('div', { class: 'avatar-host' });
  const paintAvatar = () => avatarHost.replaceChildren(avatarEl(url, getState().profile.display_name, 'lg'));
  paintAvatar();
  const photoLabel = h('label', { class: 'btn btn-secondary', for: 'avatar-file' }, profile.avatar_path ? 'Cambia foto' : 'Aggiungi foto');
  const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/heic,image/*', class: 'sr-only', id: 'avatar-file',
    onchange: async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      avatarError.textContent = '';
      avatarHost.classList.add('is-busy');
      try {
        const blob = await toAvatarBlob(file);
        const updated = await uploadAvatar(profile.id, blob, getState().profile.avatar_path);
        setState({ profile: updated });
        url = await avatarUrl(updated.avatar_path);
        paintAvatar();
        photoLabel.textContent = 'Cambia foto';
        removeBtn.hidden = false;
        toast('Foto aggiornata.', 'success');
      } catch (err) {
        avatarError.textContent = err.message || 'Non sono riuscita ad aggiornare la foto.';
      } finally { avatarHost.classList.remove('is-busy'); }
    } });
  const avatarError = h('p', { class: 'form-error', role: 'alert' });
  const removeBtn = h('button', { class: 'btn btn-text', type: 'button', onclick: () => withBusy(removeBtn, async () => {
    try {
      const updated = await removeAvatar(profile.id, getState().profile.avatar_path);
      setState({ profile: updated });
      url = null;
      paintAvatar();
      photoLabel.textContent = 'Aggiungi foto';
      removeBtn.hidden = true;
    } catch (err) { avatarError.textContent = err.message; }
  }) }, 'Rimuovi foto');
  removeBtn.hidden = !profile.avatar_path;

  // --- nome
  const name = field({ id: 'display_name', label: 'Nome visualizzato', autocomplete: 'nickname', value: profile.display_name, maxlength: 40 });
  const nameError = h('p', { class: 'form-error', role: 'alert' });
  const saveName = h('button', { class: 'btn', type: 'submit' }, 'Salva nome');
  const nameForm = h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    nameError.textContent = '';
    const err = validateName(name.input.value);
    name.setError(err);
    if (err) return;
    withBusy(saveName, async () => {
      try {
        const updated = await updateDisplayName(profile.id, name.input.value);
        setState({ profile: updated });
        name.input.value = updated.display_name;
        paintAvatar();
        toast('Nome aggiornato.', 'success');
      } catch (e) { nameError.textContent = e instanceof AppError ? e.message : 'Non è stato possibile salvare.'; }
    });
  } }, name.wrap, nameError, saveName);

  // --- tema e uscita
  const themeBtn = h('button', { class: 'btn btn-secondary', type: 'button' });
  initThemeToggle(themeBtn);
  const logoutBtn = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => withBusy(logoutBtn, signOut) }, 'Esci');

  return h('main', { class: 'shell with-tabs' },
    h('header', { class: 'page-header' }, h('h1', { class: 'page-title', 'data-focus': true }, 'Il tuo profilo')),
    h('section', { class: 'card stack center' },
      avatarHost,
      h('div', { class: 'row-center' },
        photoLabel, fileInput, removeBtn),
      avatarError),
    h('section', { class: 'card stack' }, nameForm,
      h('dl', { class: 'facts' },
        h('dt', null, 'Email'), h('dd', null, session?.user?.email ?? ''),
        h('dt', null, 'Ruolo'), h('dd', null, isAlessia ? 'Alessia' : 'Phill'))),
    h('section', { class: 'card row' },
      h('div', { class: 'grow' }, h('p', { class: 'card-title' }, 'Collegamento'),
        h('p', { class: 'muted' }, isAlessia ? 'Invita Phill o gestisci il collegamento.' : 'Collegati ad Alessia o gestisci il collegamento.')),
      h('a', { class: 'btn btn-secondary', href: '#/profilo/collegamento' }, 'Apri')),
    h('section', { class: 'card stack' }, h('p', { class: 'card-title' }, 'Aspetto'), themeBtn),
    h('section', { class: 'stack' }, logoutBtn));
}
