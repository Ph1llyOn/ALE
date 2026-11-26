// Illustrazioni animate degli esercizi: una per ogni id del catalogo, originali, senza risorse esterne.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { EXERCISES } from '../../js/data/exercise-catalog.js';

const dir = new URL('../../assets/exercises/', import.meta.url);
const registry = readFileSync(new URL('../../docs/ASSET_LICENSES.md', import.meta.url), 'utf8');
const read = (id) => readFileSync(new URL(`${id}.svg`, dir), 'utf8');

// Controllo di buona formazione XML senza dipendenze: i tag devono chiudersi nell'ordine giusto.
function checkWellFormed(xml, id) {
  const stack = [];
  const re = /<(\/?)([A-Za-z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const stripped = xml.replace(/<\?[\s\S]*?\?>/g, '');
  let last = 0, m;
  while ((m = re.exec(stripped))) {
    assert.ok(!/[<]/.test(stripped.slice(last, m.index)), `${id}: '<' fuori da un tag`);
    last = re.lastIndex;
    const [, close, name, , self] = m;
    if (close) assert.equal(stack.pop(), name, `${id}: tag </${name}> non bilanciato`);
    else if (!self) stack.push(name);
  }
  assert.ok(!/[<]/.test(stripped.slice(last)), `${id}: testo residuo non valido`);
  assert.equal(stack.length, 0, `${id}: tag non chiusi: ${stack.join(',')}`);
}

const animates = (svg) => [...svg.matchAll(/<animate\b[^>]*>/g)].map((m) => m[0]);
const valuesOf = (tag) => (tag.match(/\bvalues="([^"]*)"/) ?? [])[1]?.split(';') ?? [];

test('ci sono 51 esercizi nel catalogo e ognuno ha la sua illustrazione', () => {
  assert.ok(EXERCISES.length >= 51);
  for (const ex of EXERCISES) assert.ok(existsSync(new URL(`${ex.id}.svg`, dir)), `manca assets/exercises/${ex.id}.svg`);
});

for (const ex of EXERCISES) {
  test(`SVG ${ex.id}: struttura, accessibilità, nessuna risorsa esterna`, () => {
    const svg = read(ex.id);
    checkWellFormed(svg, ex.id);
    assert.equal((svg.match(/<svg\b/g) ?? []).length, 1, 'un solo <svg>');
    assert.equal((svg.match(/<\/svg>/g) ?? []).length, 1);
    assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /viewBox="0 0 200 160"/);
    assert.match(svg, /role="img"/);
    assert.match(svg, new RegExp(`aria-label="[^"]+"`));
    assert.match(svg, /<title>[^<]+<\/title>/);
    assert.match(svg, /<desc>[^<]+<\/desc>/);
    assert.ok(svg.includes(`<title>${ex.name.replace(/&/g, '&amp;')}</title>`), 'il titolo è il nome dell\'esercizio');
    assert.ok(Buffer.byteLength(svg) < 6000, `file troppo grande: ${Buffer.byteLength(svg)} byte`);
    // niente risorse esterne: l'unico URL ammesso è lo xmlns
    assert.ok(!/<image\b|<script\b|<foreignObject\b|<use\b|<style\b/i.test(svg), 'elementi non ammessi');
    assert.ok(!/\b(?:xlink:)?href\s*=/i.test(svg), 'href non ammesso');
    assert.ok(!/\bsrc\s*=/i.test(svg), 'src non ammesso');
    assert.ok(!/url\(/i.test(svg), 'url() non ammesso');
    assert.ok(!/\bon\w+\s*=/i.test(svg), 'gestori di eventi non ammessi');
    const urls = svg.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
    assert.deepEqual(urls.filter((u) => u !== 'http://www.w3.org/2000/svg'), [], 'URL esterni');
  });

  test(`SVG ${ex.id}: animazione coerente con anim:'${ex.anim}'`, () => {
    const svg = read(ex.id);
    const anims = animates(svg);
    assert.ok(anims.length > 0, 'nessun <animate>');
    for (const a of anims) assert.match(a, /repeatCount="indefinite"/);
    // ogni polyline animata mantiene lo stesso numero di punti in tutti i frame
    for (const m of svg.matchAll(/<animate attributeName="points"[^>]*>/g)) {
      const counts = valuesOf(m[0]).map((v) => v.trim().split(/\s+/).length);
      assert.ok(counts.every((c) => c === counts[0]), `${ex.id}: numero di punti diverso tra i frame`);
    }
    const distinct = (tag) => new Set(valuesOf(tag)).size;
    const maxDistinct = Math.max(...anims.map(distinct));
    assert.ok(maxDistinct >= 2, 'values senza almeno 2 valori distinti');
    if (ex.anim === 'movement') {
      // il corpo si muove davvero: almeno una polyline (points) o la testa cambiano forma/posizione
      const body = anims.filter((a) => /attributeName="(points|cx|cy|d)"/.test(a));
      assert.ok(body.length > 0 && body.some((a) => distinct(a) >= 2), 'nessuna animazione del corpo');
    } else {
      // tenuta: respiro sottile (testa/busto di pochi px) e anello che pulsa; nessun movimento ampio
      const head = anims.filter((a) => /attributeName="cy"/.test(a));
      assert.ok(head.length > 0, 'manca il respiro della testa');
      for (const a of head) {
        const ys = valuesOf(a).map(Number);
        assert.ok(Math.max(...ys) - Math.min(...ys) <= 2.5, 'respiro troppo ampio per una tenuta');
      }
      assert.ok(anims.some((a) => /attributeName="r"/.test(a)), 'manca l\'anello che pulsa');
    }
  });

  test(`registro licenze: ${ex.id}.svg`, () => {
    const row = registry.split('\n').find((l) => l.startsWith(`| \`${ex.id}.svg\``));
    assert.ok(row, `${ex.id}.svg non è nel registro`);
    assert.match(row, /Progetto ALE\./);
    assert.match(row, /generata da coordinate, animazione SMIL/);
  });
}

test('nessun SVG orfano in assets/exercises e nessuna riga orfana nel registro', () => {
  const ids = new Set(EXERCISES.map((e) => e.id));
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.svg')) continue;
    assert.ok(ids.has(f.replace(/\.svg$/, '')), `${f} non è nel catalogo`);
  }
  const block = registry.split('<!-- exercises:start -->')[1].split('<!-- exercises:end -->')[0];
  const rows = block.split('\n').filter((l) => l.startsWith('| `'));
  assert.equal(rows.length, EXERCISES.length, 'una riga di registro per ogni esercizio');
  for (const r of rows) {
    const file = r.match(/^\| `([^`]+)`/)[1];
    assert.ok(ids.has(file.replace(/\.svg$/, '')), `riga orfana nel registro: ${file}`);
  }
});

test('i 25 esercizi storici restano nello stesso stile (colori della figura)', () => {
  for (const id of ['squat', 'lunge', 'glute-bridge', 'plank', 'wall-sit', 'calf-raise', 'bird-dog', 'superman']) {
    const svg = read(id);
    assert.ok(svg.includes('#d9719a'), `${id}: manca il colore principale`);
    assert.ok(svg.includes('stroke-linecap="round"'));
  }
});
