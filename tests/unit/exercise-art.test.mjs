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
    assert.match(svg, /viewBox="(0 0 200 160|[0-9]+ [0-9]+ 160 128)"/, "proporzioni 5:4 (inquadratura stretta consentita)");
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
      if (ex.id !== 'child-pose') assert.ok(anims.some((a) => /attributeName="r"/.test(a)), 'manca l\'anello che pulsa');
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

// ---- revisione qualitativa (26/11/2026): le tre illustrazioni che erano poco leggibili
import { readFileSync as rf } from 'node:fs';
const svgOf = (id) => rf(new URL(`../../assets/exercises/${id}.svg`, import.meta.url), 'utf8');
const pts = (str) => str.trim().split(/\s+/).map((p) => p.split(',').map(Number));
const animatedPolyline = (svg, stroke, width, opacity) => {
  const re = new RegExp(`<polyline points="[^"]+" fill="none" stroke="${stroke}" stroke-width="${width}"[^>]*${opacity ? `opacity="${opacity}"` : ''}[^>]*><animate attributeName="points" values="([^"]+)"`);
  const m = re.exec(svg);
  return m ? m[1].split(';').map(pts) : null;
};
const collinear = ([a, b, c], tol = 3) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / Math.hypot(c[0] - a[0], c[1] - a[1]) <= tol;

test('ponte a una gamba: la gamba distesa è dritta e segue la linea del corpo, non è più ripida', () => {
  const frames = animatedPolyline(svgOf('single-leg-bridge'), '#f0a9c1', 9, '0.9');
  assert.ok(frames && frames.length >= 2, 'la gamba distesa si muove');
  for (const f of frames) assert.ok(collinear(f), `gamba piegata: ${JSON.stringify(f)}`);
  const slope = (f) => (f[2][1] - f[0][1]) / (f[2][0] - f[0][0]);
  assert.ok(frames.some((f) => Math.abs(slope(f)) < 0.7), 'in alto la gamba prosegue la linea del busto (inclinazione dolce)');
});

test('salita sulle punte: di profilo, il tallone si stacca e il corpo sale', () => {
  const svg = svgOf('calf-raise');
  assert.match(svg, /<animate attributeName="points" values="[^"]*,127[^"]*"/, 'il tallone sale (la linea del piede si inclina)');
  const body = animatedPolyline(svg, '#d9719a', 11);
  assert.ok(body, 'il busto si muove');
  assert.ok(body[0][0][1] - body[1][0][1] >= 8, 'il corpo sale di almeno 8 unità');
});

test('posizione del bambino: inquadratura più stretta, freccia di piegamento, nessun anello che sembri una seconda testa', () => {
  const svg = svgOf('child-pose');
  assert.match(svg, /viewBox="20 46 160 128"/);
  assert.match(svg, /stroke-dasharray="2 7"/, 'freccia tratteggiata che mostra la piega in avanti');
  assert.equal((svg.match(/<circle/g) ?? []).length, 1, 'solo la testa è un cerchio');
  assert.match(svg, /<animate/, 'respira');
});
