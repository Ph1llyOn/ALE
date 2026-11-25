// Diario di Alessia: privato di default. Phill legge una voce solo se la categoria "diario" è condivisa E la voce è marcata.
import { sb } from './supabase.js';
import { fail, AppError } from './api-base.js';

const COLS = 'id, title, body, mode, prompt, shared_with_partner, created_at, updated_at';
const clean = (v) => { const t = String(v ?? '').trim(); return t === '' ? null : t; };

export async function listEntries(userId, { limit = 100 } = {}) {
  const { data, error } = await sb.from('journal_entries').select(COLS).eq('owner_id', userId).order('created_at', { ascending: false }).limit(limit);
  if (error) fail(error);
  return data;
}

export async function getEntry(id) {
  const { data, error } = await sb.from('journal_entries').select(COLS).eq('id', id).maybeSingle();
  if (error) fail(error);
  return data;
}

export async function saveEntry(userId, { id, title, body, mode, prompt, shared }) {
  const text = String(body ?? '').trim();
  if (!text) throw new AppError('Scrivi qualcosa prima di salvare.');
  const row = { title: clean(title), body: text, mode: mode === 'guided' ? 'guided' : 'free', prompt: mode === 'guided' ? clean(prompt) : null, shared_with_partner: Boolean(shared) };
  if (id) {
    const { data, error } = await sb.from('journal_entries').update(row).eq('id', id).select(COLS).single();
    if (error) fail(error);
    return data;
  }
  const { data, error } = await sb.from('journal_entries').insert({ owner_id: userId, ...row }).select(COLS).single();
  if (error) fail(error);
  return data;
}

export async function deleteEntry(id) {
  const { error } = await sb.from('journal_entries').delete().eq('id', id);
  if (error) fail(error);
}

/** Lato Phill: voci che Alessia ha scelto di condividere (la RLS restituisce righe vuote negli altri casi). */
export async function listSharedEntries(ownerId, { limit = 20 } = {}) {
  const { data, error } = await sb.from('journal_entries').select(COLS).eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(limit);
  if (error) fail(error);
  return data;
}
