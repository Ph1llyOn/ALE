// Edge Function `push-dispatch` — eseguita ogni minuto da pg_cron (via pg_net), mai dal browser.
//   1) motivazione del mattino: genera (AI se consentita, altrimenti pensiero preparato a mano) e crea la notifica in-app
//   2) invia come Web Push le notifiche in attesa ai dispositivi iscritti
// Protetta dal segreto condiviso CRON_SECRET (header x-cron-secret). Senza segreto configurato rifiuta tutto (fail-closed).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { generateFor, romeDay, romeHM } from '../_shared/ai-service.js';
import { usersDueForMorning, dispatchPush } from '../_shared/push-core.js';
import { safeEqual } from '../_shared/pin.js';
import { dailyFallback } from '../_shared/motivation.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) return json({ error: 'not_configured' }, 503);
  if (!safeEqual(req.headers.get('x-cron-secret') ?? '', secret)) return json({ error: 'unauthorized' }, 401);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const env = { GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY'), GEMINI_BASE_URL: Deno.env.get('GEMINI_BASE_URL'), GEMINI_MODEL: Deno.env.get('GEMINI_MODEL'), ANTHROPIC_API_KEY: Deno.env.get('ANTHROPIC_API_KEY'), ANTHROPIC_BASE_URL: Deno.env.get('ANTHROPIC_BASE_URL'), ANTHROPIC_MODEL: Deno.env.get('ANTHROPIC_MODEL') };
  const now = new Date();
  const report: Record<string, unknown> = {};

  try {
    // 1) motivazione del mattino
    const day = romeDay(now);
    const { data: alessias } = await sb.from('profiles').select('id').eq('role', 'alessia');
    const rows = [];
    for (const p of alessias ?? []) {
      const [{ data: st }, { data: pref }, { data: today }] = await Promise.all([
        sb.from('user_settings').select('morning_time').eq('user_id', p.id).maybeSingle(),
        sb.from('notification_preferences').select('daily_motivation').eq('user_id', p.id).maybeSingle(),
        sb.from('notifications').select('id').eq('user_id', p.id).eq('kind', 'daily').gte('created_at', `${day}T00:00:00+01:00`).limit(1),
      ]);
      rows.push({ user_id: p.id, morning_time: st?.morning_time, daily_pref: pref?.daily_motivation, has_today: Boolean(today?.length) });
    }
    let morning = 0;
    for (const uid of usersDueForMorning(rows, romeHM(now))) {
      // con l'AI spenta si usa il pensiero preparato a mano (nessuna chiamata esterna)
      const gen = await generateFor(sb, { userId: uid, kind: 'daily', env, now });
      const title = gen.ok ? gen.title : null;
      const thought = title ?? dailyFallback(now).title;
      await sb.rpc('notify', { p_user: uid, p_kind: 'daily', p_title: 'Il tuo pensiero di oggi', p_body: thought, p_link: '#/home' });
      morning++;
    }
    report.morning = morning;

    // 2) Web Push
    const pub = Deno.env.get('VAPID_PUBLIC_KEY'); const priv = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!pub || !priv) { report.push = 'not_configured'; return json({ ok: true, ...report }); }
    webpush.setVapidDetails('https://ph1llyon.github.io/ALE/', pub, priv);
    const { data: pending } = await sb.from('notifications').select('id, user_id, title, body, link, created_at').is('pushed_at', null).order('created_at').limit(100);
    const userIds = [...new Set((pending ?? []).map((n: { user_id: string }) => n.user_id))];
    const { data: subs } = userIds.length ? await sb.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds) : { data: [] };
    const byUser = new Map<string, unknown[]>();
    for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
    report.push = await dispatchPush({
      notifications: pending ?? [], subscriptionsByUser: byUser as Map<string, never[]>,
      send: (s: { endpoint: string; p256dh: string; auth: string }, payload: string) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: 'normal' }),
      markPushed: async (id: string, error: string | null) => { await sb.from('notifications').update({ pushed_at: new Date().toISOString(), push_error: error }).eq('id', id); },
      removeSubscription: async (id: string) => { await sb.from('push_subscriptions').delete().eq('id', id); },
      now,
    });
    return json({ ok: true, ...report });
  } catch (err) {
    console.error('push-dispatch error', err);
    return json({ error: 'server_error', ...report }, 500);
  }
});
