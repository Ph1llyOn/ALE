// Tutorial iniziale: contenuti, accuratezza (ogni etichetta citata esiste davvero nell'app), sicurezza (CSP, solo Alessia).
// Il modulo della vista dipende dal client Supabase nel browser: qui si legge il sorgente, senza eseguirlo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES, ROUTE_ROLES, isAppRoute } from '../../js/core/route-logic.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VIEW = fs.readFileSync(path.join(ROOT, 'js/features/tutorial/tutorial.js'), 'utf8');
const SLIDES_BLOCK = VIEW.slice(VIEW.indexOf('export const SLIDES = ['), VIEW.indexOf('const clamp'));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'tutorial') walk(p, out); } else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
const APP_SOURCE = walk(path.join(ROOT, 'js')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

const texts = [...SLIDES_BLOCK.matchAll(/text: '([^']+)'/g)].map((m) => m[1]);
const titles = [...SLIDES_BLOCK.matchAll(/title: '([^']+)'/g)].map((m) => m[1]);
const pointsBlocks = [...SLIDES_BLOCK.matchAll(/points: \[([^\]]*)\]/g)].map((m) => [...m[1].matchAll(/'((?:[^'\\]|\\.)+)'/g)].map((x) => x[1]));
const everything = [...texts, ...titles, ...pointsBlocks.flat()];

const PRESSURE = /non mollare|devi reagire|reagisci|\bforza\b|allenati|(?<!non )\bdevi\b|dovresti|non hai fatto/i;

test('sette schermate nell’ordine previsto, ognuna con titolo, testo e punti', () => {
  assert.equal(titles.length, 7);
  assert.equal(texts.length, 7);
  assert.equal(pointsBlocks.length, 7);
  for (const p of pointsBlocks) assert.ok(p.length >= 1);
  assert.deepEqual(titles, ['Benvenuta in ALE.', 'La Home', 'Attività', 'Calendario', 'Benessere, diario e AI', 'Profilo e controllo', 'Il riposo conta quanto l’attività']);
});

test('testi brevi e leggibili su telefono', () => {
  for (const t of texts) assert.ok(t.length <= 260, `troppo lungo: ${t}`);
  for (const p of everything) assert.ok(p.length <= 160, `punto troppo lungo: ${p}`);
});

test('nessuna pressione: niente "non mollare", "devi reagire", "allenati", "forza"', () => {
  for (const s of everything) assert.ok(!PRESSURE.test(s), `frase con pressione: ${s}`);
});

test('nessun dato inventato o promessa: niente numeri di risultati, niente "garantito"', () => {
  for (const s of everything) assert.ok(!/garanti|%|\d+ (giorni|kg|minuti di media)/i.test(s), s);
});

test('i messaggi obbligatori ci sono tutti', () => {
  const must = [
    ['controllo delle informazioni', /tuoi|tue|restano tue/],
    ['annotazioni private del diario non condivise in automatico', /nessuna voce viene condivisa in automatico/],
    ['proposte di Phill con approvazione', /senza il tuo sì/],
    ['riposo importante quanto l’attività', /riposo conta quanto/],
    ['AI facoltativa e soggetta ai consensi', /facoltativo.*consensi|consensi che dai/],
    ['Gemini di Google dichiarato', /Gemini di Google/],
  ];
  for (const [name, re] of must) assert.ok(everything.some((s) => re.test(s)), `manca: ${name}`);
});

test('accuratezza: ogni etichetta citata tra «» esiste davvero nel codice dell’app', () => {
  const quoted = [...new Set(everything.flatMap((s) => [...s.matchAll(/«([^»]+)»/g)].map((m) => m[1])))];
  assert.ok(quoted.length >= 5, 'ci si aspetta che il tutorial citi i pulsanti reali');
  for (const q of quoted) assert.ok(APP_SOURCE.includes(q), `etichetta inesistente nell'app: «${q}»`);
});

test('accuratezza: i nomi delle sezioni del Profilo e delle Impostazioni sono quelli reali', () => {
  for (const name of ['Attrezzatura e spazi', 'Privacy e dati', 'Notifiche', 'Intelligenza artificiale', 'PIN di accesso', 'Aspetto', 'Benessere', 'Impostazioni']) {
    assert.ok(APP_SOURCE.includes(name), name);
  }
  for (const name of ['Biglietti di', 'Il tuo giorno', 'Mese', 'Settimana', 'Accetta', 'Non ora', 'Nuova voce', 'Elimina', 'Proposte da Phill']) {
    assert.ok(APP_SOURCE.includes(name), name);
  }
});

test('CSP: nessun attributo style inline (style-src \'self\' li bloccherebbe)', () => {
  assert.ok(!/\bstyle: [`'"]/.test(VIEW), 'usare classi, non style inline');
});

test('rotta: solo Alessia, a schermo intero (senza barra di navigazione)', () => {
  assert.equal(ROUTES['/tutorial'], 'auth');
  assert.equal(ROUTE_ROLES['/tutorial'], 'alessia');
  assert.equal(isAppRoute('/tutorial'), false);
});

test('la vista non legge né scrive altro che lo stato del tutorial su user_settings', () => {
  assert.ok(VIEW.includes("saveTour(profile.id"));
  assert.ok(!/\.from\(/.test(VIEW), 'nessuna query diretta dalla vista');
});

test('animazioni: ogni classe usata nel tutorial è definita nel CSS', () => {
  const css = fs.readFileSync(path.join(ROOT, 'css/screens.css'), 'utf8');
  const used = new Set([...VIEW.matchAll(/class: '([^']+)'/g)].flatMap((m) => m[1].split(/\s+/)));
  for (const c of used) {
    if (!c.startsWith('tour-') && !['tutorial', 'steps', 'step-dot', 'card', 'stack', 'page-title', 'muted', 'btn', 'btn-text', 'btn-secondary', 'btn-block', 'card-row', 'shell'].includes(c)) continue;
    if (c.startsWith('tour-')) assert.ok(css.includes(`.${c}`), `classe senza stile: ${c}`);
  }
  const dynamic = [...VIEW.matchAll(/tour-i\$\{/g)].length;
  for (let i = 0; i < 5; i++) assert.ok(css.includes(`.tour-i${i} {`), `ritardo tour-i${i} mancante`);
  assert.ok(dynamic >= 1);
});
