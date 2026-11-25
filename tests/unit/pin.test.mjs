import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidPin, newSalt, hashPin, verifyPin, safeEqual, lockSeconds, afterAttempt, isLocked, retryAfter,
  checkSetupCode, MAX_FAILED, internalEmail, ROLES,
} from '../../supabase/functions/_shared/pin.js';

test('PIN: solo 6 cifre', () => {
  assert.ok(isValidPin('123456') && isValidPin('000000'));
  for (const bad of ['12345', '1234567', 'abcdef', '12 456', '', null, undefined, 123456, '１２３４５６']) assert.ok(!isValidPin(bad), String(bad));
});

test('hash PBKDF2: sale casuale, verifica corretta, mai il PIN in chiaro', async () => {
  const s1 = newSalt(); const s2 = newSalt();
  assert.notEqual(s1, s2);
  const h1 = await hashPin('123456', s1);
  assert.notEqual(h1, await hashPin('123456', s2), 'sali diversi → hash diversi');
  assert.equal(h1, await hashPin('123456', s1), 'deterministico a parità di sale');
  assert.ok(!h1.includes('123456'));
  assert.equal(await verifyPin('123456', s1, h1), true);
  assert.equal(await verifyPin('123457', s1, h1), false);
  assert.equal(await verifyPin('12345', s1, h1), false, 'un PIN non valido non viene nemmeno confrontato');
});

test('confronto a tempo costante', () => {
  assert.ok(safeEqual('abc', 'abc'));
  assert.ok(!safeEqual('abc', 'abd'));
  assert.ok(!safeEqual('abc', 'abcd'));
  assert.ok(!safeEqual('', 'a'));
});

test('blocco progressivo: 5 errori → 1 min, poi 5 min, 15 min, 1 h, 6 h, 24 h', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(lockSeconds), [60, 300, 900, 3600, 21600, 86400, 86400]);
  let st = { failed_attempts: 0, lock_level: 0, locked_until: null };
  const now = new Date('2026-11-29T10:00:00Z');
  for (let i = 1; i < MAX_FAILED; i++) { st = afterAttempt(st, false, now); assert.equal(st.failed_attempts, i); assert.ok(!isLocked(st, now)); }
  st = afterAttempt(st, false, now);
  assert.ok(isLocked(st, now));
  assert.equal(st.lock_level, 1);
  assert.equal(retryAfter(st, now), 60);
  assert.ok(!isLocked(st, new Date(now.getTime() + 61_000)), 'passato il blocco si può riprovare');
  // secondo blocco più lungo
  let st2 = { ...st, locked_until: null };
  for (let i = 0; i < MAX_FAILED; i++) st2 = afterAttempt(st2, false, now);
  assert.equal(st2.lock_level, 2);
  assert.equal(retryAfter(st2, now), 300);
  // un accesso riuscito azzera tutto
  assert.deepEqual(afterAttempt(st2, true, now), { failed_attempts: 0, lock_level: 0, locked_until: null });
});

test('codice di configurazione: obbligatorio solo se impostato; confronto senza maiuscole/spazi', () => {
  assert.ok(checkSetupCode('', 'qualsiasi'));
  assert.ok(checkSetupCode(undefined, undefined));
  assert.ok(checkSetupCode('AB12CD34', ' ab12cd34 '));
  assert.ok(!checkSetupCode('AB12CD34', 'AB12CD35'));
  assert.ok(!checkSetupCode('AB12CD34', undefined));
  assert.ok(!checkSetupCode('AB12CD34', 12345678));
});

test('identità: due ruoli, indirizzo interno non instradabile', () => {
  assert.deepEqual(ROLES, ['alessia', 'phill']);
  assert.equal(internalEmail('phill'), 'phill@ale-app.local');
});
