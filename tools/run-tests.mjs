// Esegue `node --test` sui file *.test.mjs delle cartelle indicate: funziona uguale su Node 20 e 22
// (da Node 22 `node --test <cartella>` non scansiona più le directory) e su Windows/Linux.
// Uso: node tools/run-tests.mjs [--serial] tests/static tests/unit
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const serial = args.includes('--serial');
const dirs = args.filter((a) => !a.startsWith('--'));

const files = [];
for (const dir of dirs) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isFile() && /\.test\.mjs$/.test(name)) files.push(full);
  }
}
if (!files.length) { console.error('Nessun file di test trovato in:', dirs.join(', ')); process.exit(1); }

const flags = serial ? ['--test-concurrency=1'] : [];
const r = spawnSync(process.execPath, ['--test', ...flags, ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
