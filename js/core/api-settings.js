// Impostazioni personali (private), preferenze di notifica e consensi AI.
// Si usa "aggiorna, altrimenti inserisci" e non l'upsert: l'upsert riscriverebbe la chiave (user_id), che non è modificabile.
import { sb } from './supabase.js';
import { fail } from './api-base.js';

const clean = (v) => { const t = String(v ?? '').trim(); return t === '' ? null : t; };

async function saveByUser(table, userId, patch) {
  const { data, error } = await sb.from(table).update(patch).eq('user_id', userId).select('user_id');
  if (error) fail(error);
  if (data.length) return;
  const { error: e2 } = await sb.from(table).insert({ user_id: userId, ...patch });
  if (e2) fail(e2);
}

// --- Impostazioni personali -------------------------------------------------------------
export const DEFAULT_SETTINGS = {
  onboarding_steps: {}, onboarding_done_at: null, spaces: '', prefers_no_equipment: false, limitations: '', professional_notes: '', morning_time: '08:00',
};

export async function getSettings(userId) {
  const { data, error } = await sb.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
  if (error) fail(error);
  const s = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
  s.spaces = s.spaces ?? ''; s.limitations = s.limitations ?? ''; s.professional_notes = s.professional_notes ?? '';
  s.morning_time = String(s.morning_time).slice(0, 5);
  return s;
}

export async function saveSettings(userId, { spaces, prefers_no_equipment, limitations, professional_notes, morning_time }) {
  const patch = {};
  if (spaces !== undefined) patch.spaces = clean(spaces);
  if (prefers_no_equipment !== undefined) patch.prefers_no_equipment = Boolean(prefers_no_equipment);
  if (limitations !== undefined) patch.limitations = clean(limitations);
  if (professional_notes !== undefined) patch.professional_notes = clean(professional_notes);
  if (morning_time !== undefined) patch.morning_time = morning_time;
  await saveByUser('user_settings', userId, patch);
}

/** Segna un passo dell'onboarding come 'done' o 'skipped' (si può sempre riprendere dal Profilo). */
export async function setOnboardingStep(userId, step, state) {
  const s = await getSettings(userId);
  await saveByUser('user_settings', userId, { onboarding_steps: { ...s.onboarding_steps, [step]: state } });
}

export async function finishOnboarding(userId) {
  await saveByUser('user_settings', userId, { onboarding_done_at: new Date().toISOString() });
}

export async function reopenOnboarding(userId) {
  await saveByUser('user_settings', userId, { onboarding_done_at: null, onboarding_steps: {} });
}

// --- Notifiche -----------------------------------------------------------------------------
export const DEFAULT_NOTIF = { messages: true, daily_motivation: true, proposals: true, reminders: true };

export async function getNotificationPrefs(userId) {
  const { data, error } = await sb.from('notification_preferences').select('messages, daily_motivation, proposals, reminders').eq('user_id', userId).maybeSingle();
  if (error) fail(error);
  return { ...DEFAULT_NOTIF, ...(data ?? {}) };
}

export const saveNotificationPrefs = (userId, patch) => saveByUser('notification_preferences', userId, patch);

export async function listNotifications(userId, { limit = 50 } = {}) {
  const { data, error } = await sb.from('notifications').select('id, kind, title, body, link, created_at, read_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  if (error) fail(error);
  return data;
}

export async function unreadCount(userId) {
  const { count, error } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null);
  if (error) fail(error);
  return count ?? 0;
}

export async function markNotificationsRead(ids) {
  if (!ids.length) return;
  const { error } = await sb.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
  if (error) fail(error);
}

// --- Consensi AI -------------------------------------------------------------------------------
export const DEFAULT_AI = { ai_enabled: false, use_journal: false, use_wellbeing: false, use_equipment: false, reminders_enabled: false, consent_at: null };

export async function getAiPrefs(userId) {
  const { data, error } = await sb.from('ai_preferences').select('*').eq('user_id', userId).maybeSingle();
  if (error) fail(error);
  return { ...DEFAULT_AI, ...(data ?? {}) };
}

export const saveAiPrefs = (userId, patch) => saveByUser('ai_preferences', userId, patch);
