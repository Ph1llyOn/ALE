// #/scegli — "Chi sta utilizzando l'app?". Niente email né password: scegli il profilo e, solo su un dispositivo
// nuovo, digiti il PIN. Dopo, la sessione resta salvata sul dispositivo e l'app si apre direttamente.
import { h, field, errorBox, loadingScreen, logo, toast } from '../../core/ui.js';
import { getAccessStatus, enterProfile, claimProfile, ROLE_INFO, AccessError } from '../../core/api-access.js';
import { pinPad } from '../../components/pin-pad.js';
import { navigate } from '../../core/router.js';
import { validateName } from '../../core/validate.js';

export default async function accessView() {
  const main = h('main', { class: 'shell chooser' }, loadingScreen());
  const show = (...nodes) => main.replaceChildren(...nodes.filter(Boolean));

  async function chooser() {
    show(loadingScreen());
    let status;
    try { status = await getAccessStatus(); }
    catch (err) { show(logo('md'), errorBox(err.message, { onRetry: chooser })); return; }

    const card = (info, cls) => h('button', { type: 'button', class: `profile-card ${cls}`, onclick: () => (status[info.role] ? pinScreen(info, status) : setupScreen(info, status)) },
      h('span', { class: 'initial', 'aria-hidden': 'true' }, info.emoji || info.name[0]),
      status[info.role] ? null : h('span', { class: 'badge' }, 'Da configurare'),
      h('span', { class: 'who' }, info.emoji ? `${info.label} ${info.emoji}` : info.label),
      h('span', { class: 'who-sub' }, info.sub));

    show(logo('md'),
      h('h1', { class: 'chooser-title', 'data-focus': true }, 'Chi sta utilizzando ', h('em', null, 'l’app'), '?'),
      h('div', { class: 'profile-cards' }, card(ROLE_INFO.alessia, 'ale'), card(ROLE_INFO.phill, 'phill')),
      h('p', { class: 'muted small center' }, 'Il PIN serve solo la prima volta su ogni dispositivo.'));
  }

  function pinScreen(info, status) {
    const pad = pinPad({ onComplete: async (pin) => {
      pad.setBusy(true);
      pad.setMessage('Un attimo…');
      try {
        await enterProfile(info.role, pin);
        navigate('/home');
      } catch (err) {
        pad.setBusy(false);
        pad.reset();
        pad.shake();
        pad.setMessage(err.message, true);
        if (err instanceof AccessError && err.code === 'not_claimed') chooser();
      }
    } });
    show(h('div', { class: 'stack pin-screen' },
      h('button', { type: 'button', class: 'btn btn-text back-btn', onclick: chooser }, '‹ Cambia profilo'),
      h('p', { class: 'eyebrow' }, info.sub),
      h('h1', { class: 'chooser-title', 'data-focus': true }, `Ciao ${info.name}`),
      h('p', { class: 'muted' }, 'Inserisci il tuo PIN'),
      pad.el));
    void status;
  }

  function setupScreen(info, status) {
    const name = field({ id: 'setup-name', label: 'Come vuoi essere chiamata/o?', value: info.name, maxlength: 40, autocomplete: 'nickname' });
    const code = status.setup_code_required
      ? field({ id: 'setup-code', label: 'Codice di configurazione', autocomplete: 'off', hint: 'Ti è stato consegnato insieme all’app.' })
      : null;
    const error = h('p', { class: 'form-error', role: 'alert' });
    const next = h('button', { class: 'btn btn-block', type: 'submit' }, 'Continua');
    const form = h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
      ev.preventDefault();
      error.textContent = '';
      const nErr = validateName(name.input.value);
      name.setError(nErr);
      const cErr = code && !code.input.value.trim() ? 'Inserisci il codice.' : null;
      code?.setError(cErr);
      if (nErr || cErr) return;
      choosePin(info, { displayName: name.input.value.trim(), setupCode: code?.input.value.trim() });
    } }, name.wrap, code?.wrap, error, next);
    show(h('div', { class: 'stack' },
      h('button', { type: 'button', class: 'btn btn-text back-btn', onclick: chooser }, '‹ Cambia profilo'),
      h('h1', { class: 'chooser-title', 'data-focus': true }, `Configura ${info.label}${info.emoji ? ` ${info.emoji}` : ''}`),
      h('p', { class: 'muted center' }, 'È la prima volta su questo profilo. Scegli come ti chiami e un PIN di 6 cifre: ti servirà per entrare da un nuovo dispositivo.'),
      h('section', { class: 'card stack' }, form)));
  }

  function choosePin(info, details, first = null) {
    const confirming = first !== null;
    const pad = pinPad({ onComplete: async (pin) => {
      if (!confirming) { choosePin(info, details, pin); return; }
      if (pin !== first) {
        pad.reset(); pad.shake(); pad.setMessage('I due PIN non coincidono. Riprova dall’inizio.', true);
        setTimeout(() => choosePin(info, details), 1200);
        return;
      }
      pad.setBusy(true); pad.setMessage('Creo il tuo profilo…');
      try {
        await claimProfile({ role: info.role, pin, displayName: details.displayName, setupCode: details.setupCode });
        toast(`Benvenuta/o, ${details.displayName}.`, 'success');
        navigate('/home');
      } catch (err) {
        pad.setBusy(false); pad.reset(); pad.shake(); pad.setMessage(err.message, true);
        if (err.code === 'wrong_setup_code') setTimeout(() => chooser(), 1500);
        if (err.code === 'already_claimed') setTimeout(() => chooser(), 1500);
      }
    } });
    show(h('div', { class: 'stack pin-screen' },
      h('button', { type: 'button', class: 'btn btn-text back-btn', onclick: chooser }, '‹ Indietro'),
      h('h1', { class: 'chooser-title', 'data-focus': true }, confirming ? 'Ripeti il PIN' : 'Scegli un PIN'),
      h('p', { class: 'muted' }, confirming ? 'Per essere sicuri di averlo digitato bene.' : '6 cifre che ricorderai facilmente.'),
      pad.el));
  }

  await chooser();
  return main;
}

