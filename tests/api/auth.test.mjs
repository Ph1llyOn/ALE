import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { API_URL, PUBLISHABLE_KEY, makeUser, cleanup } from './helpers.mjs';

after(cleanup);

test('API diretta senza login: nessun dato, nessuna funzione', async () => {
  const headers = { apikey: PUBLISHABLE_KEY };
  const tables = ['profiles', 'invitations', 'partnerships', 'invitation_attempts', 'sharing_permissions', 'equipment', 'workouts',
    'workout_exercises', 'workout_sessions', 'session_exercise_progress', 'workout_proposals', 'habits', 'habit_logs', 'calendar_events',
    'journal_entries', 'wellbeing_logs', 'wellbeing_notes', 'progress_records', 'messages', 'scheduled_messages', 'notifications',
    'push_subscriptions', 'ai_preferences', 'ai_generations', 'message_receipts'];
  for (const table of tables) {
    const r = await fetch(`${API_URL}/rest/v1/${table}?select=*`, { headers });
    assert.ok([401, 403].includes(r.status), `${table}: atteso 401/403, ottenuto ${r.status}`);
  }
  for (const fn of ['create_invitation', 'redeem_invitation', 'end_partnership', 'revoke_invitation', 'set_sharing',
    'revoke_all_sharing', 'export_my_data', 'delete_my_account', 'can_view', 'is_partner_of', 'dispatch_due_scheduled_messages']) {
    const r = await fetch(`${API_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ p_code: 'AAAAAAAAAA' }),
    });
    assert.ok([401, 403, 404].includes(r.status), `${fn}: atteso 401/403/404, ottenuto ${r.status}`);
  }
});

test('API diretta con JWT manomesso o scaduto: rifiutata', async () => {
  const u = await makeUser('alessia');
  const { data } = await u.client.auth.getSession();
  const [h, p, s] = data.session.access_token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), sub: '00000000-0000-0000-0000-000000000000', role: 'service_role' })).toString('base64url');
  for (const token of [`${h}.${forgedPayload}.${s}`, `${h}.${p}.${s}x`, 'non-un-jwt']) {
    const r = await fetch(`${API_URL}/rest/v1/profiles?select=*`, { headers: { apikey: PUBLISHABLE_KEY, authorization: `Bearer ${token}` } });
    assert.ok(r.status === 401 || r.status === 403, `token falso accettato (${r.status})`);
  }
});

