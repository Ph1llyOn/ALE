import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  EXERCISES, EQUIPMENT_CATALOG, ALL_EQUIPMENT_NAMES, EQUIPMENT_LABELS, equipmentKeysFrom, compatibleExercises, suggestWorkout,
} from '../../js/data/exercises-core.js';
import * as server from '../../supabase/functions/_shared/exercises-core.js';

const named = (...names) => names.map((name) => ({ name }));

test('catalogo attrezzi: contiene tutto ciò che è stato richiesto, per categorie, senza doppioni', () => {
  const required = ['Tappetino fitness', 'Manubri', 'Pesi regolabili', 'Kettlebell', 'Elastici fitness', 'Bande elastiche circolari', 'Fasce elastiche con maniglie',
    'Cavigliere con pesi', 'Polsiere con pesi', 'Pedana fitness (step)', 'Palla da ginnastica', 'Palla medica', 'Corda per saltare', 'Ruota per addominali',
    'Barra per trazioni', 'Panca da allenamento', 'Bilanciere e dischi', 'Cyclette', 'Tapis roulant', 'Ellittica', 'Mini stepper', 'Pedana vibrante'];
  for (const r of required) assert.ok(ALL_EQUIPMENT_NAMES.some((n) => n.startsWith(r.split(' (')[0])), `manca: ${r}`);
  assert.ok(EQUIPMENT_CATALOG.length >= 5, 'attrezzi organizzati in categorie');
  assert.ok(ALL_EQUIPMENT_NAMES.length >= 25);
  assert.equal(new Set(ALL_EQUIPMENT_NAMES.map((n) => n.toLowerCase())).size, ALL_EQUIPMENT_NAMES.length, 'nessun doppione');
  for (const c of EQUIPMENT_CATALOG) assert.ok(c.title && c.items.length, `categoria vuota: ${c.key}`);
  assert.ok(ALL_EQUIPMENT_NAMES.every((n) => n.length <= 80), 'entrano nel limite di 80 caratteri del database');
});

test('ogni attrezzo richiesto da un esercizio ha un nome leggibile', () => {
  for (const e of EXERCISES) for (const k of e.equipment) assert.ok(EQUIPMENT_LABELS[k], `${e.id}: manca l'etichetta di "${k}"`);
});

test('ogni esercizio ha la sua illustrazione e almeno un attrezzo del catalogo può sbloccarlo', () => {
  for (const e of EXERCISES) assert.ok(existsSync(new URL(`../../assets/exercises/${e.id}.svg`, import.meta.url)), `manca l'immagine di ${e.id}`);
  const keys = equipmentKeysFrom(named(...ALL_EQUIPMENT_NAMES));
  for (const e of EXERCISES) assert.ok(e.equipment.every((k) => keys.has(k)), `${e.id} non è raggiungibile con nessun attrezzo dell'elenco`);
});

test('i nomi del catalogo vengono riconosciuti nel modo giusto (nessun falso positivo)', () => {
  const keys = (...n) => [...equipmentKeysFrom(named(...n))].sort();
  assert.deepEqual(keys('Tappetino fitness'), ['mat']);
  assert.deepEqual(keys('Manubri'), ['dumbbells']);
  assert.deepEqual(keys('Pesi regolabili'), ['dumbbells']);
  assert.deepEqual(keys('Kettlebell'), ['kettlebell']);
  assert.deepEqual(keys('Cavigliere con pesi'), ['ankle'], 'le cavigliere non sono manubri');
  assert.deepEqual(keys('Polsiere con pesi'), [], 'le polsiere non sbloccano esercizi con i manubri');
  assert.deepEqual(keys('Elastici fitness'), ['band']);
  assert.deepEqual(keys('Bande elastiche circolari'), ['band']);
  assert.deepEqual(keys('Fasce elastiche con maniglie'), ['band']);
  assert.deepEqual(keys('Pedana fitness (step)'), ['step']);
  assert.deepEqual(keys('Mini stepper'), ['stepper'], 'lo stepper non è lo step');
  assert.deepEqual(keys('Ellittica'), ['elliptical']);
  assert.deepEqual(keys('Pedana vibrante'), []);
  assert.deepEqual(keys('Mattoncini e cinghia per yoga'), []);
  assert.deepEqual(keys('Palla da ginnastica'), ['ball']);
  assert.deepEqual(keys('Palla medica'), ['medball']);
  assert.deepEqual(keys('Cyclette'), ['bike']);
  assert.deepEqual(keys('Tapis roulant'), ['treadmill']);
  assert.deepEqual(keys('Corda per saltare'), ['rope']);
});

test('l\'inventario cambia davvero le attività proposte; "senza attrezzi" le limita al corpo libero', () => {
  const none = compatibleExercises([]);
  assert.ok(none.length >= 6 && none.every((e) => e.equipment.length === 0));
  const withKb = compatibleExercises(named('Kettlebell')).map((e) => e.id);
  assert.ok(withKb.includes('kettlebell-squat'));
  assert.ok(!compatibleExercises(named('Manubri')).some((e) => e.id === 'kettlebell-squat'));
  const ball = compatibleExercises(named('Palla da ginnastica', 'Tappetino fitness')).map((e) => e.id);
  assert.ok(ball.includes('ball-wall-squat') && ball.includes('ball-bridge'));
  assert.ok(!compatibleExercises(named('Palla da ginnastica')).some((e) => e.id === 'ball-bridge'), 'serve anche il tappetino');
  assert.ok(compatibleExercises(named('Tapis roulant')).some((e) => e.id === 'treadmill-walk'));
  assert.ok(compatibleExercises(named('Cyclette')).some((e) => e.id === 'easy-pedal'));
  assert.ok(compatibleExercises(named('Kettlebell', 'Cyclette'), { prefersNoEquipment: true }).every((e) => e.equipment.length === 0), 'senza attrezzi vince sulla scelta');
  assert.ok(!compatibleExercises([{ name: 'Kettlebell', avoid: true }]).some((e) => e.id === 'kettlebell-squat'), 'ciò che preferisce non usare non conta');
  const plan = suggestWorkout(named('Kettlebell', 'Tappetino fitness'), { count: 8, seed: 1 });
  assert.ok(plan.length >= 5 && plan.every((p) => EXERCISES.some((e) => e.id === p.exercise_key)));
});

test('il server usa lo stesso catalogo del frontend', () => {
  assert.deepEqual(server.EXERCISES.map((e) => e.id), EXERCISES.map((e) => e.id));
  assert.deepEqual(server.EQUIPMENT_CATALOG, EQUIPMENT_CATALOG);
  assert.equal(readFileSync(new URL('../../js/data/exercises-core.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n'),
    readFileSync(new URL('../../supabase/functions/_shared/exercises-core.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), 'copie sincronizzate (npm run sync-shared)');
});
