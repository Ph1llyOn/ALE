// Servizio AI lato server: carica SOLO i dati autorizzati, applica consensi e limiti, chiama Claude (se la chiave c'è),
// registra ogni generazione. Riceve il client Supabase con service role come argomento: nessuna dipendenza npm qui.
import { buildContext, runGeneration, fallbackFor, KINDS } from './ai-core.js';
import { callClaude, DEFAULT_MODEL } from './anthropic.js';

export const DAILY_LIMIT = 12;   // generazioni (compresi i tentativi scartati) per persona nelle ultime 24 ore

const TZ = 'Europe/Rome';
export const romeDay = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d);
export const romeHour = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(d));
export const romeHM = (d = new Date()) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
const daysAgo = (n, d = new Date()) => romeDay(new Date(d.getTime() - n * 864e5));

export const aiConfigured = (env) => Boolean(env.ANTHROPIC_API_KEY);

/** Legge dal database SOLO ciò che le preferenze consentono. Restituisce { profile, prefs, ctx }. */
export async function loadAiContext(sb, userId, now = new Date()) {
  const [{ data: profile }, { data: prefs }, { data: settings }] = await Promise.all([
    sb.from('profiles').select('id, role, display_name').eq('id', userId).maybeSingle(),
    sb.from('ai_preferences').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('user_settings').select('spaces, limitations, professional_notes, prefers_no_equipment, fitness_level, session_minutes, avoid_flags, preferences').eq('user_id', userId).maybeSingle(),
  ]);
  if (!profile) return { profile: null, prefs: null, ctx: null };
  const consents = {
    use_equipment: Boolean(prefs?.ai_enabled && prefs.use_equipment), use_wellbeing: Boolean(prefs?.ai_enabled && prefs.use_wellbeing),
    use_journal: Boolean(prefs?.ai_enabled && prefs.use_journal), reminders_enabled: Boolean(prefs?.ai_enabled && prefs.reminders_enabled),
  };
  const from7 = daysAgo(7, now); const from30 = daysAgo(30, now);
  const [eq, wb, jr, sessions, habitLogs, goals, wbCount, hist, fbk] = await Promise.all([
    consents.use_equipment ? sb.from('equipment').select('name, avoid').eq('owner_id', userId) : { data: [] },
    consents.use_wellbeing ? sb.from('wellbeing_logs').select('day, mood, energy').eq('owner_id', userId).gte('day', from7).order('day') : { data: [] },
    consents.use_journal ? sb.from('journal_entries').select('title, body').eq('owner_id', userId).order('created_at', { ascending: false }).limit(3) : { data: [] },
    sb.from('workout_sessions').select('id', { count: 'exact', head: true }).eq('owner_id', userId).eq('status', 'completed').gte('started_at', `${from7}T00:00:00Z`),
    sb.from('habit_logs').select('day').eq('owner_id', userId).eq('done', true).gte('day', from7),
    sb.from('goals').select('id', { count: 'exact', head: true }).eq('owner_id', userId).eq('status', 'done').gte('completed_at', `${from30}T00:00:00Z`),
    sb.from('wellbeing_logs').select('id', { count: 'exact', head: true }).eq('owner_id', userId).gte('day', from7),
    // storico e feedback servono SOLO alle regole deterministiche del server (adattamento, recupero, dolore): non finiscono mai nel testo per il modello
    sb.from('workout_sessions').select('started_at, plan, session_exercise_progress(exercise_key, sets_done)').eq('owner_id', userId).in('status', ['completed', 'stopped']).gte('started_at', `${daysAgo(90, now)}T00:00:00Z`).limit(200),
    sb.from('exercise_feedback').select('exercise_key, rating, created_at').eq('owner_id', userId).gte('created_at', `${daysAgo(90, now)}T00:00:00Z`),
  ]);
  const history = [];
  for (const row of hist.data ?? []) {
    const items = new Map((row.plan?.items ?? []).map((i) => [i.exercise_key, i]));
    for (const p of row.session_exercise_progress ?? []) {
      if (!p.exercise_key || !(p.sets_done > 0)) continue;
      const it = items.get(p.exercise_key);
      history.push({ day: romeDay(new Date(row.started_at)), key: p.exercise_key, setsDone: p.sets_done, seconds: it?.mode === 'time' ? it.seconds * p.sets_done : null });
    }
  }
  const feedback = (fbk.data ?? []).map((f) => ({ key: f.exercise_key, rating: f.rating, day: romeDay(new Date(f.created_at)) }));
  const ctx = buildContext({
    firstName: profile.display_name, hour: romeHour(now), consents,
    equipment: eq.data ?? [], wellbeing: wb.data ?? [], journal: jr.data ?? [],
    professionalNotes: settings?.professional_notes, spaces: settings?.spaces, limitations: settings?.limitations, prefersNoEquipment: settings?.prefers_no_equipment,
    training: { level: settings?.fitness_level, minutes: settings?.session_minutes, avoidFlags: settings?.avoid_flags ?? [], prefs: settings?.preferences ?? {}, history, feedback, today: romeDay(now), seed: now.getDate() + now.getMonth() * 31 },
    stats: { sessions7: sessions.count ?? 0, habitDays7: new Set((habitLogs.data ?? []).map((l) => l.day)).size, goalsDone30: goals.count ?? 0, wellbeingDays7: wbCount.count ?? 0 },
  });
  return { profile, prefs, ctx };
}

const shape = (kind, source, value) => ({ ok: true, kind, source, ...value });

/**
 * Genera (o restituisce quella già fatta oggi, per la motivazione) un contenuto per l'utente.
 * Errori "attesi" come { ok:false, error }: ai_disabled | rate_limited | wrong_role | no_profile.
 */
export async function generateFor(sb, { userId, kind, env, now = new Date(), callModelImpl = null }) {
  if (!KINDS.includes(kind)) return { ok: false, error: 'bad_kind' };
  const { profile, prefs, ctx } = await loadAiContext(sb, userId, now);
  if (!profile) return { ok: false, error: 'no_profile' };
  if (profile.role !== 'alessia') return { ok: false, error: 'wrong_role' };
  if (!prefs?.ai_enabled) return { ok: false, error: 'ai_disabled' };

  const day = romeDay(now);
  if (kind === 'daily') {
    const { data: cached } = await sb.from('ai_generations').select('output').eq('user_id', userId).eq('kind', 'daily').eq('for_day', day).eq('status', 'ok').maybeSingle();
    if (cached?.output?.value) return shape('daily', cached.output.source, cached.output.value);
  }
  const since = new Date(now.getTime() - 864e5).toISOString();
  const { count } = await sb.from('ai_generations').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since);
  if ((count ?? 0) >= DAILY_LIMIT) return { ok: false, error: 'rate_limited' };

  let result;
  const callModel = callModelImpl ?? (aiConfigured(env)
    ? ({ system, user }) => callClaude({ apiKey: env.ANTHROPIC_API_KEY, baseUrl: env.ANTHROPIC_BASE_URL || undefined, model: env.ANTHROPIC_MODEL || DEFAULT_MODEL, system, user })
    : null);
  if (callModel) result = await runGeneration({ kind, ctx, callModel, now });
  else result = { source: 'fallback', value: fallbackFor(kind, ctx, now), rejections: [{ stage: 'not_configured', reason: 'chiave Anthropic non impostata' }] };

  // archivio: i tentativi scartati senza il testo, quello finale con il testo
  for (const r of result.rejections.slice(0, 3)) {
    await sb.from('ai_generations').insert({ user_id: userId, kind, status: 'rejected', output: { stage: r.stage, reason: r.reason } });
  }
  const { error } = await sb.from('ai_generations').insert({ user_id: userId, kind, status: 'ok', output: { source: result.source, value: result.value }, for_day: kind === 'daily' ? day : null });
  if (error && error.code === '23505') {   // corsa con un'altra richiesta: vince la prima
    const { data: again } = await sb.from('ai_generations').select('output').eq('user_id', userId).eq('kind', 'daily').eq('for_day', day).eq('status', 'ok').maybeSingle();
    if (again?.output?.value) return shape('daily', again.output.source, again.output.value);
  }
  return shape(kind, result.source, result.value);
}

export const ERROR_STATUS = { ai_disabled: 403, rate_limited: 429, wrong_role: 403, no_profile: 404, bad_kind: 400 };
