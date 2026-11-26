// Assistente AI: chiamato SOLO tramite la Edge Function `ai`. La chiave del modello non esce mai dal server.
import { FUNCTIONS_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';
import { sb } from './supabase.js';
import { AppError } from './api-base.js';

async function call(body, { timeoutMs = 30_000 } = {}) {
  const { data: s } = await sb.auth.getSession();
  let res;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    res = await fetch(`${FUNCTIONS_URL}/ai`, {
      signal: controller.signal,
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json', authorization: `Bearer ${s.session?.access_token ?? ''}` },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new AppError(err?.name === 'AbortError' ? 'L’assistente ci sta mettendo troppo: riprova tra poco.' : 'Non riesco a collegarmi. Controlla la connessione e riprova.');
  } finally { clearTimeout(timer); }
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
// Il pensiero del giorno non deve mai rallentare la Home: oltre 6 secondi si mostra quello preparato a mano (il server finisce comunque e lo salva per dopo).
export const aiDaily = () => call({ action: 'generate', kind: 'daily' }, { timeoutMs: 6000 });
/** Una scheda di esercizi scelti SOLO dal catalogo, compatibile con attrezzatura e indicazioni. */
export const aiPlan = () => call({ action: 'generate', kind: 'plan' });
/** Una breve riflessione sui progressi recenti, senza giudizi. */
export const aiReflection = () => call({ action: 'generate', kind: 'reflection' });
/** Idee di promemoria gentili (mai insistenti). */
export const aiReminders = () => call({ action: 'generate', kind: 'reminders' });
