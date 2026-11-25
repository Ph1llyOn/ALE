// Dati personali di Alessia: benessere, progressi, attrezzatura. Tutto persistente su Supabase, protetto da RLS.
import { sb } from './supabase.js';
import { fail } from './api-base.js';
import { isScale } from './moods.js';

// --- Benessere --------------------------------------------------------------
/** Registri da `fromDay` ("YYYY-MM-DD") in poi, più recenti per primi, con la nota (privata) se c'è. */
export async function listWellbeing(userId, fromDay) {
  const { data, error } = await sb.from('wellbeing_logs')
    .select('id, day, mood, energy, wellbeing_notes(note)')
    .eq('owner_id', userId).gte('day', fromDay).order('day', { ascending: false });
  if (error) fail(error);
  return data.map(({ wellbeing_notes, ...l }) => ({
    ...l, note: (Array.isArray(wellbeing_notes) ? wellbeing_notes[0]?.note : wellbeing_notes?.note) ?? '',
  }));
}

/** Crea o aggiorna il registro di un giorno; la nota facoltativa vive in una tabella separata (mai condivisibile). */
export async function saveWellbeing(userId, { day, mood, energy, note }) {
  if (!isScale(mood) || !isScale(energy)) throw new Error('Scegli un valore da 1 a 5.');
  const { data: log, error } = await sb.from('wellbeing_logs')
    .upsert({ owner_id: userId, day, mood, energy }, { onConflict: 'owner_id,day' }).select('id').single();
  if (error) fail(error);
  const text = String(note ?? '').trim();
  if (text) {
    const { error: e2 } = await sb.from('wellbeing_notes').upsert({ log_id: log.id, owner_id: userId, note: text }, { onConflict: 'log_id' });
    if (e2) fail(e2);
  } else {
    const { error: e3 } = await sb.from('wellbeing_notes').delete().eq('log_id', log.id);
    if (e3) fail(e3);
  }
  return log.id;
}

export async function deleteWellbeing(logId) {
  const { error } = await sb.from('wellbeing_logs').delete().eq('id', logId);
  if (error) fail(error);
}

// --- Progressi --------------------------------------------------------------
export async function listProgress(ownerId, { limit = 30 } = {}) {
  const { data, error } = await sb.from('progress_records')
    .select('id, kind, title, achieved_on').eq('owner_id', ownerId).order('achieved_on', { ascending: false }).limit(limit);
  if (error) fail(error);
  return data;
}

// --- Attrezzatura -----------------------------------------------------------
export async function listEquipment(ownerId) {
  const { data, error } = await sb.from('equipment')
    .select('id, name, notes, avoid, created_at').eq('owner_id', ownerId).order('created_at', { ascending: true });
  if (error) fail(error);
  return data;
}

export async function addEquipment(ownerId, { name, notes, avoid }) {
  const { data, error } = await sb.from('equipment')
    .insert({ owner_id: ownerId, name: name.trim(), notes: String(notes ?? '').trim() || null, avoid: Boolean(avoid) }).select().single();
  if (error) fail(error);
  return data;
}

export async function updateEquipment(id, { name, notes, avoid }) {
  const { data, error } = await sb.from('equipment')
    .update({ name: name.trim(), notes: String(notes ?? '').trim() || null, avoid: Boolean(avoid) }).eq('id', id).select().single();
  if (error) fail(error);
  return data;
}

export async function removeEquipment(id) {
  const { error } = await sb.from('equipment').delete().eq('id', id);
  if (error) fail(error);
}
