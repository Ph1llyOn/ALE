// Regole lato database su cui si appoggia il controllo push (sincronizzazione senza duplicati). Stack Supabase LOCALE.
// Già coperti in notifications.test.mjs (non ripetuti): endpoint https obbligatorio, isolamento in lettura, insert/delete altrui.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, cleanup, adminClient } from './helpers.mjs';

let ale; let phill;
const row = (user, endpoint, extra = {}) => ({ user_id: user.id, endpoint, p256dh: 'k'.repeat(20), auth: 'a'.repeat(10), label: 'iPhone · Safari', ...extra });
// Stessa chiamata dell'app (api-push.js → saveSubscription)
const sync = (user, endpoint, extra) => user.client.from('push_subscriptions').upsert(row(user, endpoint, extra), { onConflict: 'endpoint', ignoreDuplicates: true });
const mine = async (user) => (await user.client.from('push_subscriptions').select('endpoint').eq('user_id', user.id)).data.map((r) => r.endpoint);

before(async () => { ale = await makeUser('alessia', 'Alessia'); phill = await makeUser('phill', 'Phill'); });
after(cleanup);

test('sincronizzazione: lo stesso endpoint ripetuto più volte resta una sola riga', async () => {
  const ep = `https://push.example.test/sync/${ale.id}`;
  for (let i = 0; i < 3; i++) assert.equal((await sync(ale, ep)).error, null);
  assert.deepEqual((await mine(ale)).filter((e) => e === ep), [ep]);
  const admin = await adminClient().from('push_subscriptions').select('id').eq('endpoint', ep);
  assert.equal(admin.data.length, 1, 'nessun doppione nemmeno visto dal server');
});

test('sincronizzazione: un altro utente non può prendersi o riscrivere un endpoint già registrato', async () => {
  const ep = `https://push.example.test/steal/${ale.id}`;
  assert.equal((await sync(ale, ep, { label: 'Originale' })).error, null);
  const attempt = await sync(phill, ep, { label: 'Rubato' });
  assert.equal(attempt.error, null, 'ON CONFLICT DO NOTHING: nessun errore, nessun effetto');
  const admin = await adminClient().from('push_subscriptions').select('user_id, label').eq('endpoint', ep);
  assert.deepEqual(admin.data, [{ user_id: ale.id, label: 'Originale' }]);
  assert.ok(!(await mine(phill)).includes(ep));
  // nessuna UPDATE concessa: non si può nemmeno "spostare" una riga propria su un altro utente o endpoint
  const upd = await ale.client.from('push_subscriptions').update({ user_id: phill.id }).eq('endpoint', ep).select();
  assert.ok(upd.error || upd.data.length === 0);
  assert.equal((await adminClient().from('push_subscriptions').select('user_id').eq('endpoint', ep)).data[0].user_id, ale.id);
});

test('sostituzione della subscription: si cancella SOLO il vecchio endpoint, quello nuovo e gli altri dispositivi restano', async () => {
  const [oldEp, otherEp, newEp] = ['old', 'altro', 'new'].map((n) => `https://push.example.test/${n}/${ale.id}`);
  for (const ep of [oldEp, otherEp]) assert.equal((await sync(ale, ep)).error, null);
  const del = await ale.client.from('push_subscriptions').delete().eq('endpoint', oldEp).select('endpoint');
  assert.deepEqual(del.data.map((r) => r.endpoint), [oldEp]);
  assert.equal((await sync(ale, newEp)).error, null);
  const now = await mine(ale);
  assert.ok(now.includes(newEp) && now.includes(otherEp) && !now.includes(oldEp));
  // cancellare un endpoint già sparito è innocuo (idempotente)
  const again = await ale.client.from('push_subscriptions').delete().eq('endpoint', oldEp).select('endpoint');
  assert.equal(again.error, null); assert.deepEqual(again.data, []);
});

test('elenco endpoint: ognuno vede solo i propri, e il dispositivo cancellato da un altro utente resta', async () => {
  const ep = `https://push.example.test/own/${phill.id}`;
  assert.equal((await sync(phill, ep)).error, null);
  assert.ok((await mine(phill)).includes(ep));
  assert.ok(!(await mine(ale)).includes(ep));
  const foreign = await ale.client.from('push_subscriptions').delete().eq('endpoint', ep).select();
  assert.deepEqual(foreign.data, [], 'Alessia non può cancellare il dispositivo di Phill');
  assert.ok((await mine(phill)).includes(ep));
});

test('etichetta del dispositivo: opzionale, massimo 60 caratteri', async () => {
  const ok = `https://push.example.test/label-ok/${ale.id}`;
  assert.equal((await ale.client.from('push_subscriptions').insert({ user_id: ale.id, endpoint: ok, p256dh: 'k', auth: 'a' })).error, null, 'anche senza etichetta');
  assert.ok((await sync(ale, `https://push.example.test/label-long/${ale.id}`, { label: 'x'.repeat(61) })).error, 'etichetta troppo lunga rifiutata');
});
