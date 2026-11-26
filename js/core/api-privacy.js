// Controllo dei propri dati: condivisione, esportazione, eliminazione account.
import { sb } from './supabase.js';
import { fail, AppError } from './api-base.js';
import { rpc } from './api.js';
import { enterProfile } from './api-access.js';

/** Categorie condivisibili, nell'ordine in cui compaiono. */
export const CATEGORIES = [
  { key: 'activities', title: 'Attività', text: 'Allenamenti, schede e sessioni.' },
  { key: 'habits', title: 'Abitudini', text: 'Le tue abitudini e i giorni in cui le hai fatte.' },
  { key: 'calendar', title: 'Calendario', text: 'Gli eventi che hai confermato.' },
  { key: 'progress', title: 'Progressi', text: 'Le piccole conquiste e gli obiettivi raggiunti.' },
  { key: 'equipment', title: 'Attrezzatura', text: 'Gli attrezzi che hai a disposizione.' },
  { key: 'wellbeing', title: 'Benessere', text: 'Solo umore ed energia. Le note restano sempre private.' },
  { key: 'journal', title: 'Diario', text: 'Solo le voci che scegli di condividere, una per una.' },
];

/** Categorie che condivido adesso (insieme di chiavi). */
export async function mySharing(userId) {
  const { data, error } = await sb.from('sharing_permissions')
    .select('category').eq('owner_id', userId).is('revoked_at', null);
  if (error) fail(error);
  return new Set(data.map((r) => r.category));
}

export const setSharing = (category, enabled) => rpc('set_sharing', { p_category: category, p_enabled: enabled });
export const revokeAllSharing = () => rpc('revoke_all_sharing');

/** Scarica i propri dati (tutte le tabelle personali) come oggetto JSON. */
export async function exportMyData() {
  const { data, error } = await sb.rpc('export_my_data');
  if (error) fail(error);
  if (!data?.ok) throw new AppError('Non riesco a preparare i tuoi dati in questo momento. Riprova tra poco.', data);
  return data;
}

/**
 * Eliminazione dell'account:
 * 1) riautenticazione con il PIN (il server richiede un accesso recente),
 * 2) rimozione dei propri file in Storage,
 * 3) eliminazione dell'account (tutto il resto segue a cascata nel database).
 */
export async function deleteMyAccount({ role, pin, userId }) {
  await enterProfile(role, pin); // errore chiaro se il PIN è sbagliato (con tentativi limitati)

  const { data: files, error: listError } = await sb.storage.from('avatars').list(userId);
  if (listError) fail(listError);
  if (files?.length) {
    const { error: rmError } = await sb.storage.from('avatars').remove(files.map((f) => `${userId}/${f.name}`));
    if (rmError) fail(rmError);
  }

  const { data, error } = await sb.rpc('delete_my_account', { p_confirm: 'ELIMINA ACCOUNT' });
  if (error) fail(error);
  if (!data?.ok) {
    const msg = data?.error === 'reauth_required'
      ? 'Per sicurezza devi aver inserito il PIN da poco: entra di nuovo con il PIN e riprova.'
      : 'L’account non è stato eliminato. Riprova tra poco.';
    throw new AppError(msg, data);
  }
  await sb.auth.signOut({ scope: 'local' });
}
