import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES } from '../../js/data/exercise-catalog.js';
import { TEXTS, MUSCLE_LABELS, FLAG_LABELS, LEVEL_LABELS } from '../../js/data/exercise-texts.js';

const BANNED = /dimagr|calorie|brucia|grasso|snellisc|cellulite|diagnosi|terapia|cura\b/i;
const CLINICAL = /patolog|lesion|infiammaz|ernia|sciatalg|tendinit|artros|menisc|sindrome|trauma/i;
const HARD = /\bdevi\b/i;
const EQUIP_WORDS = {
  mat: /tappetino/i, dumbbells: /manubri/i, band: /elastico/i, step: /step|pedana|panca/i,
  kettlebell: /kettlebell/i, ball: /palla/i, medball: /palla medica/i, rope: /corda/i,
  ankle: /cavigliere/i, treadmill: /tapis roulant/i, bike: /cyclette/i, elliptical: /ellittica/i, stepper: /stepper/i,
};

const len = (s, min, max, label) => assert.ok(typeof s === 'string' && s.length >= min && s.length <= max, `${label}: lunghezza ${s && s.length}`);

test('stesse chiavi del catalogo', () => {
  assert.deepEqual(Object.keys(TEXTS).sort(), EXERCISES.map((x) => x.id).sort());
});

test('campi e lunghezze', () => {
  for (const ex of EXERCISES) {
    const t = TEXTS[ex.id];
    const id = ex.id;
    len(t.desc, 15, 160, `${id}.desc`);
    len(t.setup, 15, 200, `${id}.setup`);
    assert.ok(Array.isArray(t.steps) && t.steps.length >= 3 && t.steps.length <= 5, `${id}.steps`);
    t.steps.forEach((s, i) => len(s, 5, 140, `${id}.steps[${i}]`));
    len(t.posture, 15, 260, `${id}.posture`);
    assert.ok(Array.isArray(t.mistakes) && t.mistakes.length >= 2 && t.mistakes.length <= 3, `${id}.mistakes`);
    t.mistakes.forEach((s, i) => len(s, 5, 140, `${id}.mistakes[${i}]`));
    if (ex.flags.length) len(t.safety, 10, 260, `${id}.safety`);
    else assert.ok(t.safety === null || typeof t.safety === 'string', `${id}.safety`);
    if (t.muscleNote !== undefined) len(t.muscleNote, 5, 160, `${id}.muscleNote`);
  }
});

test('parole vietate, espressioni cliniche e imperativi duri', () => {
  for (const [id, t] of Object.entries(TEXTS)) {
    const all = [t.desc, t.setup, ...t.steps, t.posture, ...t.mistakes, t.safety || '', t.muscleNote || ''].join(' | ');
    assert.ok(!BANNED.test(all), `${id}: parola vietata`);
    assert.ok(!CLINICAL.test(all), `${id}: espressione clinica`);
    assert.ok(!HARD.test(all), `${id}: "devi"`);
  }
});

test('il setup cita l\'attrezzo richiesto', () => {
  for (const ex of EXERCISES) {
    for (const eq of ex.equipment) {
      assert.ok(EQUIP_WORDS[eq], `attrezzo sconosciuto ${eq}`);
      assert.match(TEXTS[ex.id].setup, EQUIP_WORDS[eq], `${ex.id}: manca ${eq}`);
    }
  }
});

test('etichette complete', () => {
  for (const ex of EXERCISES) {
    for (const m of ex.muscles) assert.ok(MUSCLE_LABELS[m], `muscolo ${m}`);
    for (const f of ex.flags) assert.ok(FLAG_LABELS[f], `flag ${f}`);
    assert.ok(LEVEL_LABELS[ex.level], `livello ${ex.level}`);
  }
});
