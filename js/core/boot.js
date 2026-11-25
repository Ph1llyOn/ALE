// DEVE essere il primo import di main.js: cattura l'hash iniziale prima che supabase-js lo consumi
// (i link nelle email arrivano con #access_token=... oppure #error=...).
export const bootHash = globalThis.location?.hash ?? '';

/** Se l'hash iniziale descrive un errore di Auth (link scaduto o già usato), restituisce un messaggio. */
export function bootLinkError(hash = bootHash) {
  const params = new URLSearchParams(String(hash).replace(/^#/, ''));
  if (!params.has('error') && !params.has('error_code')) return null;
  return params.get('error_code') === 'otp_expired'
    ? 'Il link è scaduto o è già stato usato. Richiedine uno nuovo.'
    : 'Il link non è valido. Richiedine uno nuovo.';
}
