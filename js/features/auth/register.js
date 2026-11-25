import { h, field, withBusy, logo } from '../../core/ui.js';
import { signUp } from '../../core/api.js';
import { validateEmail, validatePassword, validateName, validateRole, PASSWORD_MIN } from '../../core/validate.js';
import { navigate } from '../../core/router.js';
import { resolve } from '../../config.js';
import { pendingInviteCode } from '../pairing/invite-storage.js';

export default async function registerView() {
  const hasInvite = Boolean(pendingInviteCode());
  let role = hasInvite ? 'phill' : '';

  const roleError = h('p', { class: 'field-msg', 'aria-live': 'polite' });
  const roleInputs = {};
  const roleCard = (value, title, text) => {
    const input = h('input', { type: 'radio', name: 'role', id: `role-${value}`, value, checked: role === value, class: 'sr-only',
      onchange: () => { role = value; roleError.textContent = ''; } });
    roleInputs[value] = input;
    return h('label', { class: 'choice', for: `role-${value}` }, input, h('span', { class: 'choice-title' }, title), h('span', { class: 'muted' }, text));
  };

  const name = field({ id: 'display_name', label: 'Come vuoi essere chiamata/o?', autocomplete: 'nickname', maxlength: 40 });
  const email = field({ id: 'email', label: 'Email', type: 'email', autocomplete: 'email', inputmode: 'email' });
  const password = field({ id: 'new-password', label: 'Password', type: 'password', autocomplete: 'new-password', hint: `Almeno ${PASSWORD_MIN} caratteri.` });
  const confirm = field({ id: 'confirm-password', label: 'Ripeti la password', type: 'password', autocomplete: 'new-password' });
  const formError = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Crea account');
  const container = h('main', { class: 'shell auth-shell' });

  const form = h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    formError.textContent = '';
    const errs = {
      role: validateRole(role), name: validateName(name.input.value), email: validateEmail(email.input.value),
      password: validatePassword(password.input.value),
      confirm: confirm.input.value === password.input.value ? null : 'Le due password non coincidono.',
    };
    roleError.textContent = errs.role || '';
    roleError.classList.toggle('is-error', Boolean(errs.role));
    name.setError(errs.name); email.setError(errs.email); password.setError(errs.password); confirm.setError(errs.confirm);
    if (Object.values(errs).some(Boolean)) return;
    withBusy(submit, async () => {
      try {
        const { needsConfirmation } = await signUp({
          email: email.input.value, password: password.input.value, role, displayName: name.input.value, redirectTo: resolve('./'),
        });
        if (needsConfirmation) {
          container.replaceChildren(logo(), h('section', { class: 'card stack' },
            h('h2', { class: 'card-title', 'data-focus': true }, 'Controlla la tua email'),
            h('p', null, 'Ti abbiamo inviato un link per confermare l’account. Aprilo e poi accedi.'),
            h('a', { class: 'btn btn-secondary', href: '#/accedi' }, 'Vai all’accesso')));
        } else navigate('/home');
      } catch (err) { formError.textContent = err.message; }
    });
  } },
  h('fieldset', { class: 'choices' }, h('legend', { class: 'label' }, 'Chi sei?'),
    h('div', { class: 'choice-row' }, roleCard('alessia', 'Sono Alessia', 'Il mio spazio'), roleCard('phill', 'Sono Phill', 'Accanto a lei')), roleError),
  name.wrap, email.wrap, password.wrap, confirm.wrap, formError, submit);

  container.append(logo('md'),
    h('section', { class: 'card stack' },
      h('h2', { class: 'card-title', 'data-focus': true }, 'Crea il tuo account'),
      hasInvite ? h('p', { class: 'notice' }, 'Hai ricevuto un invito: registrati come Phill per collegarti ad Alessia.') : null,
      form),
    h('p', { class: 'center muted' }, 'Hai già un account? ', h('a', { href: '#/accedi' }, 'Accedi')));
  return container;
}
