// Contratto frontend ↔ database: OGNI query `.from('tabella').select('colonne')` scritta nel frontend deve essere valida sullo schema reale.
// (Una colonna eliminata da una migrazione aveva fatto fallire in silenzio la lista dei biglietti: i test sul database non potevano accorgersene.)
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { makeUser, cleanup } from './helpers.mjs';

const ROOT = new URL('../../js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' ');
const walk = (d, out = []) => { for (const n of readdirSync(d)) { if (n === 'vendor') continue; const p = join(d, n); statSync(p).isDirectory() ? walk(p, out) : p.endsWith('.js') && out.push(p); } return out; };

function queries() {
  const found = [];
  for (const file of walk(ROOT)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\.from\('([a-z_]+)'\)\s*(?:\n\s*)?\.select\(\s*(['`])([^'`]*?)\2/g)) {
      if (m[3].includes('${')) continue;
      found.push({ file: file.slice(ROOT.length + 1), table: m[1], cols: m[3] });
    }
  }
  return found;
}

let ale; let phill;
before(async () => { ale = await makeUser('alessia', 'Alessia'); phill = await makeUser('phill', 'Phill'); });
after(cleanup);

test('tutte le select del frontend sono valide sullo schema reale (colonne e relazioni esistenti)', async () => {
  const qs = queries();
  assert.ok(qs.length >= 30, `trovate solo ${qs.length} query: il controllo non funziona`);
  const seen = new Set(); const bad = [];
  for (const q of qs) {
    const key = `${q.table}|${q.cols}`;
    if (seen.has(key)) continue; seen.add(key);
    for (const who of [ale, phill]) {
      const { error } = await who.client.from(q.table).select(q.cols).limit(1);
      if (error) { bad.push(`${q.file}: from(${q.table}).select(${q.cols.slice(0, 80)}) → ${error.message}`); break; }
    }
  }
  assert.deepEqual(bad, [], `query non valide:\n${bad.join('\n')}`);
});
