// Client minimale per l'API Gemini di Google (generateContent). Usato SOLO dal server (Edge Functions): la chiave non esce mai da qui.
// La chiave viaggia nell'intestazione x-goog-api-key, mai nell'URL (così non finisce nei log).
export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

/**
 * Chiama POST {baseUrl}/v1beta/models/{model}:generateContent e restituisce il testo della risposta.
 * Le risposte sono sempre JSON (i prompt di ALE. chiedono uno schema): si chiede il tipo JSON al modello.
 * Errori: lancia Error con messaggio breve (senza mai includere la chiave).
 */
export async function callGemini({ apiKey, baseUrl = 'https://generativelanguage.googleapis.com', model = DEFAULT_GEMINI_MODEL, system, user, maxTokens = 600, timeoutMs = 15_000, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('chiave Gemini non configurata');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        // il margine in più serve ai modelli che "ragionano" prima di rispondere: quei token contano nel limite
        generationConfig: { maxOutputTokens: maxTokens + 1500, temperature: 0.7, responseMimeType: 'application/json' },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new Error(err?.name === 'AbortError' ? 'timeout della richiesta al modello' : 'rete non raggiungibile');
  } finally { clearTimeout(timer); }
  if (!res.ok) throw new Error(`errore del modello (${res.status})`);
  let body;
  try { body = await res.json(); } catch { throw new Error('risposta del modello non leggibile'); }
  if (body?.promptFeedback?.blockReason) throw new Error('richiesta bloccata dal modello');
  const parts = body?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p) => typeof p?.text === 'string' && !p.thought).map((p) => p.text).join('');
  if (!text) throw new Error('risposta del modello vuota');
  return text;
}
