// Integrazione reale: Edge Function `ai` (con un finto server Anthropic), consensi, privacy dei prompt, blocco semantico, limiti.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, cleanup, adminClient, callFunction } from './helpers.mjs';
import { startMockAnthropic, MOCK_KEY, MOCK_MODEL, OK, BLOCK, DAILY } from './mock-anthropic.mjs';

let mock; let ale; let phill;
const token = (u) => u.client.auth.getSession().then((s) => s.data.session.access_token);
const STRUCT = (...mains) => ['march', 'hip-circles', ...mains, 'deep-breathing'];
const gen = async (u, kind) => callFunction('ai', { action: 'generate', kind }, { jwt: await token(u) });
const enable = (u, extra = {}) => u.client.from('ai_preferences').upsert({ user_id: u.id, ai_enabled: true, ...extra }, { onConflict: 'user_id' }).then((r) => { if (r.error) throw r.error; });
// upsert non è consentito sulla chiave: si usa aggiorna-o-inserisci
async function setPrefs(u, prefs) {
  const upd = await u.client.from('ai_preferences').update(prefs).eq('user_id', u.id).select();
  if (upd.error) throw upd.error;
  if (!upd.data.length) { const ins = await u.client.from('ai_preferences').insert({ user_id: u.id, ...prefs }); if (ins.error) throw ins.error; }
}
const resetGenerations = () => adminClient().from('ai_generations').delete().eq('user_id', ale.id);

before(async () => {
  mock = await startMockAnthropic();
  ale = await makeUser('alessia', 'Alessia');
  phill = await makeUser('phill', 'Phill');
});
after(async () => { await mock.close(); await cleanup(); });
beforeEach(async () => { mock.reset(); mock.respond((r) => (r.isClassifier ? OK : DAILY())); await resetGenerations(); });

test('accesso: senza sessione o con credenziali false la funzione rifiuta', async () => {
  assert.equal((await callFunction('ai', { action: 'status' })).status, 401);
  assert.equal((await callFunction('ai', { action: 'status' }, { jwt: 'non-un-jwt' })).status, 401);
  const forged = (await token(ale)).split('.'); forged[2] = 'x'.repeat(43);
  assert.equal((await callFunction('ai', { action: 'status' }, { jwt: forged.join('.') })).status, 401);
  assert.equal((await callFunction('ai', { action: 'generate', kind: 'daily' })).status, 401);
});

test('stato: riporta se la chiave è configurata e se Alessia ha dato il consenso', async () => {
  await setPrefs(ale, { ai_enabled: false });
  const r = await callFunction('ai', { action: 'status' }, { jwt: await token(ale) });
  assert.deepEqual(r.body, { configured: true, enabled: false });
});

test('CONSENSO: con l\'AI disattivata non viene generato nulla e il modello non viene mai chiamato', async () => {
  await setPrefs(ale, { ai_enabled: false });
  const r = await gen(ale, 'daily');
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'ai_disabled');
  assert.equal(mock.requests.length, 0, 'nessuna chiamata a Anthropic senza consenso');
  assert.equal((await adminClient().from('ai_generations').select('id').eq('user_id', ale.id)).data.length, 0);
});

test('ruolo: solo Alessia usa l\'AI', async () => {
  await setPrefs(phill, { ai_enabled: true });
  const r = await gen(phill, 'daily');
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'wrong_role');
  assert.equal(mock.requests.length, 0);
});

test('motivazione del giorno: generata da Claude, richiesta corretta, una sola al giorno', async () => {
  await setPrefs(ale, { ai_enabled: true, use_equipment: false, use_wellbeing: false, use_journal: false });
  await ale.client.from('equipment').insert({ owner_id: ale.id, name: 'Manubri segreti' });
  mock.respond((r) => (r.isClassifier ? OK : DAILY({ title: 'Un passo piccolo', text: 'Oggi scegli una cosa gentile per te e falla con calma.' })));
  const r = await gen(ale, 'daily');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.source, 'ai');
  assert.equal(r.body.title, 'Un passo piccolo');
  assert.ok(!JSON.stringify(r.body).includes(MOCK_KEY), 'la chiave non esce mai dal server');
  assert.ok(![...r.headers.values()].join(' ').includes(MOCK_KEY));
  assert.equal(mock.generators().length, 1);
  assert.equal(mock.classifiers().length, 1, 'ogni testo passa dal controllo semantico indipendente');
  const g = mock.generators()[0];
  assert.equal(g.headers['x-api-key'], MOCK_KEY);
  assert.ok(g.headers['anthropic-version']);
  assert.equal(g.body.model, MOCK_MODEL);
  assert.match(g.system, /diagnosi/);
  assert.match(g.user, /Nome: Alessia/);
  assert.ok(!g.user.includes('Manubri segreti'), 'senza consenso l\'attrezzatura non viene inviata');
  mock.reset();
  const again = await gen(ale, 'daily');
  assert.equal(again.body.title, 'Un passo piccolo');
  assert.equal(mock.requests.length, 0, 'la seconda richiesta del giorno usa quella già generata');
  const rows = await adminClient().from('ai_generations').select('kind, status, for_day').eq('user_id', ale.id).eq('status', 'ok');
  assert.equal(rows.data.length, 1);
});

test('PRIVACY dei prompt: solo i dati consentiti, mai le note di benessere né i dati di Phill', async () => {
  const admin = adminClient();
  await ale.client.from('equipment').insert({ owner_id: ale.id, name: 'Tappetino rosa' });
  const log = (await ale.client.from('wellbeing_logs').insert({ owner_id: ale.id, day: new Date().toISOString().slice(0, 10), mood: 2, energy: 1 }).select().single()).data;
  await ale.client.from('wellbeing_notes').insert({ owner_id: ale.id, log_id: log.id, note: 'NOTA-PRIVATA-DI-ALESSIA' });
  await ale.client.from('journal_entries').insert({ owner_id: ale.id, title: 'Diario', body: 'DIARIO-SEGRETO-DI-ALESSIA un giorno lento' });
  await phill.client.from('journal_entries').insert({ owner_id: phill.id, body: 'DIARIO-DI-PHILL' });
  await ale.client.from('user_settings').insert({ user_id: ale.id, professional_notes: 'INDICAZIONE-DELLA-FISIO: evitare i salti', prefers_no_equipment: false });

  // 1) AI attiva ma senza consensi specifici
  await setPrefs(ale, { ai_enabled: true, use_equipment: false, use_wellbeing: false, use_journal: false });
  mock.respond((r) => (r.isClassifier ? OK : JSON.stringify({ text: 'Negli ultimi giorni hai fatto piccoli passi, e contano.' })));
  assert.equal((await gen(ale, 'reflection')).status, 200);
  let all = mock.requests.map((r) => r.system + r.user).join('\n');
  for (const secret of ['Tappetino rosa', 'NOTA-PRIVATA', 'DIARIO-SEGRETO', 'DIARIO-DI-PHILL']) assert.ok(!all.includes(secret), `"${secret}" inviato senza consenso`);
  assert.match(all, /INDICAZIONE-DELLA-FISIO/, 'le indicazioni del professionista servono per rispettarle');
  assert.match(all, /Non ci sono dati sul suo stato d'animo/);

  // 2) con tutti i consensi
  mock.reset(); await resetGenerations();
  await setPrefs(ale, { ai_enabled: true, use_equipment: true, use_wellbeing: true, use_journal: true });
  assert.equal((await gen(ale, 'reflection')).status, 200);
  all = mock.requests.map((r) => r.system + r.user).join('\n');
  assert.match(all, /Tappetino rosa/);
  assert.match(all, /umore 2, energia 1/);
  assert.match(all, /<dati>[^<]*DIARIO-SEGRETO/);
  for (const never of ['NOTA-PRIVATA', 'DIARIO-DI-PHILL']) assert.ok(!all.includes(never), `"${never}" non deve MAI essere inviato`);

  // 3) revocando il consenso, l'AI si ferma subito
  mock.reset();
  await setPrefs(ale, { ai_enabled: false });
  assert.equal((await gen(ale, 'reflection')).status, 403);
  assert.equal(mock.requests.length, 0);
  const prefs = (await ale.client.from('ai_preferences').select('*').single()).data;
  assert.deepEqual([prefs.use_equipment, prefs.use_wellbeing, prefs.use_journal, prefs.consent_at], [false, false, false, null], 'la revoca spegne ogni consenso specifico');
  await admin.from('user_settings').delete().eq('user_id', ale.id);
});

test('CONTROLLO SEMANTICO: un testo vietato non arriva mai; rigenerazione e poi ripiego', async () => {
  await setPrefs(ale, { ai_enabled: true });
  const forbidden = DAILY({ text: 'Stasera salta la cena e domani starai più leggera: così ti senti meglio con te stessa.' });
  let n = 0;
  mock.respond((r) => (r.isClassifier ? BLOCK('diet_prescription', 'consiglia di saltare un pasto') : (n++ === 0 ? forbidden : DAILY({ text: 'Oggi scegli una cosa gentile per te: basta quella, davvero.' }))));
  // seconda versione bloccata a sua volta → ripiego
  const r = await gen(ale, 'daily');
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'fallback', 'dopo due rifiuti si usa il messaggio preparato a mano');
  assert.ok(!JSON.stringify(r.body).includes('cena'));
  assert.equal(mock.generators().length, 2, 'una sola rigenerazione');
  assert.match(mock.generators()[1].user, /diet_prescription/, 'il feedback delle violazioni è passato alla seconda generazione');
  const rows = await adminClient().from('ai_generations').select('status, output').eq('user_id', ale.id);
  const rejected = rows.data.filter((x) => x.status === 'rejected');
  assert.equal(rejected.length, 2);
  assert.ok(rejected.every((x) => x.output.stage === 'semantic'));
  assert.ok(!JSON.stringify(rows.data).includes('salta la cena'), 'il testo vietato non viene conservato');
  assert.equal(rows.data.filter((x) => x.status === 'ok').length, 1);
});

test('i testi innocui con parole come "peso" o "kg" passano: il controllo guarda il significato', async () => {
  await setPrefs(ale, { ai_enabled: true });
  const text = 'Oggi puoi provare i manubri da 2 kg: il peso è leggero, vai con calma.';
  mock.respond((r) => (r.isClassifier ? OK : DAILY({ text })));
  const r = await gen(ale, 'daily');
  assert.equal(r.body.source, 'ai');
  assert.equal(r.body.text, text);
});

test('FAIL-CLOSED: classificatore illeggibile o modello non disponibile → mai il testo non verificato', async () => {
  await setPrefs(ale, { ai_enabled: true });
  mock.respond((r) => (r.isClassifier ? 'boh, direi di sì' : DAILY()));
  assert.equal((await gen(ale, 'daily')).body.source, 'fallback');
  await resetGenerations(); mock.reset();
  mock.respond(() => ({ status: 503, body: { error: 'overloaded' } }));
  const down = await gen(ale, 'daily');
  assert.equal(down.status, 200);
  assert.equal(down.body.source, 'fallback', 'se Anthropic non risponde, l\'app resta utilizzabile');
  assert.ok(down.body.text.length > 20);
});

test('scheda: solo esercizi del catalogo compatibili; id inventati scartati', async () => {
  await setPrefs(ale, { ai_enabled: true, use_equipment: true });
  const admin0 = adminClient();
  await admin0.from('equipment').delete().eq('owner_id', ale.id);
  await ale.client.from('equipment').insert({ owner_id: ale.id, name: 'Tappetino fitness' });
  const plan = (ids) => JSON.stringify({ title: 'Mattina dolce', intro: 'Un punto di partenza semplice, con ciò che hai in casa.', exercises: ids.map((id) => ({ id, sets: 2, reps: '10', rest_seconds: 45 })) });
  let n = 0;
  mock.respond((r) => (r.isClassifier ? OK : (n++ === 0 ? plan(STRUCT('esercizio-inventato', 'wall-push-up', 'glute-bridge', 'plank-knees')) : plan(STRUCT('squat', 'wall-push-up', 'glute-bridge', 'plank-knees')))));
  const r = await gen(ale, 'plan');
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'ai');
  assert.deepEqual(r.body.exercises.map((e) => e.exercise_key), STRUCT('squat', 'wall-push-up', 'glute-bridge', 'plank-knees'));
  assert.ok(r.body.exercises.every((e) => e.name && e.notes), 'nomi e note vengono dal catalogo');
  assert.deepEqual(r.body.items.map((i) => i.phase).filter((p, i, arr) => arr.indexOf(p) === i), ['warmup', 'main', 'cooldown'], 'struttura: riscaldamento, parte principale, defaticamento');
  await admin0.from('equipment').delete().eq('owner_id', ale.id);
  assert.ok(!/esercizio-inventato/.test(JSON.stringify(r.body)));
});

test('riflessione e promemoria: stessi controlli, risposte valide', async () => {
  await setPrefs(ale, { ai_enabled: true, reminders_enabled: true });
  mock.respond((r) => (r.isClassifier ? OK : JSON.stringify({ suggestions: [{ title: 'Un bicchiere d\'acqua', time: '11:00' }, { title: 'Due minuti di respiro', time: '17:30' }] })));
  const rem = await gen(ale, 'reminders');
  assert.equal(rem.status, 200);
  assert.equal(rem.body.suggestions.length, 2);
  assert.match(rem.body.suggestions[0].time, /^\d\d:\d\d$/);
  const bad = await gen(ale, 'oroscopo');
  assert.equal(bad.status, 400);
  assert.equal((await callFunction('ai', { action: 'boh' }, { jwt: await token(ale) })).status, 400);
});

test('LIMITE: oltre 12 generazioni nelle 24 ore si ferma, senza chiamare il modello', async () => {
  await setPrefs(ale, { ai_enabled: true });
  const rows = Array.from({ length: 12 }, () => ({ user_id: ale.id, kind: 'reflection', status: 'rejected', output: { stage: 'test' } }));
  await adminClient().from('ai_generations').insert(rows);
  mock.reset();
  const r = await gen(ale, 'reflection');
  assert.equal(r.status, 429);
  assert.equal(r.body.error, 'rate_limited');
  assert.equal(mock.requests.length, 0);
});

test('lo storico delle generazioni è privato e non scrivibile dal client', async () => {
  await setPrefs(ale, { ai_enabled: true });
  await gen(ale, 'reflection');
  assert.ok((await ale.client.from('ai_generations').select('id')).data.length >= 1);
  assert.equal((await phill.client.from('ai_generations').select('id')).data.length, 0);
  assert.ok((await ale.client.from('ai_generations').insert({ user_id: ale.id, kind: 'daily', status: 'ok', output: { value: { title: 'finto', text: 'finto' } } })).error);
  assert.ok((await ale.client.from('ai_generations').delete().eq('user_id', ale.id)).error);
});

test('NUOVO INVENTARIO: l\'AI propone solo attività compatibili con gli attrezzi salvati', async () => {
  await setPrefs(ale, { ai_enabled: true, use_equipment: true });
  const admin = adminClient();
  await admin.from('equipment').delete().eq('owner_id', ale.id);
  await admin.from('user_settings').delete().eq('user_id', ale.id);
  const settingsIns = await ale.client.from('user_settings').insert({ user_id: ale.id, fitness_level: 'intermediate' });
  assert.equal(settingsIns.error, null, settingsIns.error?.message);
  const ins = await ale.client.from('equipment').insert([
    { owner_id: ale.id, name: 'Kettlebell' }, { owner_id: ale.id, name: 'Palla da ginnastica' }, { owner_id: ale.id, name: 'Cavigliere con pesi' },
  ]);
  assert.equal(ins.error, null, ins.error?.message);
  const plan = (ids) => JSON.stringify({ title: 'Con la kettlebell', intro: 'Una scheda semplice con quello che hai.', exercises: ids.map((id) => ({ id, sets: 2, reps: '10', rest_seconds: 45 })) });
  // la prima risposta propone anche "ball-bridge" (serve il tappetino, che non c'è) e "dumbbell-curl" (non ha i manubri): viene rifiutata e rigenerata
  let n = 0;
  mock.respond((r) => (r.isClassifier ? OK : (n++ === 0 ? plan(STRUCT('kettlebell-squat', 'ball-bridge', 'dumbbell-curl', 'wall-push-up')) : plan(STRUCT('kettlebell-squat', 'wall-push-up', 'calf-raise')))));
  const r = await gen(ale, 'plan');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const prompt = mock.generators()[0].user + mock.generators()[0].system;
  assert.match(prompt, /Kettlebell/);
  assert.match(prompt, /kettlebell-squat/, 'il catalogo offerto al modello contiene gli esercizi compatibili');
  assert.ok(!/dumbbell-curl/.test(prompt), 'non offre esercizi per attrezzi che non ha');
  assert.ok(!/ball-bridge/.test(prompt), 'serve anche il tappetino: non viene offerto');
  assert.deepEqual(r.body.exercises.map((e) => e.exercise_key), STRUCT('kettlebell-squat', 'wall-push-up', 'calf-raise'));
  await admin.from('equipment').delete().eq('owner_id', ale.id);
  await admin.from('user_settings').delete().eq('user_id', ale.id);
});

test('INVENTARIO: gli attrezzi si salvano su Supabase, si tolgono, restano privati finché non condivisi', async () => {
  const { ALL_EQUIPMENT_NAMES } = await import('../../js/data/exercises-core.js');
  const admin = adminClient();
  await admin.from('equipment').delete().eq('owner_id', ale.id);
  const rows = ALL_EQUIPMENT_NAMES.map((name) => ({ owner_id: ale.id, name }));
  const ins = await ale.client.from('equipment').insert(rows);
  assert.equal(ins.error, null, `nome troppo lungo o non valido? ${ins.error?.message}`);
  assert.equal((await ale.client.from('equipment').select('id')).data.length, rows.length);
  assert.equal((await phill.client.from('equipment').select('id').eq('owner_id', ale.id)).data.length, 0, 'privato finché Alessia non condivide');
  const one = (await ale.client.from('equipment').select('id').eq('name', 'Kettlebell').single()).data;
  assert.equal((await ale.client.from('equipment').delete().eq('id', one.id)).error, null);
  assert.equal((await ale.client.from('equipment').select('id')).data.length, rows.length - 1);
  assert.equal((await ale.client.from('equipment').update({ avoid: true, notes: '4 kg' }).eq('name', 'Manubri').select()).data[0].avoid, true);
  await admin.from('equipment').delete().eq('owner_id', ale.id);
});

test('SENZA ANTHROPIC: il server genera lo stesso una sessione strutturata, con limitazioni e preferenze di Alessia', async () => {
  await setPrefs(ale, { ai_enabled: true, use_equipment: true });
  const admin = adminClient();
  await admin.from('equipment').delete().eq('owner_id', ale.id);
  await admin.from('user_settings').delete().eq('user_id', ale.id);
  const set = await ale.client.from('user_settings').insert({ user_id: ale.id, fitness_level: 'intermediate', session_minutes: 40, avoid_flags: ['knees', 'impact'], preferences: { abs: false, treadmill: false } });
  assert.equal(set.error, null, set.error?.message);
  await ale.client.from('equipment').insert([{ owner_id: ale.id, name: 'Tappetino fitness' }, { owner_id: ale.id, name: 'Manubri' }, { owner_id: ale.id, name: 'Tapis roulant' }]);
  mock.respond(() => ({ status: 503, body: { error: 'overloaded' } }));
  const { exercise } = await import('../../js/data/planner-core.js');
  for (let i = 0; i < 3; i++) {
    await resetGenerations();
    const r = await gen(ale, 'plan');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.source, 'fallback');
    const items = r.body.items;
    const order = { warmup: 0, main: 1, cardio: 2, cooldown: 3 };
    assert.equal(items[0].phase, 'warmup');
    assert.equal(items.at(-1).phase, 'cooldown');
    for (let k = 1; k < items.length; k++) assert.ok(order[items[k].phase] >= order[items[k - 1].phase], 'fasi in ordine');
    for (const it of items) {
      const e = exercise(it.exercise_key);
      assert.ok(e.equipment.every((q) => ['mat', 'dumbbells', 'treadmill'].includes(q)), `${it.exercise_key}: attrezzo non posseduto`);
      assert.ok(!e.flags.includes('knees') && !e.flags.includes('impact'), `${it.exercise_key}: limitazione violata`);
      assert.ok(!e.equipment.includes('treadmill'), 'tapis roulant disattivato nelle preferenze');
    }
    assert.ok(items.filter((i) => i.phase === 'main').length >= 3);
  }
  await admin.from('equipment').delete().eq('owner_id', ale.id);
  await admin.from('user_settings').delete().eq('user_id', ale.id);
});
