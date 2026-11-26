// Client minimale per l'API Messages di Anthropic. Usato SOLO dal server (Edge Functions): la chiave non esce mai da qui.
export const DEFAULT_MODEL = 'claude-haiku-5-5';
export const API_VERSION = '2023-06-01';

/**
 * Chiama POST {baseUrl}/v1/messages e restituisce il testo della risposta.
 * Errori: lancia Error con messaggio breve (senza mai includere la chiave).
 */
export async function callClaude({ apiKey, baseUrl = 'https://api.anthropic.com', model = DEFAULT_MODEL, system, user, maxTokens = 600, timeoutMs = 20_000, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('chiave Anthropic non configurata');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(err?.name === 'AbortError' ? 'timeout della richiesta al modello' : 'rete non raggiungibile');
  } finally { clearTimeout(timer); }
  if (!res.ok) throw new Error(`errore del modello (${res.status})`);
  let body;
  try { body = await res.json(); } catch { throw new Error('risposta del modello non leggibile'); }
  const text = (body?.content ?? []).filter((b) => b?.type === 'text').map((b) => b.text).join('');
  if (!text) throw new Error('risposta del modello vuota');
  return text;
}
