import { h, field, withBusy, logo, toast } from '../../core/ui.js';
import { updatePassword } from '../../core/api.js';
import { validatePassword, PASSWORD_MIN } from '../../core/validate.js';
import { setState } from '../../core/store.js';
import { navigate } from '../../core/router.js';

export default async function resetView() {
  const password = field({ id: 'new-password', label: 'Nuova password', type: 'password', autocomplete: 'new-password', hint: `Almeno ${PASSWORD_MIN} caratteri.` });
  const confirm = field({ id: 'confirm-password', label: 'Ripeti la nuova password', type: 'password', autocomplete: 'new-password' });
  const formError = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Salva la password');

  const form = h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    formError.textContent = '';
    const pErr = validatePassword(password.input.value);
    const cErr = confirm.input.value === password.input.value ? null : 'Le due password non coincidono.';
    password.setError(pErr); confirm.setError(cErr);
    if (pErr || cErr) return;
    withBusy(submit, async () => {
      try {
        await updatePassword(password.input.value);
        setState({ recovery: false });
        toast('Password aggiornata.', 'success');
        navigate('/home');
      } catch (e) { formError.textContent = e.message; }
    });
  } }, password.wrap, confirm.wrap, formError, submit);

  return h('main', { class: 'shell auth-shell' }, logo('md'),
    h('section', { class: 'card stack' }, h('h2', { class: 'card-title', 'data-focus': true }, 'Scegli una nuova password'), form));
}
