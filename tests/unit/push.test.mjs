import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPayload, dispatchPush, usersDueForMorning, STALE_AFTER_MS } from '../../supabase/functions/_shared/push-core.js';

const now = new Date('2026-11-26T08:00:00Z');
const recent = new Date(now.getTime() - 60_000).toISOString();
const mk = (over = {}) => ({ id: 'n1', user_id: 'u1', title: 'Ciao', body: 'Testo', link: '#/home', created_at: recent, ...over });
function harness(subs, sendImpl) {
  const marked = []; const removed = []; const sent = [];
  return {
    marked, removed, sent,
    args: {
      notifications: [], subscriptionsByUser: new Map([['u1', subs]]), now,
      send: async (s, p) => { sent.push({ s, p }); if (sendImpl) return sendImpl(s); },
      markPushed: async (id, err) => marked.push([id, err]),
      removeSubscription: async (id) => removed.push(id),
    },
  };
}

test('payload: titolo, testo e solo link interni all\'app', () => {
  const p = JSON.parse(buildPayload(mk()));
  assert.deepEqual([p.title, p.body, p.url], ['Ciao', 'Testo', '#/home']);
  assert.equal(JSON.parse(buildPayload(mk({ link: 'https://evil.example/x' }))).url, '#/notifiche');
  assert.equal(JSON.parse(buildPayload(mk({ link: 'javascript:alert(1)' }))).url, '#/notifiche');
  assert.equal(JSON.parse(buildPayload(mk({ body: 'x'.repeat(500) }))).body.length, 140);
});

test('invio: consegna a tutti i dispositivi e segna la notifica una sola volta', async () => {
  const h = harness([{ id: 's1' }, { id: 's2' }]);
  const st = await dispatchPush({ ...h.args, notifications: [mk()] });
  assert.equal(st.sent, 2);
  assert.deepEqual(h.marked, [['n1', null]]);
});

test('invio: endpoint scaduti (404/410) vengono rimossi, altri errori registrati', async () => {
  const h = harness([{ id: 'gone' }, { id: 'bad' }], (s) => { throw Object.assign(new Error('x'), { statusCode: s.id === 'gone' ? 410 : 500 }); });
  const st = await dispatchPush({ ...h.args, notifications: [mk()] });
  assert.deepEqual(h.removed, ['gone']);
  assert.equal(st.removed, 1);
  assert.equal(st.failed, 1);
  assert.deepEqual(h.marked, [['n1', '500']]);
});

test('invio: senza dispositivi o troppo vecchie non si invia, ma si segna', async () => {
  const none = harness([]);
  await dispatchPush({ ...none.args, notifications: [mk()] });
  assert.deepEqual(none.marked, [['n1', 'nessun dispositivo']]);
  assert.equal(none.sent.length, 0);
  const old = harness([{ id: 's1' }]);
  const st = await dispatchPush({ ...old.args, notifications: [mk({ created_at: new Date(now.getTime() - STALE_AFTER_MS - 1000).toISOString() })] });
  assert.equal(st.stale, 1);
  assert.equal(old.sent.length, 0);
});

test('mattino: rispetta orario, preferenza e unicità giornaliera', () => {
  const rows = [
    { user_id: 'a', morning_time: '08:00:00', daily_pref: true, has_today: false },
    { user_id: 'b', morning_time: '09:30', daily_pref: true, has_today: false },
    { user_id: 'c', morning_time: '07:00', daily_pref: false, has_today: false },
    { user_id: 'd', morning_time: '07:00', daily_pref: true, has_today: true },
    { user_id: 'e', morning_time: null, daily_pref: null, has_today: false },
  ];
  assert.deepEqual(usersDueForMorning(rows, '08:15'), ['a', 'e']);
});

test('service worker: gestisce push e click, con destinazioni solo interne', () => {
  const sw = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /addEventListener\('push'/);
  assert.match(sw, /addEventListener\('notificationclick'/);
  assert.match(sw, /showNotification/);
  assert.match(sw, /startsWith\('#\/'\)/, 'il link viene accettato solo se interno');
});
