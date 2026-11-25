import { h, field, withBusy, logo } from '../../core/ui.js';
import { sendPasswordReset } from '../../core/api.js';
import { validateEmail } from '../../core/validate.js';
import { resolve } from '../../config.js';

export default async function forgotView() {
  const email = field({ id: 'email', label: 'La tua email', type: 'email', autocomplete: 'email', inputmode: 'email' });
  const formError = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Invia il link');
  const card = h('section', { class: 'card stack' });

  const form = h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
    ev.preventDefault();
    formError.textContent = '';
    const err = validateEmail(email.input.value);
    email.setError(err);
    if (err) return;
    withBusy(submit, async () => {
      try {
        await sendPasswordReset(email.input.value, resolve('./'));
        // Messaggio identico che l'indirizzo esista o no: non riveliamo chi ha un account.
        card.replaceChildren(
          h('h2', { class: 'card-title', 'data-focus': true }, 'Controlla la tua email'),
          h('p', null, 'Se l’indirizzo è registrato, riceverai un link per scegliere una nuova password.'),
          h('a', { class: 'btn btn-secondary', href: '#/accedi' }, 'Torna all’accesso'));
      } catch (e) { formError.textContent = e.message; }
    });
  } }, email.wrap, formError, submit);

  card.append(h('h2', { class: 'card-title', 'data-focus': true }, 'Recupera la password'),
    h('p', { class: 'muted' }, 'Inserisci la tua email: ti mandiamo un link per sceglierne una nuova.'), form);
  return h('main', { class: 'shell auth-shell' }, logo('md'), card,
    h('p', { class: 'center muted' }, h('a', { href: '#/accedi' }, 'Torna all’accesso')));
}
