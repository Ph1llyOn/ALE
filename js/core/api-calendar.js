// Calendario di Alessia. Phill può solo PROPORRE eventi (status 'proposed'): decide sempre lei.
import { sb } from './supabase.js';
import { fail } from './api-base.js';

const clean = (v) => { const t = String(v ?? '').trim(); return t === '' ? null : t; };
const COLS = 'id, owner_id, created_by, title, category, starts_at, ends_at, all_day, status, completed, notes';

/** Eventi di Alessia (propri e proposti) nell'intervallo [from, to). */
export async function listEvents(ownerId, from, to) {
  const { data, error } = await sb.from('calendar_events').select(COLS)
    .eq('owner_id', ownerId).gte('starts_at', from).lt('starts_at', to).order('starts_at', { ascending: true });
  if (error) fail(error);
  return data;
}

export async function listProposedEvents(ownerId) {
  const { data, error } = await sb.from('calendar_events').select(COLS)
    .eq('owner_id', ownerId).eq('status', 'proposed').order('starts_at', { ascending: true });
  if (error) fail(error);
  return data;
}

export async function createEvent(userId, { title, category, startsAt, endsAt, allDay, notes }) {
  const { data, error } = await sb.from('calendar_events').insert({
    owner_id: userId, created_by: userId, title: title.trim(), category, starts_at: startsAt, ends_at: endsAt || null,
    all_day: Boolean(allDay), notes: clean(notes), status: 'confirmed',
  }).select(COLS).single();
  if (error) fail(error);
  return data;
}

export async function updateEvent(id, { title, category, startsAt, endsAt, allDay, notes }) {
  const { data, error } = await sb.from('calendar_events').update({
    title: title.trim(), category, starts_at: startsAt, ends_at: endsAt || null, all_day: Boolean(allDay), notes: clean(notes),
  }).eq('id', id).select(COLS).single();
  if (error) fail(error);
  return data;
}

export async function setEventCompleted(id, completed) {
  const { error } = await sb.from('calendar_events').update({ completed }).eq('id', id);
  if (error) fail(error);
}

export async function decideEvent(id, status) {
  const { error } = await sb.from('calendar_events').update({ status }).eq('id', id);
  if (error) fail(error);
}

export async function deleteEvent(id) {
  const { error } = await sb.from('calendar_events').delete().eq('id', id);
  if (error) fail(error);
}

// --- lato Phill ---------------------------------------------------------------------------
/** Eventi che ho proposto ad Alessia (stato 'proposed' o 'declined': dopo l'approvazione decide la sua condivisione). */
export async function listMyProposedEvents(userId) {
  const { data, error } = await sb.from('calendar_events').select(COLS).eq('created_by', userId).neq('owner_id', userId).order('starts_at', { ascending: false }).limit(50);
  if (error) fail(error);
  return data;
}

export async function proposeEvent(userId, ownerId, { title, category, startsAt, endsAt, allDay, notes }) {
  const { error } = await sb.from('calendar_events').insert({
    owner_id: ownerId, created_by: userId, title: title.trim(), category, starts_at: startsAt, ends_at: endsAt || null,
    all_day: Boolean(allDay), notes: clean(notes), status: 'proposed',
  });
  if (error) fail(error);
}

export async function withdrawProposal(id) {
  const { error } = await sb.from('calendar_events').delete().eq('id', id);
  if (error) fail(error);
}

/** Eventi confermati che Alessia condivide (la RLS decide: righe vuote se non condivide il calendario). */
export async function listSharedEvents(ownerId, from, to) {
  const { data, error } = await sb.from('calendar_events').select(COLS).eq('owner_id', ownerId).eq('status', 'confirmed')
    .gte('starts_at', from).lt('starts_at', to).order('starts_at', { ascending: true });
  if (error) fail(error);
  return data;
}
