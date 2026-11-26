// Messaggi in italiano per l'accesso con PIN (modulo puro, testabile senza browser).
export function formatWait(seconds) {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 90) return `${s} secondi`;
  const m = Math.ceil(s / 60);
  if (m < 90) return `${m} minuti`;
  const h = Math.ceil(m / 60);
  return `${h} ${h === 1 ? 'ora' : 'ore'}`;
}

/** Messaggio in italiano per un errore della funzione di accesso. */
export function accessMessage(code, data = {}) {
  switch (code) {
    case 'wrong_pin': return `Il PIN non è corretto. Tentativi rimasti: ${data.attempts_left ?? '—'}.`;
    case 'locked': return `Hai provato troppe volte. Riprova tra ${formatWait(data.retry_after ?? 60)}.`;
    case 'wrong_setup_code': return 'Il codice di avvio non è quello giusto.';
    case 'already_claimed': return 'Questo profilo è già pronto: inserisci il suo PIN.';
    case 'invalid_pin': return 'Il PIN deve avere 6 numeri.';
    case 'not_claimed': return 'Questo profilo non è ancora pronto.';
    default: return 'Qualcosa non ha funzionato. Riprova tra poco.';
  }
}

