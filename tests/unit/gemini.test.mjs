import test from 'node:test';
import assert from 'node:assert/strict';
import { callGemini, DEFAULT_GEMINI_MODEL } from '../../supabase/functions/_shared/gemini.js';
import { aiConfigured, providerOf, makeCallModel } from '../../supabase/functions/_shared/llm.js';

const ok = (parts) => new Response(JSON.stringify({ candidates: [{ content: { parts } }] }), { status: 200 });

test('callGemini: richiesta corretta, chiave solo nell\'intestazione, testo senza i pensieri del modello', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return ok([{ text: 'ragionamento', thought: true }, { text: '{"a":' }, { text: '1}' }]); };
  const out = await callGemini({ apiKey: 'AQ.TEST-SEGRETA', baseUrl: 'http://mock.local/', model: 'gemini-x', system: 'sys', user: 'utente', fetchImpl });
  assert.equal(out, '{"a":1}');
  assert.equal(seen.url, 'http://mock.local/v1beta/models/gemini-x:generateContent');
  assert.equal(seen.init.headers['x-goog-api-key'], 'AQ.TEST-SEGRETA');
  assert.ok(!seen.url.includes('TEST-SEGRETA') && !seen.init.body.includes('TEST-SEGRETA'), 'la chiave non è né nell\'URL né nel corpo');
  const body = JSON.parse(seen.init.body);
  assert.equal(body.systemInstruction.parts[0].text, 'sys');
  assert.equal(body.contents[0].parts[0].text, 'utente');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.ok(body.generationConfig.maxOutputTokens > 600, 'margine per i token di ragionamento');
  assert.ok(DEFAULT_GEMINI_MODEL.startsWith('gemini-'));
});

test('callGemini: errori chiari e mai con la chiave dentro', async () => {
  const key = 'AQ.TEST-SEGRETA';
  const msgs = [];
  for (const impl of [
    async () => new Response('x', { status: 403 }),
    async () => new Response('x', { status: 503 }),
    async () => ok([]),
    async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 }),
    async () => new Response('non json', { status: 200 }),
    async () => { throw Object.assign(new Error(`boom ${key}`), { name: 'TypeError' }); },
    async (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' })))),
  ]) {
    try { await callGemini({ apiKey: key, system: 's', user: 'u', fetchImpl: impl, timeoutMs: 30 }); msgs.push('NESSUN ERRORE'); } catch (e) { msgs.push(e.message); }
  }
  assert.ok(msgs.every((m) => m !== 'NESSUN ERRORE' && !m.includes(key)));
  assert.match(msgs[0], /403/);
  assert.match(msgs[3], /bloccata/);
  assert.match(msgs[6], /timeout/);
  await assert.rejects(callGemini({ apiKey: '', system: 's', user: 'u' }), /non configurata/);
});

test('scelta del modello: Gemini se c\'è la chiave, altrimenti Claude, altrimenti nessuna AI (motore a regole)', () => {
  assert.equal(aiConfigured({}), false);
  assert.equal(makeCallModel({}), null);
  assert.equal(providerOf({ ANTHROPIC_API_KEY: 'x' }), 'anthropic');
  assert.equal(providerOf({ GEMINI_API_KEY: 'x' }), 'gemini');
  assert.equal(providerOf({ GEMINI_API_KEY: 'x', ANTHROPIC_API_KEY: 'y' }), 'gemini');
  assert.equal(aiConfigured({ GEMINI_API_KEY: 'x' }), true);
  assert.equal(typeof makeCallModel({ GEMINI_API_KEY: 'x' }), 'function');
});
