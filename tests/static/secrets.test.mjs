import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// Pattern di segreti REALI (non la semplice parola "service_role", che compare nella documentazione).
const PATTERNS = [
  [/sb_secret_[A-Za-z0-9_-]{16,}/, 'Supabase secret key'],
  [/sk-ant-[A-Za-z0-9_-]{16,}/, 'chiave Anthropic'],
  [/eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/, 'JWT (anon/service_role)'],
  [/postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]{6,}@(?!127\.0\.0\.1|localhost)/, 'stringa di connessione con password'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'chiave privata'],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'token GitHub'],
  [/SUPABASE_DB_PASSWORD=[A-Za-z0-9_-]{16,}/, 'password DB'],
  [/sbp_[a-f0-9]{30,}/, 'access token Supabase'],
];

test('nessun segreto nei file tracciati da git', () => {
  const files = git('ls-files', '-z').split('\0').filter(Boolean);
  const hits = [];
  for (const f of files) {
    if (f === 'package-lock.json' || /\.(png|jpe?g|webp|gif)$/i.test(f)) continue;
    if (f === 'tests/secrets.test.mjs' || f === '.env.example') continue;
    let txt;
    try { txt = readFileSync(join(ROOT, f), 'utf8'); } catch { continue; }
    for (const [re, label] of PATTERNS) if (re.test(txt)) hits.push(`${f}: ${label}`);
  }
  assert.deepEqual(hits, []);
});

test('i file di credenziali locali sono ignorati da git e non tracciati', () => {
  for (const f of ['.env.local', 'supabase/.env.local', '.env']) {
    execFileSync('git', ['check-ignore', '-q', f], { cwd: ROOT }); // lancia se NON ignorato
  }
  const tracked = git('ls-files').split('\n');
  assert.ok(!tracked.some((f) => /(^|\/)\.env(\.|$)/.test(f) && f !== '.env.example'));
});
