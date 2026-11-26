// Assistente AI: chiamato SOLO tramite la Edge Function `ai`. La chiave del modello non esce mai dal server.
import { FUNCTIONS_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';
import { sb } from './supabase.js';
import { AppError } from './api-base.js';

async function call(body) {
  const { data: s } = await sb.auth.getSession();
  let res;
  try {
    res = await fetch(`${FUNCTIONS_URL}/ai`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json', authorization: `Bearer ${s.session?.access_token ?? ''}` },
      body: JSON.stringify(body),
    });
  } catch { throw new AppError('Non riesco a collegarmi. Controlla la connessione e riprova.'); }
  let data = {};
  try { data = await res.json(); } catch { /* corpo non JSON */ }
  if (!res.ok) throw new AppError(MESSAGES[data.error] ?? 'Qualcosa non ha funzionato. Riprova tra poco.', data);
  return data;
}

const MESSAGES = {
  ai_disabled: 'L’AI è spenta: se vuoi, puoi riaccenderla dalle Impostazioni.',
  rate_limited: 'Per oggi è tutto: riprova domani.',
  unauthenticated: 'Per continuare devi entrare di nuovo.',
};

/** Stato del servizio: { configured: bool } (false = chiave non ancora impostata sul server). */
export const aiStatus = () => call({ action: 'status' });
/** Motivazione del giorno (una al giorno). Restituisce { source: 'ai' | 'fallback', title, text, tone }. */
export const aiDaily = () => call({ action: 'generate', kind: 'daily' });
/** Una scheda di esercizi scelti SOLO dal catalogo, compatibile con attrezzatura e indicazioni. */
export const aiPlan = () => call({ action: 'generate', kind: 'plan' });
/** Una breve riflessione sui progressi recenti, senza giudizi. */
export const aiReflection = () => call({ action: 'generate', kind: 'reflection' });
/** Idee di promemoria gentili (mai insistenti). */
export const aiReminders = () => call({ action: 'generate', kind: 'reminders' });
