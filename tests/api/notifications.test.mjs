// Integrazione reale: invii pianificati lato server (cron → Edge Function), motivazione del mattino, push, promemoria.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { makeUser, cleanup, adminClient, callFunction, link } from './helpers.mjs';
import { startMockAnthropic, OK, DAILY } from './mock-anthropic.mjs';

const SECRET = process.env.ALE_TEST_CRON_SECRET || 'test-cron-secret-locale';
let ale; let phill; let mock;
const dispatch = (headers = {}) => fetch(`${process.env.ALE_API_URL ?? 'http://127.0.0.1:54321'}/functions/v1/push-dispatch`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}',
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

before(async () => {
  mock = await startMockAnthropic();
  mock.respond((r) => (r.isClassifier ? OK : DAILY({ title: 'Respira', text: 'Prima di iniziare, un respiro lento: il resto può aspettare un momento.' })));
  ale = await makeUser('alessia', 'Alessia');
  phill = await makeUser('phill', 'Phill');
  await link(ale, phill);
  await adminClient().from('notifications').delete().eq('user_id', ale.id);
});
after(async () => { await mock.close(); await adminClient().from('internal_config').delete().in('key', ['functions_url', 'cron_secret']); await cleanup(); });

test('push-dispatch: senza il segreto dei job rifiuta qualunque richiesta', async () => {
  assert.equal((await dispatch()).status, 401);
  assert.equal((await dispatch({ 'x-cron-secret': 'sbagliato' })).status, 401);
  assert.equal((await dispatch({ authorization: `Bearer ${(await ale.client.auth.getSession()).data.session.access_token}` })).status, 401, 'nemmeno con la sessione di un utente');
  const ok = await dispatch({ 'x-cron-secret': SECRET });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.push, 'not_configured', 'senza chiavi VAPID il push non parte, e lo dichiara');
});

test('motivazione del mattino: creata dal SERVER una volta al giorno, senza browser aperto', async () => {
  const admin = adminClient();
  await admin.from('user_settings').insert({ user_id: ale.id, morning_time: '00:00' });
  // AI spenta: arriva comunque un pensiero preparato a mano (se la preferenza è attiva)
  let r = await dispatch({ 'x-cron-secret': SECRET });
  assert.ok(r.body.morning >= 1);
  let n = await admin.from('notifications').select('title, body, link, kind').eq('user_id', ale.id).eq('kind', 'daily');
  assert.equal(n.data.length, 1);
  assert.equal(n.data[0].title, 'Il tuo pensiero di oggi');
  assert.ok(n.data[0].body.length > 3);
  assert.equal(n.data[0].link, '#/home');
  assert.equal(mock.requests.length, 0, 'AI spenta: nessuna chiamata esterna');
  // idempotente: un secondo passaggio non duplica
  r = await dispatch({ 'x-cron-secret': SECRET });
  assert.equal((await admin.from('notifications').select('id').eq('user_id', ale.id).eq('kind', 'daily')).data.length, 1);
  assert.equal(r.body.morning, 0);
  // Phill non riceve la motivazione di Alessia
  assert.equal((await admin.from('notifications').select('id').eq('user_id', phill.id).eq('kind', 'daily')).data.length, 0);
});

test('motivazione del mattino: con AI consentita usa Claude; con la preferenza spenta non arriva nulla', async () => {
  const admin = adminClient();
  await admin.from('notifications').delete().eq('user_id', ale.id);
  await ale.client.from('ai_preferences').insert({ user_id: ale.id, ai_enabled: true });
  await dispatch({ 'x-cron-secret': SECRET });
  const n = await admin.from('notifications').select('body').eq('user_id', ale.id).eq('kind', 'daily');
  assert.equal(n.data.length, 1);
  assert.equal(n.data[0].body, 'Respira', 'il testo viene dalla generazione AI di oggi');
  assert.ok(mock.generators().length >= 1);
  // preferenza spenta
  await admin.from('notifications').delete().eq('user_id', ale.id);
  await ale.client.from('notification_preferences').insert({ user_id: ale.id, daily_motivation: false });
  await dispatch({ 'x-cron-secret': SECRET });
  assert.equal((await admin.from('notifications').select('id').eq('user_id', ale.id).eq('kind', 'daily')).data.length, 0);
  await ale.client.from('notification_preferences').update({ daily_motivation: true }).eq('user_id', ale.id);
});

test('orario del mattino rispettato: prima dell\'ora scelta non parte nulla', async () => {
  const admin = adminClient();
  await admin.from('notifications').delete().eq('user_id', ale.id);
  await admin.from('user_settings').update({ morning_time: '23:59' }).eq('user_id', ale.id);
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  if (hm < '23:59') {
    await dispatch({ 'x-cron-secret': SECRET });
    assert.equal((await admin.from('notifications').select('id').eq('user_id', ale.id).eq('kind', 'daily')).data.length, 0, 'non ancora l\'ora');
  }
  await admin.from('user_settings').update({ morning_time: '00:00' }).eq('user_id', ale.id);
});

test('promemoria: il server crea la notifica alla scadenza, una volta sola, nel rispetto delle preferenze', async () => {
  const admin = adminClient();
  await admin.from('notifications').delete().eq('user_id', ale.id);
  const ev = await ale.client.from('calendar_events').insert({
    owner_id: ale.id, created_by: ale.id, title: 'Bere acqua', category: 'reminder', starts_at: new Date(Date.now() - 60_000).toISOString(),
  }).select().single();
  assert.equal(ev.error, null);
  const first = await admin.rpc('generate_due_notifications');
  assert.ok(first.data >= 1);
  const n = await ale.client.from('notifications').select('title, kind, link').eq('kind', 'reminder');
  assert.equal(n.data.length, 1);
  assert.equal(n.data[0].title, 'Bere acqua');
  assert.equal((await admin.rpc('generate_due_notifications')).data, 0, 'nessun doppione');
  // solo il server può eseguirla
  assert.ok((await ale.client.rpc('generate_due_notifications')).error);
});

test('push: il job pianificato nel database chiama davvero la funzione con il segreto (cron → http)', async () => {
  const admin = adminClient();
  const hits = [];
  const server = createServer((req, res) => { hits.push({ url: req.url, method: req.method, secret: req.headers['x-cron-secret'] }); res.writeHead(200); res.end('{}'); });
  await new Promise((r) => server.listen(9912, '0.0.0.0', r));
  try {
    // non configurato: nessuna chiamata
    await admin.from('internal_config').delete().in('key', ['functions_url', 'cron_secret']);
    assert.equal((await admin.rpc('call_push_dispatch')).error, null);
    await new Promise((r) => setTimeout(r, 2500));
    assert.equal(hits.length, 0, 'senza configurazione il job non fa nulla');
    // configurato
    await admin.from('internal_config').insert([{ key: 'functions_url', value: `http://${process.env.ALE_DOCKER_HOST || 'host.docker.internal'}:9912/functions/v1` }, { key: 'cron_secret', value: 'segreto-di-prova' }]);
    assert.equal((await admin.rpc('call_push_dispatch')).error, null);
    for (let i = 0; i < 40 && !hits.length; i++) await new Promise((r) => setTimeout(r, 500));
    assert.equal(hits.length >= 1, true, 'il database ha chiamato la funzione');
    assert.deepEqual(hits[0], { url: '/functions/v1/push-dispatch', method: 'POST', secret: 'segreto-di-prova' });
  } finally { server.close(); await admin.from('internal_config').delete().in('key', ['functions_url', 'cron_secret']); }
  // un utente non può avviare il job, né leggere la configurazione
  assert.ok((await ale.client.rpc('call_push_dispatch')).error);
  assert.ok((await ale.client.from('internal_config').select('*')).error || true);
  assert.deepEqual((await ale.client.from('internal_config').select('*')).data ?? [], []);
});

test('dispositivi push: ognuno gestisce solo i propri; endpoint https obbligatorio', async () => {
  const ep = `https://push.example.test/${ale.id}`;
  const ins = await ale.client.from('push_subscriptions').insert({ user_id: ale.id, endpoint: ep, p256dh: 'k'.repeat(20), auth: 'a'.repeat(10), label: 'iPhone · Safari' });
  assert.equal(ins.error, null, ins.error?.message);
  assert.equal((await ale.client.from('push_subscriptions').select('id').eq('endpoint', ep)).data.length, 1);
  assert.equal((await phill.client.from('push_subscriptions').select('id')).data.length, 0, 'Phill non vede i dispositivi di Alessia');
  assert.ok((await phill.client.from('push_subscriptions').insert({ user_id: phill.id, endpoint: ep, p256dh: 'k', auth: 'a' })).error, 'un endpoint non si ruba');
  assert.ok((await ale.client.from('push_subscriptions').insert({ user_id: ale.id, endpoint: 'http://insicuro.example.test/x', p256dh: 'k', auth: 'a' })).error);
  assert.equal((await phill.client.from('push_subscriptions').delete().eq('endpoint', ep).select()).data.length, 0);
  assert.equal((await ale.client.from('push_subscriptions').delete().eq('endpoint', ep).select()).data.length, 1);
});
