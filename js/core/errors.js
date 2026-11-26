// Traduce errori tecnici (Supabase Auth, PostgREST, funzioni del database) in messaggi chiari in italiano.
const RPC_ERRORS = {
  invalid_code: 'Il codice non va bene o è scaduto. Controllalo e riprova.',
  too_many_attempts: 'Hai provato troppe volte. Riprova tra 15 minuti.',
  already_linked: 'Siete già collegati.',
  not_alessia: 'Solo Alessia può creare un invito.',
  not_phill: 'Solo Phill può usare un codice d’invito.',
  no_partnership: 'Non siete ancora collegati.',
  unauthenticated: 'Per continuare devi entrare di nuovo.',
};

export function rpcMessage(code) {
  return RPC_ERRORS[code] ?? 'Qualcosa non ha funzionato. Riprova tra poco.';
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
  if (code === 'invalid_credentials' || msg.includes('invalid login')) return 'Email o password non corrette. Riprova.';
  if (code === 'email_not_confirmed' || msg.includes('not confirmed')) return 'Prima devi confermare la tua email: dai un’occhiata alla posta.';
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'C’è già un account con questa email.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Hai fatto troppe richieste di fila. Aspetta un momento e riprova.';
  }
  if (code === 'otp_expired' || msg.includes('expired')) return 'Il link è scaduto. Chiedine uno nuovo.';
  if (code === 'same_password') return 'La nuova password deve essere diversa da quella di prima.';
  if (code === 'signup_disabled') return 'Per ora non si possono creare nuovi account.';
  if (code === 'weak_password' || msg.includes('password')) return 'La password è troppo debole: usa almeno 10 caratteri.';
  if (msg.includes('database error saving new user')) return 'L’account non è stato creato. Riprova tra poco.';
  return 'Qualcosa non ha funzionato. Riprova tra poco.';
}

export function dataMessage(error) {
  if (!error) return '';
  if (isNetworkError(error)) return 'Non riesco a collegarmi. Controlla la connessione e riprova.';
  if (error.code === '23514') return 'Il valore inserito non va bene.';
  if (error.code === '42501') return 'Da questo profilo non puoi farlo.';
  return 'Qualcosa non ha funzionato. Riprova tra poco.';
}
