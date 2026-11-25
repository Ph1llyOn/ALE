// Traduce errori tecnici (Supabase Auth, PostgREST, funzioni del database) in messaggi chiari in italiano.
const RPC_ERRORS = {
  invalid_code: 'Il codice non è valido o è scaduto. Controlla e riprova.',
  too_many_attempts: 'Troppi tentativi. Riprova tra 15 minuti.',
  already_linked: 'C’è già un collegamento attivo.',
  not_alessia: 'Solo Alessia può creare inviti.',
  not_phill: 'Solo Phill può usare un codice invito.',
  no_partnership: 'Non c’è nessun collegamento attivo.',
  unauthenticated: 'Devi accedere per continuare.',
};

export function rpcMessage(code) {
  return RPC_ERRORS[code] ?? 'Qualcosa non ha funzionato. Riprova.';
}

export function isNetworkError(error) {
  const m = String(error?.message || '').toLowerCase();
  return error?.name === 'AuthRetryableFetchError' || m.includes('failed to fetch') || m.includes('network') || m.includes('load failed');
}

export function authMessage(error) {
  if (!error) return '';
  const code = error.code || '';
  const msg = String(error.message || '').toLowerCase();
  if (isNetworkError(error)) return 'Non riesco a collegarmi. Controlla la connessione e riprova.';
  if (code === 'invalid_credentials' || msg.includes('invalid login')) return 'Email o password non corrette.';
  if (code === 'email_not_confirmed' || msg.includes('not confirmed')) return 'Devi prima confermare la tua email: controlla la posta.';
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'Esiste già un account con questa email.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Troppe richieste ravvicinate. Aspetta un momento e riprova.';
  }
  if (code === 'otp_expired' || msg.includes('expired')) return 'Il link è scaduto. Richiedine uno nuovo.';
  if (code === 'same_password') return 'La nuova password deve essere diversa da quella attuale.';
  if (code === 'signup_disabled') return 'Le nuove registrazioni sono disattivate.';
  if (code === 'weak_password' || msg.includes('password')) return 'La password non è abbastanza sicura (almeno 10 caratteri).';
  if (msg.includes('database error saving new user')) return 'Non è stato possibile creare l’account. Riprova.';
  return 'Qualcosa non ha funzionato. Riprova.';
}

export function dataMessage(error) {
  if (!error) return '';
  if (isNetworkError(error)) return 'Non riesco a collegarmi. Controlla la connessione e riprova.';
  if (error.code === '23514') return 'Il valore inserito non è valido.';
  if (error.code === '42501') return 'Non hai il permesso di farlo.';
  return 'Qualcosa non ha funzionato. Riprova.';
}
