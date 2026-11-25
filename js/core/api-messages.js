// Biglietti (messaggi) tra Phill e Alessia.
// Privacy: lo stato di lettura/archivio è di chi riceve (tabella message_receipts) e non è visibile a chi scrive.
import { sb } from './supabase.js';
import { fail } from './api-base.js';

const clean = (v) => { const t = String(v ?? '').trim(); return t === '' ? null : t; };

// --- Alessia (destinataria) -------------------------------------------------
/** Biglietti ricevuti, dal più recente. Ogni elemento ha .receipt = { read_at, archived_at } | null. */
export async function listInbox(userId, { limit = 100 } = {}) {
  const { data, error } = await sb.from('messages')
    .select('id, title, body, sent_at, edited_at, sender_id, message_receipts(read_at, archived_at)')
    .eq('recipient_id', userId).order('sent_at', { ascending: false }).limit(limit);
  if (error) fail(error);
  return data.map(({ message_receipts, ...m }) => ({
    ...m, receipt: Array.isArray(message_receipts) ? (message_receipts[0] ?? null) : (message_receipts ?? null),
  }));
}

export const isUnread = (m) => !m.receipt?.read_at;
export const isArchived = (m) => Boolean(m.receipt?.archived_at);

/** Segna come letti i biglietti indicati (solo la ricevuta di chi riceve: il mittente non lo vede). */
export async function markRead(userId, messages) {
  const now = new Date().toISOString();
  const noReceipt = messages.filter((m) => !m.receipt);
  const unread = messages.filter((m) => m.receipt && !m.receipt.read_at);
  if (noReceipt.length) {
    const { error } = await sb.from('message_receipts')
      .insert(noReceipt.map((m) => ({ message_id: m.id, recipient_id: userId, read_at: now })));
    if (error) fail(error);
  }
  for (const m of unread) {
    const { error } = await sb.from('message_receipts').update({ read_at: now }).eq('message_id', m.id);
    if (error) fail(error);
  }
}

/** Nasconde (true) o ripristina (false) un biglietto dalla vista di chi riceve. La cronologia di chi scrive non cambia. */
export async function setArchived(userId, messageId, archived) {
  const value = archived ? new Date().toISOString() : null;
  // Prima si aggiorna la ricevuta esistente (solo archived_at: message_id e recipient_id non sono modificabili),
  // altrimenti la si crea. Un upsert riscriverebbe anche le colonne protette.
  const { data, error } = await sb.from('message_receipts').update({ archived_at: value }).eq('message_id', messageId).select('message_id');
  if (error) fail(error);
  if (data.length) return;
  const { error: e2 } = await sb.from('message_receipts').insert({ message_id: messageId, recipient_id: userId, archived_at: value });
  if (e2) fail(e2);
}

// --- Phill (mittente) -------------------------------------------------------
export async function listSent(userId, { limit = 100 } = {}) {
  const { data, error } = await sb.from('messages')
    .select('id, title, body, sent_at, edited_at, recipient_id')
    .eq('sender_id', userId).order('sent_at', { ascending: false }).limit(limit);
  if (error) fail(error);
  return data;
}

export async function listScheduled(userId) {
  const { data, error } = await sb.from('scheduled_messages')
    .select('id, title, body, send_at, status, attempts, last_error, recipient_id')
    .eq('sender_id', userId).neq('status', 'sent').order('send_at', { ascending: true });
  if (error) fail(error);
  return data;
}

export async function sendNow({ senderId, recipientId, title, body }) {
  const { data, error } = await sb.from('messages')
    .insert({ sender_id: senderId, recipient_id: recipientId, title: clean(title), body: String(body).trim() }).select().single();
  if (error) fail(error);
  return data;
}

export async function schedule({ senderId, recipientId, title, body, sendAtIso }) {
  const { data, error } = await sb.from('scheduled_messages')
    .insert({ sender_id: senderId, recipient_id: recipientId, title: clean(title), body: String(body).trim(), send_at: sendAtIso }).select().single();
  if (error) fail(error);
  return data;
}

export async function updateScheduled(id, { title, body, sendAtIso }) {
  const { data, error } = await sb.from('scheduled_messages')
    .update({ title: clean(title), body: String(body).trim(), send_at: sendAtIso }).eq('id', id).select().single();
  if (error) fail(error);
  return data;
}

export async function cancelScheduled(id) {
  const { error } = await sb.from('scheduled_messages').update({ status: 'cancelled' }).eq('id', id);
  if (error) fail(error);
}

export async function deleteScheduled(id) {
  const { error } = await sb.from('scheduled_messages').delete().eq('id', id);
  if (error) fail(error);
}
