// Validazione lato client (comodità per l'utente: la sicurezza vera è nel database).
export const PASSWORD_MIN = 10;
export const NAME_MAX = 40;

export function validateEmail(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'Inserisci la tua email.';
  if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Questa email non sembra valida.';
  return null;
}

export function validatePassword(value) {
  const v = String(value ?? '');
  if (!v) return 'Inserisci una password.';
  if (v.length < PASSWORD_MIN) return `La password deve avere almeno ${PASSWORD_MIN} caratteri.`;
  if (v.length > 72) return 'La password può avere al massimo 72 caratteri.';
  if (/^(.)\1+$/.test(v)) return 'Scegli una password meno prevedibile.';
  return null;
}

export function validateName(value) {
  const v = String(value ?? '').trim();
  if (!v) return 'Inserisci un nome.';
  if ([...v].length > NAME_MAX) return `Il nome può avere al massimo ${NAME_MAX} caratteri.`;
  return null;
}

export function validateRole(value) {
  return value === 'alessia' || value === 'phill' ? null : 'Scegli chi sei.';
}

/** Normalizza un codice invito: maiuscole, solo A-Z0-9. */
export function normalizeInviteCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function validateInviteCode(value) {
  const c = normalizeInviteCode(value);
  if (!c) return 'Inserisci il codice che hai ricevuto.';
  if (c.length !== 10) return 'Il codice ha 10 caratteri.';
  return null;
}

/** "ABCDEFGHJK" → "ABCDE-FGHJK" */
export function formatInviteCode(code) {
  const c = normalizeInviteCode(code);
  return c.length === 10 ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}
