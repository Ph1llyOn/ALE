import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEmail, validatePassword, validateName, validateRole, normalizeInviteCode, validateInviteCode, formatInviteCode } from '../../js/core/validate.js';
import { greeting, partOfDay, GREETING_MESSAGES } from '../../js/core/greeting.js';
import { parseHash, decide, ROUTES } from '../../js/core/route-logic.js';
import { authMessage, rpcMessage, dataMessage } from '../../js/core/errors.js';

test('validazione email', () => {
  assert.equal(validateEmail('a@b.it'), null);
  for (const bad of ['', ' ', 'a', 'a@b', 'a b@c.it', '@c.it', 'a@c.', 'x'.repeat(250) + '@b.it']) assert.ok(validateEmail(bad), bad);
});

test('validazione password: minimo 10, no ripetizioni banali', () => {
  assert.equal(validatePassword('una-password-ok'), null);
  assert.ok(validatePassword('corta'));
  assert.ok(validatePassword('123456789'));
  assert.ok(validatePassword('aaaaaaaaaaaa'));
  assert.ok(validatePassword('x'.repeat(73)));
  assert.ok(validatePassword(''));
});

test('validazione nome e ruolo', () => {
  assert.equal(validateName('Alessia'), null);
  assert.equal(validateName('A'.repeat(40)), null);
  assert.ok(validateName('A'.repeat(41)));
  assert.ok(validateName('   '));
  assert.equal(validateRole('alessia'), null);
  assert.equal(validateRole('phill'), null);
  assert.ok(validateRole('admin'));
  assert.ok(validateRole(undefined));
});

test('codice invito: normalizzazione e formato', () => {
  assert.equal(normalizeInviteCode(' abcde-fghjk '), 'ABCDEFGHJK');
  assert.equal(formatInviteCode('abcdefghjk'), 'ABCDE-FGHJK');
  assert.equal(validateInviteCode('ABCDE-FGHJK'), null);
  assert.ok(validateInviteCode('ABC'));
  assert.ok(validateInviteCode(''));
});

test('saluto: fasce orarie e variazione giornaliera', () => {
  const at = (h, d = 1) => new Date(2026, 10, d, h, 0, 0);
  assert.equal(partOfDay(at(4)), 'evening');
  assert.equal(partOfDay(at(5)), 'morning');
  assert.equal(partOfDay(at(12)), 'morning');
  assert.equal(partOfDay(at(13)), 'afternoon');
  assert.equal(partOfDay(at(18)), 'afternoon');
  assert.equal(partOfDay(at(19)), 'evening');
  assert.equal(greeting(at(9, 5)).text, greeting(at(11, 5)).text, 'stessa frase nella stessa giornata');
  const texts = new Set([1, 2, 3].map((d) => greeting(at(9, d)).text));
  assert.equal(texts.size, GREETING_MESSAGES.morning.length, 'varia nei giorni');
  for (const list of Object.values(GREETING_MESSAGES)) {
    for (const t of list) assert.ok(!/\b(devi|dovresti|peso|calorie|obbligo)\b/i.test(t), `tono non adatto: ${t}`);
  }
});

test('router: parseHash', () => {
  assert.deepEqual(parseHash('#/invito?codice=ABC'), { path: '/invito', query: { codice: 'ABC' } });
  assert.deepEqual(parseHash(''), { path: '/', query: {} });
  assert.deepEqual(parseHash('#/home/'), { path: '/home', query: {} });
  assert.deepEqual(parseHash('#accedi'), { path: '/accedi', query: {} });
});

test('router: rotte protette e ospiti', () => {
  const out = { session: false, recovery: false };
  const inn = { session: true, recovery: false };
  assert.deepEqual(decide('/home', out), { redirect: '/accedi' });
  assert.deepEqual(decide('/profilo', out), { redirect: '/accedi' });
  assert.deepEqual(decide('/profilo/collegamento', out), { redirect: '/accedi' });
  assert.deepEqual(decide('/accedi', out), { render: '/accedi' });
  assert.deepEqual(decide('/accedi', inn), { redirect: '/home' });
  assert.deepEqual(decide('/registrati', inn), { redirect: '/home' });
  assert.deepEqual(decide('/home', inn), { render: '/home' });
  assert.deepEqual(decide('/invito', out), { render: '/invito' });
  assert.deepEqual(decide('/invito', inn), { render: '/invito' });
  assert.deepEqual(decide('/', out), { redirect: '/accedi' });
  assert.deepEqual(decide('/', inn), { redirect: '/home' });
  assert.deepEqual(decide('/non-esiste', out), { redirect: '/accedi' });
  assert.deepEqual(decide('/non-esiste', inn), { redirect: '/home' });
  assert.deepEqual(decide('/__proto__', inn), { redirect: '/home' });
  assert.deepEqual(decide('/constructor', out), { redirect: '/accedi' });
});

test('router: recupero password', () => {
  const rec = { session: true, recovery: true };
  assert.deepEqual(decide('/reimposta-password', rec), { render: '/reimposta-password' });
  assert.deepEqual(decide('/home', rec), { redirect: '/reimposta-password' });
  assert.deepEqual(decide('/profilo', rec), { redirect: '/reimposta-password' });
  assert.deepEqual(decide('/reimposta-password', { session: true, recovery: false }), { redirect: '/home' });
  assert.deepEqual(decide('/reimposta-password', { session: false, recovery: false }), { redirect: '/accedi' });
});

test('router: ogni rotta ha un tipo valido', () => {
  for (const k of Object.values(ROUTES)) assert.ok(['guest', 'auth', 'public', 'recovery'].includes(k));
});

test('messaggi d\'errore: italiano, senza dettagli tecnici', () => {
  assert.match(authMessage({ code: 'invalid_credentials' }), /non corrette/);
  assert.match(authMessage({ message: 'Failed to fetch' }), /connessione/);
  assert.match(authMessage({ status: 429 }), /Troppe richieste/);
  assert.match(authMessage({ code: 'otp_expired' }), /scaduto/);
  assert.doesNotMatch(authMessage({ message: 'duplicate key value violates unique constraint "x"' }), /duplicate|constraint/);
  assert.match(rpcMessage('invalid_code'), /non è valido/);
  assert.match(rpcMessage('too_many_attempts'), /15 minuti/);
  assert.equal(rpcMessage('boh'), 'Qualcosa non ha funzionato. Riprova.');
  assert.match(dataMessage({ code: '42501' }), /permesso/);
});
