// Scelta del modello AI lato server. Con GEMINI_API_KEY si usa Gemini (Google); altrimenti, se c'è ANTHROPIC_API_KEY, Claude.
// Senza nessuna chiave l'AI non è attiva e ALE. usa il motore a regole e i messaggi preparati a mano.
// Tutto il resto della pipeline (consensi, contesto minimo, controlli strutturali e semantici, ripiego) è identico per ogni modello.
import { callGemini, DEFAULT_GEMINI_MODEL } from './gemini.js';
import { callClaude, DEFAULT_MODEL as DEFAULT_CLAUDE_MODEL } from './anthropic.js';

export const aiConfigured = (env) => Boolean(env.GEMINI_API_KEY || env.ANTHROPIC_API_KEY);
export const providerOf = (env) => (env.GEMINI_API_KEY ? 'gemini' : env.ANTHROPIC_API_KEY ? 'anthropic' : null);

/** Restituisce ({ system, user }) => Promise<string>, oppure null se nessun modello è configurato. */
export function makeCallModel(env) {
  const p = providerOf(env);
  if (p === 'gemini') return ({ system, user }) => callGemini({ apiKey: env.GEMINI_API_KEY, baseUrl: env.GEMINI_BASE_URL || undefined, model: env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL, system, user });
  if (p === 'anthropic') return ({ system, user }) => callClaude({ apiKey: env.ANTHROPIC_API_KEY, baseUrl: env.ANTHROPIC_BASE_URL || undefined, model: env.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL, system, user });
  return null;
}
