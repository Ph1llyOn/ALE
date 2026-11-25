import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXERCISES, equipmentKeysFrom, compatibleExercises, suggestWorkout, exerciseById, DEFAULT_HABITS } from '../../js/data/exercises.js';
import {
  CATEGORIES, categoryLabel, startOfWeek, weekDays, monthGrid, eventsByDay, dayKey, parseDayKey, addDays, addMonths, toIso, timeOf, validateEvent, monthRange,
} from '../../js/data/calendar-util.js';
import { DAILY_FALLBACK, dailyFallback } from '../../js/data/motivation.js';
import { PROMPTS, pickPrompt } from '../../js/data/prompts.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');

test('catalogo: ogni esercizio ha illustrazione, valori sensati e testo non clinico', () => {
  assert.ok(EXERCISES.length >= 15);
  const ids = new Set();
  for (const e of EXERCISES) {
    assert.match(e.id, /^[a-z0-9-]{1,60}$/, `id non valido: ${e.id}`);
    assert.ok(!ids.has(e.id), `id duplicato ${e.id}`); ids.add(e.id);
    assert.ok(existsSync(join(ROOT, 'assets', 'exercises', `${e.id}.svg`)), `manca l'immagine di ${e.id}`);
    assert.ok(e.sets >= 1 && e.sets <= 50 && e.rest >= 0 && e.rest <= 3600);
    assert.ok(e.name.length >= 3 && e.tip.length > 10);
    assert.ok(e.equipment.every((k) => ['mat', 'dumbbells', 'band', 'step'].includes(k)));
    assert.ok(!/\b(dimagr|calorie|peso corporeo|brucia|terapia|cura|diagnosi|dolore)\b/i.test(`${e.name} ${e.tip}`), `testo non adatto in ${e.id}`);
  }
});

test('immagini: ogni SVG è ben formato, senza script né risorse esterne', () => {
  for (const e of EXERCISES) {
    const svg = readFileSync(join(ROOT, 'assets', 'exercises', `${e.id}.svg`), 'utf8');
    assert.match(svg, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.ok(!/<script|href=|onload|javascript:|<image|url\(/i.test(svg), `contenuto non ammesso in ${e.id}.svg`);
    assert.ok(svg.length < 8000);
  }
});

test('attrezzatura: dalle voci dell\'inventario alle chiavi, escludendo ciò che non vuole usare', () => {
  assert.deepEqual([...equipmentKeysFrom([{ name: 'Tappetino da yoga' }, { name: 'Manubri da 2 kg' }, { name: 'Elastici' }, { name: 'Step' }])].sort(), ['band', 'dumbbells', 'mat', 'step']);
  assert.deepEqual([...equipmentKeysFrom([{ name: 'Manubri', avoid: true }, { name: 'Cyclette' }])], [], 'ciò che preferisce non usare non conta');
  assert.deepEqual([...equipmentKeysFrom([])], []);
  assert.deepEqual([...equipmentKeysFrom(undefined)], []);
});

test('compatibilità: solo esercizi che si possono davvero fare', () => {
  const none = compatibleExercises([]);
  assert.ok(none.length >= 4 && none.every((e) => e.equipment.length === 0), 'senza attrezzi: solo corpo libero');
  const withMat = compatibleExercises([{ name: 'Tappetino' }]);
  assert.ok(withMat.some((e) => e.id === 'plank') && !withMat.some((e) => e.id === 'dumbbell-curl'));
  const dumbbells = compatibleExercises([{ name: 'Manubri' }]);
  assert.ok(dumbbells.some((e) => e.id === 'goblet-squat') && !dumbbells.some((e) => e.id === 'plank'));
  const prefersNone = compatibleExercises([{ name: 'Tappetino' }, { name: 'Manubri' }], { prefersNoEquipment: true });
  assert.ok(prefersNone.every((e) => e.equipment.length === 0), 'preferenza "senza attrezzi" rispettata');
});

test('suggerimento: deterministico, di lunghezza limitata, parte da un riscaldamento', () => {
  const items = [{ name: 'Tappetino' }, { name: 'Elastici' }];
  const a = suggestWorkout(items, { seed: 3 });
  const b = suggestWorkout(items, { seed: 3 });
  assert.deepEqual(a, b);
  assert.equal(a.length, 5);
  assert.ok(['march', 'arm-circles'].includes(a[0].exercise_key), 'inizia con un riscaldamento');
  assert.equal(new Set(a.map((e) => e.exercise_key)).size, a.length, 'senza ripetizioni');
  assert.ok(a.every((e) => exerciseById(e.exercise_key)));
  assert.notDeepEqual(a.map((e) => e.exercise_key), suggestWorkout(items, { seed: 4 }).map((e) => e.exercise_key), 'cambia con il seme');
  assert.ok(a.every((e) => e.sets >= 1 && e.name && e.notes));
  assert.deepEqual(suggestWorkout([], { count: 3 }).length, 3);
});

test('abitudini predefinite: chiavi valide e nomi gentili', () => {
  for (const hb of DEFAULT_HABITS) { assert.match(hb.key, /^[a-z0-9_]{1,40}$/); assert.ok(hb.name.length > 3); }
  assert.equal(new Set(DEFAULT_HABITS.map((x) => x.key)).size, DEFAULT_HABITS.length);
});

test('calendario: sette categorie con etichette', () => {
  assert.equal(CATEGORIES.length, 7);
  assert.deepEqual(CATEGORIES.map((c) => c.key), ['workout', 'walk', 'personal', 'reminder', 'weekly_goal', 'rest', 'school_work']);
  assert.equal(categoryLabel('rest'), 'Riposo e recupero');
  assert.equal(categoryLabel('sconosciuta'), 'sconosciuta');
});

test('calendario: settimane che iniziano di lunedì', () => {
  assert.equal(dayKey(startOfWeek(new Date(2026, 10, 26))), '2026-11-23');   // giovedì → lunedì
  assert.equal(dayKey(startOfWeek(new Date(2026, 10, 22))), '2026-11-16');   // domenica → lunedì precedente
  assert.equal(dayKey(startOfWeek(new Date(2026, 10, 23))), '2026-11-23');   // lunedì → se stesso
  assert.deepEqual(weekDays(new Date(2026, 10, 26)).map(dayKey), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
});

test('calendario: griglia mensile completa e coerente', () => {
  for (const [y, m] of [[2026, 10], [2026, 1], [2027, 0], [2026, 11]]) {
    const grid = monthGrid(y, m);
    assert.ok(grid.length >= 4 && grid.length <= 6, `${y}-${m + 1}: ${grid.length} righe`);
    assert.ok(grid.every((w) => w.length === 7));
    assert.equal(grid[0][0].getDay(), 1, 'la griglia inizia di lunedì');
    const days = grid.flat();
    for (let i = 1; i < days.length; i++) assert.equal(dayKey(days[i]), dayKey(addDays(days[i - 1], 1)), 'giorni consecutivi');
    assert.ok(days.some((d) => d.getMonth() === m && d.getDate() === 1), 'contiene il primo del mese');
    const last = new Date(y, m + 1, 0);
    assert.ok(days.some((d) => dayKey(d) === dayKey(last)), 'contiene l\'ultimo del mese');
    const r = monthRange(y, m);
    assert.ok(new Date(r.from) <= days[0] && new Date(r.to) > days.at(-1));
  }
  assert.equal(dayKey(addMonths(new Date(2026, 10, 15), 2)), '2027-01-01');
  assert.equal(dayKey(parseDayKey('2026-02-28')), '2026-02-28');
});

test('calendario: eventi raggruppati per giorno locale e ordinati', () => {
  const ev = [
    { id: 'b', starts_at: new Date(2026, 10, 26, 18, 0).toISOString(), all_day: false },
    { id: 'a', starts_at: new Date(2026, 10, 26, 9, 0).toISOString(), all_day: false },
    { id: 'c', starts_at: new Date(2026, 10, 26, 12, 0).toISOString(), all_day: true },
    { id: 'd', starts_at: new Date(2026, 10, 27, 8, 0).toISOString(), all_day: false },
  ];
  const map = eventsByDay(ev);
  assert.deepEqual(map.get('2026-11-26').map((e) => e.id), ['c', 'a', 'b'], 'prima "tutto il giorno", poi per orario');
  assert.deepEqual(map.get('2026-11-27').map((e) => e.id), ['d']);
  assert.equal(map.get('2026-11-28'), undefined);
});

test('calendario: conversione giorno/ora locale ↔ ISO', () => {
  const iso = toIso('2026-11-26', '09:30');
  assert.equal(timeOf(iso), '09:30');
  assert.equal(dayKey(new Date(iso)), '2026-11-26');
  assert.equal(timeOf(toIso('2026-11-26', '')), '12:00');
});

test('calendario: validazione dell\'evento', () => {
  assert.equal(validateEvent({ title: 'Cena', day: '2026-11-26', time: '19:00', endTime: '21:00' }), null);
  assert.ok(validateEvent({ title: '  ', day: '2026-11-26' }));
  assert.ok(validateEvent({ title: 'x', day: '' }));
  assert.ok(validateEvent({ title: 'x', day: '2026-11-26', time: '10:00', endTime: '09:00' }));
  assert.equal(validateEvent({ title: 'x', day: '2026-11-26', time: '10:00', endTime: '09:00', allDay: true }), null);
});

test('pensieri del mattino: dolci, senza peso/corpo/prestazioni, stabili nella giornata', () => {
  assert.ok(DAILY_FALLBACK.length >= 10);
  for (const m of DAILY_FALLBACK) {
    assert.ok(m.title.length > 2 && m.text.length > 20 && m.text.length < 220);
    assert.ok(!/\b(peso|calorie|dimagr|grasso|magra|corpo|devi|dovresti|obiettivo|pigra|colpa)\b/i.test(`${m.title} ${m.text}`), `tono non adatto: ${m.text}`);
  }
  assert.deepEqual(dailyFallback(new Date(2026, 10, 5, 8)), dailyFallback(new Date(2026, 10, 5, 22)));
  assert.notDeepEqual(dailyFallback(new Date(2026, 10, 5)), dailyFallback(new Date(2026, 10, 6)));
});

test('la libreria dei pensieri usata dal server è identica a quella del frontend (npm run sync-shared)', () => {
  assert.equal(readFileSync(join(ROOT, 'supabase/functions/_shared/motivation.js'), 'utf8'), readFileSync(join(ROOT, 'js/data/motivation.js'), 'utf8'));
});

test('spunti del diario: gentili e senza giudizi', () => {
  assert.ok(PROMPTS.length >= 10);
  for (const p of PROMPTS) assert.ok(p.length > 15 && !/\b(peso|dieta|fallimento|colpa|dovresti)\b/i.test(p), p);
  assert.equal(pickPrompt(0), PROMPTS[0]);
  assert.equal(pickPrompt(PROMPTS.length), PROMPTS[0]);
  assert.equal(typeof pickPrompt(-3), 'string');
});
