// Dati del partner visibili a Phill: SOLO ciò che Alessia ha condiviso. La RLS restituisce righe vuote per il resto,
// quindi queste funzioni non "filtrano" nulla da sole: leggono e il database decide.
import { sb } from './supabase.js';
import { fail } from './api-base.js';

/** Categorie che il partner ha condiviso con me. */
export async function sharedWithMe(ownerId, myId) {
  const { data, error } = await sb.from('sharing_permissions')
    .select('category').eq('owner_id', ownerId).eq('grantee_id', myId).is('revoked_at', null);
  if (error) fail(error);
  return new Set(data.map((r) => r.category));
}

export async function sharedWellbeing(ownerId, fromDay) {
  const { data, error } = await sb.from('wellbeing_logs')
    .select('day, mood, energy').eq('owner_id', ownerId).gte('day', fromDay).order('day', { ascending: false });
  if (error) fail(error);
  return data;
}

export async function sharedProgress(ownerId, limit = 10) {
  const { data, error } = await sb.from('progress_records')
    .select('id, kind, title, achieved_on').eq('owner_id', ownerId).order('achieved_on', { ascending: false }).limit(limit);
  if (error) fail(error);
  return data;
}

export async function sharedEquipment(ownerId) {
  const { data, error } = await sb.from('equipment')
    .select('id, name, notes, avoid').eq('owner_id', ownerId).order('created_at', { ascending: true });
  if (error) fail(error);
  return data;
}
