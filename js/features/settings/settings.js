// #/profilo/impostazioni — notifiche (in-app e push), intelligenza artificiale e consensi, PIN, aspetto.
import { h, field, errorBox, withBusy, toast, spinner } from '../../core/ui.js';
import { getState } from '../../core/store.js';
import {
  getNotificationPrefs, saveNotificationPrefs, getAiPrefs, saveAiPrefs, getSettings, saveSettings,
} from '../../core/api-settings.js';
import { aiStatus } from '../../core/api-ai.js';
import { changePin } from '../../core/api-access.js';
import { pushSupported, pushConfigured, pushPermission, enablePush, listDevices, removeDevice, currentSubscription } from '../../core/api-push.js';
import { toggle, pageHeader } from '../../components/controls.js';
import { profileErrorView } from '../../components/profile-error.js';
import { initThemeToggle } from '../../core/theme.js';
import { validateNewPin, validatePin } from '../../core/validate.js';

export default async function settingsView() {
  const { profile } = getState();
  if (!profile) return profileErrorView(getState().loadError);
  const isAlessia = profile.role === 'alessia';
  const sections = [pageHeader({ title: 'Impostazioni', back: { href: '#/profilo', label: 'Profilo' } })];

  let notif; let ai; let settings;
  try {
    [notif, ai, settings] = await Promise.all([getNotificationPrefs(profile.id), isAlessia ? getAiPrefs(profile.id) : null, isAlessia ? getSettings(profile.id) : null]);
  } catch (err) { return h('main', { class: 'shell with-tabs' }, ...sections, errorBox(err.message)); }

  // ------------------------------------------------------------------ notifiche
  const notifCard = h('section', { class: 'card stack', 'aria-labelledby': 'n-title' }, h('h2', { class: 'card-title', id: 'n-title' }, 'Notifiche'),
    h('p', { class: 'muted' }, 'Scegli cosa vuoi ricevere. Nessuna notifica insistente: puoi cambiare idea in ogni momento.'));
  const list = h('div', { class: 'switch-list' });
  const items = isAlessia
    ? [['messages', 'Biglietti di Phill', 'Quando ne arriva uno nuovo.'], ['daily_motivation', 'Motivazione del mattino', 'Un pensiero gentile all’inizio della giornata.'],
      ['proposals', 'Proposte di Phill', 'Schede ed eventi che ti propone.'], ['reminders', 'Promemoria', 'Quelli che crei tu nel calendario.']]
    : [['messages', 'Messaggi', 'Aggiornamenti sui biglietti.'], ['proposals', 'Esito delle tue proposte', 'Quando Alessia accetta o declina.']];
  for (const [key, label, text] of items) {
    list.append(toggle({ label, description: text, checked: notif[key], onChange: async (v) => {
      try { await saveNotificationPrefs(profile.id, { [key]: v }); } catch (err) { toast(err.message, 'error'); throw err; }
    } }).el);
  }
  notifCard.append(list);

  // push
  const pushHost = h('div', { class: 'stack' });
  async function paintPush() {
    pushHost.replaceChildren(spinner());
    const nodes = [h('h3', { class: 'card-title' }, 'Su questo dispositivo')];
    if (!pushSupported()) {
      nodes.push(h('p', { class: 'notice' }, 'Questo browser non supporta le notifiche push. Su iPhone servono iOS 16.4 o successivo e l’app aggiunta alla schermata Home (Condividi › Aggiungi alla schermata Home).'));
    } else if (!pushConfigured()) {
      nodes.push(h('p', { class: 'notice' }, 'Le notifiche push non sono ancora attive: sul server mancano le chiavi di invio (VAPID). Le notifiche dentro l’app funzionano già. Vedi docs/NOTIFICHE.md.'));
    } else {
      let devices = []; let here = null;
      try { devices = await listDevices(profile.id); here = await currentSubscription(); } catch (err) { nodes.push(errorBox(err.message)); }
      const registered = here && devices.some((d) => d.endpoint === here.endpoint);
      if (!registered) {
        const enable = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => withBusy(enable, async () => {
          try { await enablePush(profile.id); toast('Notifiche attivate su questo dispositivo.', 'success'); await paintPush(); } catch (err) { toast(err.message, 'error'); }
        }) }, pushPermission() === 'denied' ? 'Notifiche bloccate dal dispositivo' : 'Attiva le notifiche qui');
        if (pushPermission() === 'denied') enable.disabled = true;
        nodes.push(h('p', { class: 'muted' }, 'Ricevi i biglietti anche quando l’app è chiusa.'), enable);
      }
      if (devices.length) {
        nodes.push(h('p', { class: 'label' }, 'Dispositivi collegati'), h('ul', { class: 'plain-list' }, devices.map((d) => h('li', { class: 'row' },
          h('span', { class: 'grow' }, d.label || 'Dispositivo', here && here.endpoint === d.endpoint ? h('span', { class: 'chip' }, 'questo') : null),
          h('button', { class: 'btn btn-text btn-danger-text', type: 'button', onclick: async (ev) => withBusy(ev.currentTarget, async () => {
            try { await removeDevice(d); toast('Dispositivo rimosso.'); await paintPush(); } catch (err) { toast(err.message, 'error'); }
          }) }, 'Rimuovi')))));
      }
    }
    pushHost.replaceChildren(...nodes);
  }
  notifCard.append(pushHost);
  sections.push(notifCard);
  paintPush();

  // ------------------------------------------------------------------ intelligenza artificiale (solo Alessia)
  if (isAlessia) {
    const card = h('section', { class: 'card stack', 'aria-labelledby': 'ai-title' }, h('h2', { class: 'card-title', id: 'ai-title' }, 'Intelligenza artificiale'));
    const status = h('p', { class: 'notice' }, 'Verifico lo stato del servizio…');
    aiStatus().then((s) => {
      status.textContent = s.configured
        ? 'L’assistente AI è collegato: può scrivere la motivazione del mattino e proporre idee, solo con i consensi che dai qui sotto.'
        : 'L’assistente AI non è ancora collegato (sul server manca la chiave). Finché non c’è, ricevi messaggi gentili preparati a mano: nessuna AI è in funzione.';
    }).catch(() => { status.textContent = 'Non riesco a verificare lo stato del servizio in questo momento.'; });
    const sub = [];
    const mk = (key, label, text) => {
      const t = toggle({ label, description: text, checked: ai[key], onChange: async (v) => {
        try { await saveAiPrefs(profile.id, { [key]: v }); ai[key] = v; } catch (err) { toast(err.message, 'error'); throw err; }
      } });
      sub.push(t); return t;
    };
    const master = toggle({ label: 'Consenti l’uso dell’AI', description: 'Acconsenti esplicitamente: puoi revocare quando vuoi e ogni consenso specifico si spegne. I testi li scrive un servizio esterno, Gemini di Google: riceve il tuo nome, il numero di allenamenti e abitudini degli ultimi 7 giorni e solo gli altri dati che consenti qui sotto.', checked: ai.ai_enabled, onChange: async (v) => {
      try {
        await saveAiPrefs(profile.id, { ai_enabled: v });
        ai.ai_enabled = v;
        for (const t of sub) { t.input.disabled = !v; if (!v) t.input.checked = false; }
        toast(v ? 'AI attivata.' : 'AI disattivata: i consensi sono stati revocati.');
      } catch (err) { toast(err.message, 'error'); throw err; }
    } });
    const list2 = h('div', { class: 'switch-list' }, master.el,
      mk('use_equipment', 'Usa la mia attrezzatura', 'Invia i nomi dei tuoi attrezzi, per proporre esercizi adatti.').el,
      mk('use_wellbeing', 'Usa umore ed energia', 'Invia solo i numeri di umore ed energia degli ultimi giorni. Mai le note.').el,
      mk('use_journal', 'Usa le mie voci di diario', 'Invia a Google brevi estratti delle ultime voci, anche private. Attiva solo se ti sta bene.').el);
    for (const t of sub) t.input.disabled = !ai.ai_enabled;
    const time = h('input', { id: 'morning', type: 'time', class: 'input', value: settings.morning_time, 'aria-label': 'Orario della motivazione del mattino' });
    const saveTime = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => withBusy(saveTime, async () => {
      try { await saveSettings(profile.id, { morning_time: time.value || '08:00' }); toast('Orario salvato.', 'success'); } catch (err) { toast(err.message, 'error'); }
    }) }, 'Salva l’orario');
    card.append(status, list2, h('div', { class: 'field' }, h('label', { class: 'label', for: 'morning' }, 'Orario del mattino'), time), saveTime,
      h('p', { class: 'muted small' }, 'L’AI non dà diagnosi, diete, trattamenti né giudizi sul corpo, e rispetta sempre le cose da evitare che indichi in Profilo › Attrezzatura e spazio. Il testo delle indicazioni del professionista non viene mai inviato.'));
    sections.push(card);
  }

  // ------------------------------------------------------------------ PIN
  const oldPin = field({ id: 'pin-old', label: 'PIN attuale', type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'off' });
  const newPin = field({ id: 'pin-new', label: 'Nuovo PIN (6 cifre)', type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'off' });
  const confirm = field({ id: 'pin-confirm', label: 'Ripeti il nuovo PIN', type: 'password', inputmode: 'numeric', maxlength: 6, autocomplete: 'off' });
  const pinError = h('p', { class: 'form-error', role: 'alert' });
  const pinBtn = h('button', { class: 'btn', type: 'submit' }, 'Cambia PIN');
  sections.push(h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, 'PIN di accesso'),
    h('p', { class: 'muted' }, 'Il PIN serve per entrare da un nuovo dispositivo. Su questo l’app resta aperta.'),
    h('form', { class: 'stack', novalidate: true, onsubmit: (ev) => {
      ev.preventDefault();
      pinError.textContent = '';
      const e1 = validatePin(oldPin.input.value); const e2 = validateNewPin(newPin.input.value, confirm.input.value);
      oldPin.setError(e1); newPin.setError(e2 && e2.includes('coincidono') ? null : e2); confirm.setError(e2 && e2.includes('coincidono') ? e2 : null);
      if (e1 || e2) return;
      withBusy(pinBtn, async () => {
        try { await changePin(oldPin.input.value, newPin.input.value); toast('PIN cambiato.', 'success'); oldPin.input.value = ''; newPin.input.value = ''; confirm.input.value = ''; }
        catch (err) { pinError.textContent = err.message; }
      });
    } }, oldPin.wrap, newPin.wrap, confirm.wrap, pinError, pinBtn)));

  // ------------------------------------------------------------------ aspetto
  const themeBtn = h('button', { class: 'btn btn-secondary', type: 'button' });
  initThemeToggle(themeBtn);
  sections.push(h('section', { class: 'card stack' }, h('h2', { class: 'card-title' }, 'Aspetto'), h('p', { class: 'muted' }, 'Chiaro, scuro o quello del tuo telefono.'), themeBtn));

  return h('main', { class: 'shell with-tabs' }, ...sections);
}
