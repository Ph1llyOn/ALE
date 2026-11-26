import test from 'node:test';
import assert from 'node:assert/strict';
import { moodState, GENTLE_STATES, DAILY_BY_STATE, DAILY_FALLBACK, dailyFallback, styleFor, STYLES } from '../../js/data/motivation.js';
import { buildContext, currentMood, wellbeingSummary, generatorPrompt, classifierPrompt, describeContext, fallbackFor, STATE_GUIDANCE } from '../../supabase/functions/_shared/ai-core.js';

const TODAY = '2026-12-10';
const base = (wellbeing, consents = { use_wellbeing: true }) => buildContext({ firstName: 'Alessia', hour: 8, today: TODAY, consents, wellbeing, equipment: [], stats: { sessions7: 2, habitDays7: 3, goalsDone30: 0, wellbeingDays7: wellbeing?.length ?? 0 } });
const log = (mood, energy, day = TODAY) => [{ day, mood, energy }];
const PRESSURE = /non mollare|devi reagire|reagisci|\bforza\b|allenati|(?<!non )\bdevi\b|dovresti|non hai fatto/i;

test('scenari: ogni combinazione di umore ed energia porta allo stato giusto', () => {
  const cases = [[5, 4, 'felice'], [4, 3, 'felice'], [4, 2, 'stanca_soddisfatta'], [5, 1, 'stanca_soddisfatta'], [3, 3, 'tranquilla'], [3, 4, 'tranquilla'], [3, 2, 'poca_energia'], [3, 1, 'poca_energia'],
    [2, 3, 'cosi_cosi'], [2, 2, 'giu'], [1, 5, 'giu'], [1, 1, 'giu'], [null, 3, 'neutro'], [undefined, undefined, 'neutro'], [9, 3, 'neutro']];
  for (const [m, e, want] of cases) assert.equal(moodState(m, e), want, `umore ${m}, energia ${e}`);
  assert.deepEqual([...GENTLE_STATES].sort(), ['giu', 'poca_energia', 'stanca_soddisfatta']);
});

test('lo stato viene dai dati reali: solo oggi o ieri, solo con il consenso; altrimenti neutro (nessuna emozione inventata)', () => {
  assert.equal(currentMood(log(1, 1), TODAY).state, 'giu');
  assert.equal(currentMood(log(5, 5, '2026-12-09'), TODAY).state, 'felice', 'ieri vale ancora');
  assert.equal(currentMood(log(1, 1, '2026-12-05'), TODAY).state, 'neutro', 'un dato di cinque giorni fa non descrive oggi');
  assert.equal(currentMood([], TODAY).state, 'neutro');
  assert.equal(currentMood([{ day: TODAY, mood: 1, energy: 1 }, { day: '2026-12-09', mood: 5, energy: 5 }], TODAY).state, 'giu', 'vale il più recente');
  assert.equal(base(log(1, 1), { use_wellbeing: false }).mood.state, 'neutro', 'senza consenso lo stato non esiste nemmeno nel contesto');
  assert.equal(base(log(1, 1), { use_wellbeing: false }).wellbeing_summary, null);
});

test('il prompt cambia con lo stato: tono, contenuto e tipo di motivazione', () => {
  const prompts = {};
  for (const [state, [m, e]] of Object.entries({ felice: [5, 4], tranquilla: [3, 3], cosi_cosi: [2, 3], giu: [1, 2], poca_energia: [3, 1], stanca_soddisfatta: [4, 1] })) {
    const ctx = base(log(m, e));
    assert.equal(ctx.mood.state, state);
    prompts[state] = generatorPrompt('daily', ctx);
    assert.ok(prompts[state].includes(STATE_GUIDANCE[state]), `${state}: manca la guida di comportamento`);
    assert.match(prompts[state], /umore «/);
    assert.match(prompts[state], /STILE DI OGGI/);
  }
  assert.equal(new Set(Object.values(prompts)).size, 6, 'sei stati, sei prompt diversi');
  assert.match(prompts.giu, /NON usare frasi come "non mollare"/);
  assert.match(prompts.giu, /Non proporre attività né obiettivi/);
  assert.match(prompts.giu, /non deve dimostrare niente a nessuno/);
  assert.match(prompts.poca_energia, /Non incoraggiare allenamenti intensi/);
  assert.match(prompts.stanca_soddisfatta, /NON suggerire altre attività/);
  assert.match(prompts.felice, /Complimentati con naturalezza/);
  assert.match(prompts.tranquilla, /UN solo piccolo obiettivo/);
  for (const p of Object.values(prompts)) assert.match(p, /il riposo non è mai un fallimento/);
});

test('senza umore indicato: tono neutro e positivo, il modello è avvertito di non inventare', () => {
  for (const ctx of [base([]), base(log(1, 1), { use_wellbeing: false })]) {
    const p = generatorPrompt('daily', ctx);
    assert.ok(p.includes(STATE_GUIDANCE.neutro));
    assert.match(describeContext(ctx), /non inventarlo/);
    assert.ok(!/umore «/.test(p));
  }
});

test('nessuna ripetizione: lo stile si alterna e gli ultimi messaggi vengono mostrati per non ripeterli', () => {
  const styles = new Set(); for (let d = 1; d <= 8; d++) styles.add(styleFor('tranquilla', new Date(2026, 11, d)));
  assert.ok(styles.size >= 3, [...styles].join());
  for (const st of GENTLE_STATES) for (let d = 1; d <= 30; d++) assert.notEqual(styleFor(st, new Date(2026, 11, d)), 'incoraggiamento', `${st}: mai incoraggiamento`);
  assert.equal(Object.keys(STYLES).length, 4);
  const ctx = buildContext({ firstName: 'A', hour: 8, today: TODAY, consents: {}, recentDaily: [{ title: 'Respira', text: 'Un respiro lento.' }, { title: 'Piano', text: 'Vai con calma.' }] });
  const p = generatorPrompt('daily', ctx);
  assert.match(p, /MESSAGGI RECENTI/);
  assert.match(p, /Respira: Un respiro lento\./);
  assert.ok(!/MESSAGGI RECENTI/.test(generatorPrompt('daily', base([]))));
});

test('il controllore conosce lo stato: un testo che spinge ad allenarsi quando è giù non passa', () => {
  const p = classifierPrompt('daily', 'Forza, allenati!', base(log(1, 2)));
  assert.match(p, /Stato di oggi: giu \(umore pesante, energia poca\)/);
  assert.match(classifierPrompt('daily', 'x', base([])), /Stato di oggi: neutro \(non indicato\)/);
});

test('RIPIEGO personalizzato (senza Gemini): un messaggio adatto allo stato, mai pressione, mai ripetuto di giorno in giorno', () => {
  for (const [state, list] of Object.entries(DAILY_BY_STATE)) {
    assert.ok(list.length >= 4, `${state}: poche varianti`);
    for (const m of list) {
      assert.ok(m.title && m.text.length >= 40 && m.text.length <= 220, `${state}: lunghezza di "${m.title}"`);
      assert.ok(!/peso corporeo|dimagr|calorie|kg\b|pancia|aspetto/i.test(m.text), `${state}: ${m.text}`);
      if (['giu', 'poca_energia', 'stanca_soddisfatta', 'cosi_cosi'].includes(state)) assert.ok(!PRESSURE.test(m.text) && !/allen|esercizi|obiettiv/i.test(m.text), `${state}: pressione in "${m.text}"`);
    }
    const seq = Array.from({ length: 10 }, (_, d) => dailyFallback(new Date(2026, 11, 1 + d), state).text);
    for (let d = 1; d < seq.length; d++) assert.notEqual(seq[d], seq[d - 1], `${state}: stesso messaggio due giorni di fila`);
    assert.ok(new Set(seq).size >= Math.min(4, list.length), `${state}: poca varietà`);
  }
  assert.deepEqual(dailyFallback(new Date(2026, 11, 1), 'neutro'), dailyFallback(new Date(2026, 11, 1)));
  assert.ok(DAILY_FALLBACK.includes(dailyFallback(new Date(), 'stato-inventato')), 'stato sconosciuto: neutro');
  for (const [m, e, state] of [[1, 1, 'giu'], [5, 4, 'felice'], [3, 1, 'poca_energia']]) {
    const f = fallbackFor('daily', base(log(m, e)), new Date(2026, 11, 10));
    assert.ok(DAILY_BY_STATE[state].some((x) => x.text === f.text), state);
  }
  assert.ok(DAILY_FALLBACK.some((x) => x.text === fallbackFor('daily', base([]), new Date(2026, 11, 10)).text), 'senza dati: tono neutro');
});

test('riflessione di ripiego coerente con periodo e dati reali, senza inventare', () => {
  const week = (moods) => moods.map((m, i) => ({ day: `2026-12-0${i + 1}`, mood: m, energy: 3 }));
  const heavy = fallbackFor('reflection', base(week([1, 2, 1, 2, 2])), new Date());
  assert.match(heavy.text, /giornate pesanti/);
  assert.ok(!PRESSURE.test(heavy.text));
  const good = fallbackFor('reflection', base(week([4, 5, 4, 4, 5])), new Date());
  assert.match(good.text, /sentita bene/);
  const ctx = buildContext({ firstName: 'A', hour: 8, today: TODAY, consents: {}, stats: { sessions7: 3, habitDays7: 0, goalsDone30: 0, wellbeingDays7: 0 } });
  const numbers = fallbackFor('reflection', ctx, new Date()).text.match(/\d+/g) ?? [];
  assert.deepEqual(numbers, ['7', '3'], 'solo il periodo (7 giorni) e i numeri reali (3 allenamenti)');
  assert.match(fallbackFor('reflection', buildContext({ firstName: 'A', hour: 8, today: TODAY, consents: {}, stats: {} }), new Date()).text, /tranquilli/);
  const s = wellbeingSummary(week([2, 2, 3, 4, 5]));
  assert.deepEqual([s.days, s.trend], [5, 'in miglioramento']);
});

test('con stato delicato la scheda di ripiego è leggera (mobilità), non una sessione di forza', () => {
  const eq = [{ name: 'Tappetino fitness' }, { name: 'Manubri' }];
  const mk = (m, e) => buildContext({ firstName: 'A', hour: 8, today: TODAY, consents: { use_wellbeing: true, use_equipment: true }, equipment: eq, wellbeing: log(m, e), training: { level: 'intermediate', minutes: 40, today: TODAY } });
  assert.equal(fallbackFor('plan', mk(1, 2), new Date(2026, 11, 10)).kind, 'mobility');
  assert.equal(fallbackFor('plan', mk(3, 1), new Date(2026, 11, 10)).kind, 'mobility');
  assert.equal(fallbackFor('plan', mk(5, 4), new Date(2026, 11, 10)).kind, 'strength');
});
