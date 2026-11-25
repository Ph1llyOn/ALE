// Rigenera la lista SHELL di sw.js a partire dai file del sito (HTML, CSS, JS, icone, manifest).
// Uso: node tools/update-sw-precache.mjs   (da rieseguire quando si aggiungono/rimuovono file del frontend)
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const SKIP = new Set(['node_modules', '.git', '.github', 'supabase', 'tests', 'docs', 'tools']);
const EXT = /\.(html|css|js|png|webmanifest)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXT.test(name)) out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

const files = walk(root).filter((f) => f !== 'sw.js').sort();
const block = `const SHELL = [\n  './',\n${files.map((f) => `  '${f}',`).join('\n')}\n];`;
const swPath = join(root, 'sw.js');
const sw = readFileSync(swPath, 'utf8').replace(/const SHELL = \[[\s\S]*?\];/, block);
writeFileSync(swPath, sw);
console.log(`sw.js: ${files.length} file in precache`);
