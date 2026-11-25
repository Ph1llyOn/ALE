import test from 'node:test';
import assert from 'node:assert/strict';
import { localDay, toLocalInputValue, fromLocalInputValue, validateSchedule, minScheduleDate, fmtRelative, fmtDayLabel } from '../../js/core/format.js';
import { MOODS, ENERGIES, moodLabel, energyLabel, isScale } from '../../js/core/moods.js';
import { lastDays, alignSeries, toPoints, linePath, average } from '../../js/core/chart.js';
import { decide, isAppRoute, ROUTES, ROUTE_ROLES } from '../../js/core/route-logic.js';

test('date: giorno locale e valori per datetime-local', () => {
  const d = new Date(2026, 10, 5, 9, 7);
  assert.equal(localDay(d), '2026-11-05');
  assert.equal(toLocalInputValue(d), '2026-11-05T09:07');
  // andata e ritorno: lo stesso istante
  assert.equal(new Date(fromLocalInputValue('2026-11-05T09:07')).getTime(), d.getTime());
  // mezzanotte e fine anno
  assert.equal(localDay(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
  assert.equal(localDay(new Date(2027, 0, 1, 0, 0)), '2027-01-01');
});

test('programmazione: tra 2 minuti e 1 anno', () => {
  const now = new Date(2026, 10, 26, 10, 0, 30);
  assert.ok(validateSchedule('', now));
  assert.ok(validateSchedule('non-una-data', now));
  assert.ok(validateSchedule('2026-11-26T10:00', now), 'nel passato');
  assert.ok(validateSchedule('2026-11-26T10:01', now), 'troppo vicino');
  assert.equal(validateSchedule('2026-11-26T10:05', now), null);
  assert.equal(validateSchedule('2026-11-27T08:00', now), null);
  assert.ok(validateSchedule('2028-01-01T08:00', now), 'oltre un anno');
  const min = minScheduleDate(now);
  assert.equal(min.getSeconds(), 0);
  assert.ok(min.getTime() >= now.getTime() + 60_000);
});

test('date: etichette relative e di giorno', () => {
  const now = new Date(2026, 10, 26, 18, 0);
  assert.match(fmtRelative(new Date(2026, 10, 26, 9, 5).toISOString(), now), /^oggi alle /);
  assert.match(fmtRelative(new Date(2026, 10, 25, 22, 30).toISOString(), now), /^ieri alle /);
  assert.doesNotMatch(fmtRelative(new Date(2026, 10, 1, 8, 0).toISOString(), now), /oggi|ieri/);
  assert.match(fmtDayLabel('2026-11-26'), /26/);
});

test('umore ed energia: scale 1-5 con parole gentili', () => {
  assert.equal(MOODS.length, 5);
  assert.equal(ENERGIES.length, 5);
  assert.equal(moodLabel(4), 'Bene');
  assert.equal(energyLabel(3), 'Nella media');
  assert.equal(moodLabel(9), '');
  assert.ok(isScale(1) && isScale(5));
  assert.ok(!isScale(0) && !isScale(6) && !isScale(2.5) && !isScale('3'));
  for (const x of [...MOODS, ...ENERGIES]) assert.ok(!/\b(male|fallimento|colpa|pigra)\b/i.test(x.label), `parola poco gentile: ${x.label}`);
});

test('grafici: ultimi giorni, allineamento e tracciato con interruzioni', () => {
  const today = new Date(2026, 10, 26);
  const days = lastDays(5, today);
  assert.deepEqual(days, ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']);
  assert.deepEqual(lastDays(3, new Date(2027, 0, 1)), ['2026-12-30', '2026-12-31', '2027-01-01']);
  const logs = [{ day: '2026-11-22', mood: 2 }, { day: '2026-11-24', mood: 5 }, { day: '2026-11-26', mood: 3 }];
  const series = alignSeries(logs, days, 'mood');
  assert.deepEqual(series, [2, null, 5, null, 3]);
  const pts = toPoints(series, { width: 100, height: 50, padding: 5 });
  assert.equal(pts.length, 5);
  assert.equal(pts[1], null);
  assert.ok(pts[2].y < pts[0].y, 'valore più alto = più in alto');
  const d = linePath(pts);
  assert.equal((d.match(/M/g) || []).length, 3, 'la linea si interrompe nei giorni senza dato');
  assert.equal(linePath([null, null]), '');
  assert.equal(average([2, null, 4]), 3);
  assert.equal(average([null]), null);
  assert.equal(toPoints([3], { width: 100, height: 50, padding: 5 })[0].x, 50, 'un solo punto al centro');
});

test('rotte per ruolo: Alessia e Phill hanno aree distinte', () => {
  const alessia = { session: true, recovery: false, role: 'alessia' };
  const phill = { session: true, recovery: false, role: 'phill' };
  for (const path of ['/attivita', '/calendario', '/diario', '/biglietti', '/profilo/benessere', '/profilo/progressi', '/profilo/attrezzatura']) {
    assert.deepEqual(decide(path, alessia), { render: path }, path);
    assert.deepEqual(decide(path, phill), { redirect: '/home' }, `Phill non entra in ${path}`);
    assert.deepEqual(decide(path, { session: false, recovery: false }), { redirect: '/accedi' });
  }
  assert.deepEqual(decide('/messaggi', phill), { render: '/messaggi' });
  assert.deepEqual(decide('/messaggi', alessia), { redirect: '/home' });
  for (const path of ['/home', '/profilo', '/profilo/collegamento', '/profilo/privacy']) {
    assert.deepEqual(decide(path, alessia), { render: path });
    assert.deepEqual(decide(path, phill), { render: path });
  }
  // ruolo non ancora noto (profilo in caricamento): la rotta si apre, la vista gestisce lo stato
  assert.deepEqual(decide('/messaggi', { session: true, recovery: false }), { render: '/messaggi' });
  // recupero password ha la precedenza su tutto
  assert.deepEqual(decide('/attivita', { ...alessia, recovery: true }), { redirect: '/reimposta-password' });
});

test('rotte: coerenza della tabella', () => {
  for (const [path, role] of Object.entries(ROUTE_ROLES)) {
    assert.equal(ROUTES[path], 'auth', `${path} riservata a ${role} deve essere nell'area autenticata`);
    assert.ok(['alessia', 'phill'].includes(role));
  }
  assert.ok(isAppRoute('/home') && isAppRoute('/messaggi'));
  assert.ok(!isAppRoute('/accedi') && !isAppRoute('/invito') && !isAppRoute('/nope'));
});
