// Nucleo dell'invio programmato e delle notifiche push: PURO, con adattatori iniettati (testabile in Node).

/** Chi deve ricevere oggi la motivazione del mattino: orario raggiunto, preferenza attiva, nessuna ancora creata oggi. */
export function usersDueForMorning(rows, hm) {
  return rows
    .filter((r) => r.daily_pref !== false && !r.has_today && String(r.morning_time ?? '08:00').slice(0, 5) <= hm)
    .map((r) => r.user_id);
}

/** Payload della notifica push: solo titolo, testo breve e destinazione interna all'app. */
export function buildPayload(n) {
  const url = typeof n.link === 'string' && /^#\/[a-z0-9/_?=&.-]{0,100}$/.test(n.link) ? n.link : '#/notifiche';
  return JSON.stringify({ title: String(n.title ?? 'ALE.').slice(0, 120), body: String(n.body ?? '').slice(0, 140), url, id: n.id });
}

export const STALE_AFTER_MS = 24 * 3600 * 1000;

/**
 * Invia le notifiche in attesa ai dispositivi iscritti.
 *  - notifications: [{ id, user_id, title, body, link, created_at }]
 *  - subscriptionsByUser: Map(user_id → [{ id, endpoint, p256dh, auth }])
 *  - send(sub, payload): Promise (lancia con .statusCode in caso di errore del servizio push)
 *  - markPushed(id, error|null), removeSubscription(subId)
 * Idempotente: ogni notifica viene segnata come elaborata una sola volta; quelle vecchie non si inviano più.
 */
export async function dispatchPush({ notifications, subscriptionsByUser, send, markPushed, removeSubscription, now = new Date() }) {
  const stats = { sent: 0, failed: 0, removed: 0, skipped: 0, stale: 0 };
  for (const n of notifications) {
    if (now.getTime() - new Date(n.created_at).getTime() > STALE_AFTER_MS) { await markPushed(n.id, 'troppo vecchia'); stats.stale++; continue; }
    const subs = subscriptionsByUser.get(n.user_id) ?? [];
    if (!subs.length) { await markPushed(n.id, 'nessun dispositivo'); stats.skipped++; continue; }
    const payload = buildPayload(n);
    const errors = []; let delivered = 0;
    for (const s of subs) {
      try { await send(s, payload); delivered++; stats.sent++; }
      catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) { await removeSubscription(s.id); stats.removed++; }
        else { stats.failed++; errors.push(`${err?.statusCode ?? 'errore'}`); }
      }
    }
    await markPushed(n.id, delivered ? null : (errors.join(',') || 'dispositivo non più valido'));
  }
  return stats;
}
