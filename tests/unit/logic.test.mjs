import test from 'node:test';
import assert from 'node:assert/strict';
import { validateName, validatePin, validateNewPin } from '../../js/core/validate.js';
import { greeting, partOfDay, GREETING_MESSAGES } from '../../js/core/greeting.js';
import { parseHash, decide, ROUTES } from '../../js/core/route-logic.js';
import { authMessage, rpcMessage, dataMessage } from '../../js/core/errors.js';
import { accessMessage, formatWait } from '../../js/core/access-messages.js';

test('validazione nome e PIN', () => {
  assert.equal(validateName('Alessia'), null);
  assert.equal(validateName('A'.repeat(40)), null);
  assert.ok(validateName('A'.repeat(41)));
  assert.ok(validateName('   '));
  assert.equal(validatePin('123456'), null);
  for (const bad of ['12345', '1234567', 'abcdef', '', null, '12 456']) assert.ok(validatePin(bad), String(bad));
  assert.equal(validateNewPin('123456', '123456'), null);
  assert.ok(validateNewPin('123456', '123457'));
  assert.ok(validateNewPin('12', '12'));
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
  assert.deepEqual(parseHash('#/attivita/scheda?id=abc'), { path: '/attivita/scheda', query: { id: 'abc' } });
  assert.deepEqual(parseHash(''), { path: '/', query: {} });
  assert.deepEqual(parseHash('#/home/'), { path: '/home', query: {} });
  assert.deepEqual(parseHash('#scegli'), { path: '/scegli', query: {} });
});

test('router: senza sessione si va alla scelta del profilo, con sessione alla Home', () => {
  const out = { session: false };
  const inn = { session: true };
  for (const p of ['/home', '/profilo', '/profilo/collegamento', '/profilo/privacy']) {
    assert.deepEqual(decide(p, out), { redirect: '/scegli' }, p);
    assert.deepEqual(decide(p, inn), { render: p }, p);
  }
  assert.deepEqual(decide('/scegli', out), { render: '/scegli' });
  assert.deepEqual(decide('/scegli', inn), { redirect: '/home' }, 'con una sessione salvata non si rivede la scelta');
  assert.deepEqual(decide('/', out), { redirect: '/scegli' });
  assert.deepEqual(decide('/', inn), { redirect: '/home' });
  assert.deepEqual(decide('/non-esiste', out), { redirect: '/scegli' });
  assert.deepEqual(decide('/non-esiste', inn), { redirect: '/home' });
  assert.deepEqual(decide('/__proto__', inn), { redirect: '/home' });
  assert.deepEqual(decide('/constructor', out), { redirect: '/scegli' });
  // le vecchie pagine di accesso non esistono più
  for (const gone of ['/accedi', '/registrati', '/password-dimenticata', '/reimposta-password', '/invito']) {
    assert.equal(ROUTES[gone], undefined, `${gone} dovrebbe essere stata rimossa`);
    assert.deepEqual(decide(gone, out), { redirect: '/scegli' });
  }
});

test('router: ogni rotta ha un tipo valido', () => {
  for (const k of Object.values(ROUTES)) assert.ok(['guest', 'auth'].includes(k));
});

test('messaggi d\'errore: italiano, senza dettagli tecnici', () => {
  assert.match(authMessage({ code: 'invalid_credentials' }), /non corrette/);
  assert.match(authMessage({ message: 'Failed to fetch' }), /connessione/);
  assert.match(authMessage({ status: 429 }), /troppe richieste/);
  assert.doesNotMatch(authMessage({ message: 'duplicate key value violates unique constraint "x"' }), /duplicate|constraint/);
  assert.match(rpcMessage('invalid_code'), /non va bene/);
  assert.equal(rpcMessage('boh'), 'Qualcosa non ha funzionato. Riprova tra poco.');
  assert.match(dataMessage({ code: '42501' }), /non puoi/);
});

test('accesso: messaggi chiari per PIN errato e blocco', () => {
  assert.match(accessMessage('wrong_pin', { attempts_left: 3 }), /3/);
  assert.match(accessMessage('locked', { retry_after: 60 }), /60 secondi|1 minut/);
  assert.match(accessMessage('wrong_setup_code'), /codice/);
  assert.match(accessMessage('already_claimed'), /già/);
  assert.equal(accessMessage('boh'), 'Qualcosa non ha funzionato. Riprova tra poco.');
  assert.equal(formatWait(30), '30 secondi');
  assert.equal(formatWait(300), '5 minuti');
  assert.equal(formatWait(7200), '2 ore');
  assert.equal(formatWait(3600), '60 minuti');
});
