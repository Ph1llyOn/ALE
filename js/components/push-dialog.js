// Popup delle notifiche: compare solo quando serve un gesto dell'utente (vedi core/push-health.js).
// Usa <dialog> (focus intrappolato e Esc nativi); dove non è disponibile ripiega su un overlay con le stesse regole.
import { h } from '../core/ui.js';

const SNOOZE_KEY = 'ale.push.snooze';
const SESSION_KEY = 'ale.push.snooze.session';
export const SNOOZE_HOURS = 24;

// Comodità, non verità: serve solo a non ripresentare il popup. Se lo storage non c'è, il popup può tornare e basta.
export function isPushSnoozed(now = Date.now()) {
  try { if (sessionStorage.getItem(SESSION_KEY)) return true; } catch { /* ignora */ }
  try { return Number(localStorage.getItem(SNOOZE_KEY) || 0) > now; } catch { return false; }
}
export function snoozePush({ session = false, hours = SNOOZE_HOURS, now = Date.now() } = {}) {
  try { if (session) sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignora */ }
  try { if (!session) localStorage.setItem(SNOOZE_KEY, String(now + hours * 3_600_000)); } catch { /* ignora */ }
}

const isIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isAndroid = () => /Android/.test(navigator.userAgent);

function content(status) {
  if (status === 'blocked') {
    const iphone = h('li', {}, h('strong', {}, 'iPhone: '), 'apri Impostazioni › Notifiche › ALE. e attiva «Consenti notifiche».');
    const android = h('li', {}, h('strong', {}, 'Android: '), 'tieni premuta l’icona di ALE. › Info app › Notifiche, e attivale.');
    return {
      title: 'Le notifiche sono spente',
      text: 'Su questo dispositivo le notifiche di ALE. sono bloccate, quindi i biglietti non ti arriveranno quando l’app è chiusa. Non cambio nulla senza di te: se vuoi riaverle, bastano pochi secondi.',
      steps: isAndroid() ? [android, iphone] : [iphone, android],
      primary: 'Ho capito, apro le Impostazioni', later: 'Più tardi',
    };
  }
  if (status === 'ask-permission') {
    return {
      title: 'Riattiviamo le notifiche?',
      text: 'Avevi attivato le notifiche, ma questo dispositivo non le consente più: così i biglietti non ti raggiungono quando l’app è chiusa. Basta un tocco per rimetterle.',
      primary: 'Attiva le notifiche', later: 'Più tardi',
    };
  }
  if (status === 'broken') {
    return {
      title: 'Le notifiche non si attivano',
      text: 'Ho provato a sistemare da sola, ma questa volta non ci sono riuscita. Riprova; se non va, chiudi l’app, riaprila dalla schermata Home e riprova ancora.',
      primary: 'Riprova', later: 'Più tardi',
    };
  }
  return { // unsupported + install-app
    title: 'Aggiungi ALE. alla schermata Home',
    text: 'Su iPhone le notifiche arrivano solo se l’app è installata. Tocca Condividi, poi «Aggiungi alla schermata Home», e apri ALE. da lì: ti guiderò per riattivarle.',
    primary: 'Ho capito', later: null,
  };
}

let dlg = null;

export function closePushDialog() {
  if (!dlg) return;
  const el = dlg; dlg = null;
  try { if (el.open && el.close) el.close(); } catch { /* ignora */ }
  el.remove();
}

/**
 * Mostra (o aggiorna) il popup per la diagnosi data.
 * - onEnable(): chiamata dentro il click (gesto utente); se lancia, il messaggio compare nel popup.
 * - onLater(): "Più tardi" / Esc.  - onAck(): pulsante di presa visione (blocked / install-app).
 */
export function showPushDialog(diag, { onEnable, onLater, onAck } = {}) {
  closePushDialog();
  const status = diag.status === 'unsupported' ? 'install-app' : diag.status;
  const c = content(status);
  const needsEnable = status === 'ask-permission' || status === 'broken';
  const msg = h('p', { class: 'push-dialog-msg', role: 'alert', hidden: true });
  const primary = h('button', { class: 'btn btn-block', type: 'button' }, c.primary);
  primary.addEventListener('click', async () => {
    if (!needsEnable) { closePushDialog(); onAck?.(diag); return; }
    primary.disabled = true; primary.setAttribute('aria-busy', 'true'); msg.hidden = true;
    try { await onEnable?.(); } // se il problema è risolto il monitor chiude il popup; se cambia, lo aggiorna
    catch (err) { msg.textContent = err?.message || 'Non è andata a buon fine. Riprova.'; msg.hidden = false; }
    finally { primary.disabled = false; primary.removeAttribute('aria-busy'); }
  });
  const later = c.later ? h('button', { class: 'btn btn-text btn-block', type: 'button', onclick: () => { closePushDialog(); onLater?.(diag); } }, c.later) : null;
  const body = [
    h('h2', { class: 'card-title', id: 'push-dialog-title' }, c.title),
    h('p', { id: 'push-dialog-text' }, c.text),
    c.steps ? h('ul', { class: 'push-dialog-steps' }, c.steps) : null,
    msg, h('div', { class: 'push-dialog-actions' }, primary, later),
  ];

  const useNative = typeof HTMLDialogElement === 'function';
  dlg = h(useNative ? 'dialog' : 'div', { class: 'push-dialog', 'aria-labelledby': 'push-dialog-title', 'aria-describedby': 'push-dialog-text', ...(useNative ? {} : { role: 'dialog', 'aria-modal': 'true' }) },
    h('div', { class: 'push-dialog-body stack' }, body));
  if (useNative) {
    dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); closePushDialog(); onLater?.(diag); }); // Esc = "Più tardi"
    document.body.append(dlg);
    dlg.showModal();
  } else {
    dlg.classList.add('push-dialog-overlay');
    dlg.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { closePushDialog(); onLater?.(diag); return; }
      if (ev.key !== 'Tab') return; // focus trap semplice
      const f = [...dlg.querySelectorAll('button:not([disabled])')];
      if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
    document.body.append(dlg);
  }
  primary.focus();
  return dlg;
}
export const isPushDialogOpen = () => Boolean(dlg);
