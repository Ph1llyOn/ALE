// Finto server Anthropic per i test: la Edge Function lo chiama al posto di api.anthropic.com
// (ANTHROPIC_BASE_URL=http://host.docker.internal:9911 in supabase/functions/.env, solo in locale e in CI).
import { createServer } from 'node:http';

export const MOCK_PORT = 9911;
export const MOCK_KEY = 'sk-ant-test-local-key';
export const MOCK_MODEL = 'gemini-test';

export async function startMockAnthropic() {
  const requests = [];
  let handler = () => { throw new Error('nessun gestore'); };
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw); } catch { /* corpo non JSON */ }
      const gemini = /:generateContent$/.test(req.url ?? '');
      const system = String(gemini ? body.systemInstruction?.parts?.[0]?.text ?? '' : body.system ?? '');
      const entry = {
        url: req.url, method: req.method, headers: req.headers, body, gemini,
        model: gemini ? decodeURIComponent(/models\/([^:]+):/.exec(req.url)?.[1] ?? '') : body.model,
        system, user: String(gemini ? body.contents?.[0]?.parts?.[0]?.text ?? '' : body.messages?.[0]?.content ?? ''),
        isClassifier: system.includes('controllore di sicurezza'),
      };
      requests.push(entry);
      Promise.resolve().then(() => handler(entry)).then((out) => {
        if (out && out.status) { res.writeHead(out.status, { 'content-type': 'application/json' }); res.end(JSON.stringify(out.body ?? {})); return; }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(entry.gemini
          ? { candidates: [{ content: { role: 'model', parts: [{ text: String(out) }] }, finishReason: 'STOP' }] }
          : { id: 'msg_test', type: 'message', role: 'assistant', content: [{ type: 'text', text: String(out) }] }));
      }).catch((err) => {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(err.message) }));
      });
    });
  });
  await new Promise((resolve) => server.listen(MOCK_PORT, '0.0.0.0', resolve));
  return {
    requests,
    reset() { requests.length = 0; },
    respond(fn) { handler = fn; },
    generators: () => requests.filter((r) => !r.isClassifier),
    classifiers: () => requests.filter((r) => r.isClassifier),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export const OK = JSON.stringify({ allowed: true, violations: [] });
export const BLOCK = (category, reason = 'non consentito') => JSON.stringify({ allowed: false, violations: [{ category, reason }] });
export const DAILY = (over = {}) => JSON.stringify({ title: 'Con calma', text: 'Oggi puoi muoverti piano e fermarti quando vuoi: va bene così.', tone: 'dolce', ...over });
