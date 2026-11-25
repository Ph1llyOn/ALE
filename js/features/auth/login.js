import { h, field, withBusy, logo, toast } from '../../core/ui.js';
import { signIn } from '../../core/api.js';
import { validateEmail } from '../../core/validate.js';
import { navigate } from '../../core/router.js';
import { bootLinkError } from '../../core/boot.js';

let linkErrorShown = false;

export default async function loginView() {
  const email = field({ id: 'email', label: 'Email', type: 'email', autocomplete: 'email', inputmode: 'email' });
  const password = field({ id: 'password', label: 'Password', type: 'password', autocomplete: 'current-password' });
  const formError = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Accedi');

  const form = h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    formError.textContent = '';
    const eErr = validateEmail(email.input.value);
    email.setError(eErr);
    password.setError(password.input.value ? null : 'Inserisci la password.');
    if (eErr || !password.input.value) return;
    withBusy(submit, async () => {
      try {
        await signIn(email.input.value, password.input.value);
        navigate('/home');
      } catch (err) {
        formError.textContent = err.message;
        password.input.value = '';
        password.input.focus();
      }
    });
  } }, email.wrap, password.wrap, formError, submit);

  if (!linkErrorShown) {
    const msg = bootLinkError();
    if (msg) { linkErrorShown = true; queueMicrotask(() => toast(msg, 'error')); }
  }

  return h('main', { class: 'shell auth-shell' },
    logo(), h('p', { class: 'tagline' }, 'Un piccolo passo alla volta.'),
    h('section', { class: 'card stack' },
      h('h2', { class: 'card-title', 'data-focus': true }, 'Bentornata, bentornato'),
      form,
      h('p', { class: 'center' }, h('a', { href: '#/password-dimenticata' }, 'Hai dimenticato la password?'))),
    h('p', { class: 'center muted' }, 'Non hai un account? ', h('a', { href: '#/registrati' }, 'Registrati')));
}
