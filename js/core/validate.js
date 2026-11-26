// Validazione lato client (comodità per l'utente: la sicurezza vera è nel database e nel server).
export const NAME_MAX = 40;
export const PIN_LENGTH = 6;

export function validateName(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'Scrivi un nome.';
  if ([...v].length > NAME_MAX) return `Il nome può essere lungo al massimo ${NAME_MAX} lettere.`;
  return null;
}

export function validatePin(value) {
  return /^\d{6}$/.test(String(value ?? '')) ? null : 'Il PIN deve avere 6 numeri.';
}

export function validateNewPin(value, confirm) {
  return validatePin(value) || (value === confirm ? null : 'I due PIN sono diversi.');
}
