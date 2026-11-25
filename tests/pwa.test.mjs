import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../tools/serve-subpath.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'supabase', 'tests', 'docs', 'tools', '.github'].includes(name)) continue;
    const full = join(dir, name);
    statSync(full).isDirectory() ? walk(full, out) : out.push(full);
  }
  return out;
}
const frontend = walk(ROOT).filter((f) => ['.html', '.css', '.js', '.webmanifest'].includes(extname(f)));

test('manifest: percorsi relativi e campi PWA', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.start_url, './?source=pwa');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'standalone');
  for (const i of m.icons) {
    assert.ok(!i.src.startsWith('/'), `icona assoluta: ${i.src}`);
    assert.ok(existsSync(join(ROOT, i.src)), `icona mancante: ${i.src}`);
  }
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  assert.ok(m.icons.some((i) => i.sizes === '192x192'));
  assert.ok(m.icons.some((i) => i.sizes === '512x512'));
});

test('icone: PNG validi con le dimensioni dichiarate', () => {
  const sizes = { 'icon-192.png': 192, 'icon-512.png': 512, 'icon-maskable-512.png': 512, 'apple-touch-icon.png': 180 };
  for (const [name, size] of Object.entries(sizes)) {
    const b = readFileSync(join(ROOT, 'assets/icons', name));
    assert.equal(b.subarray(1, 4).toString(), 'PNG', name);
    assert.equal(b.readUInt32BE(16), size, `${name} larghezza`);
    assert.equal(b.readUInt32BE(20), size, `${name} altezza`);
  }
});

test('nessun percorso assoluto dalla radice nei file del frontend', () => {
  const bad = [];
  for (const f of frontend) {
    const txt = readFileSync(f, 'utf8');
    for (const m of txt.matchAll(/(?:href|src|action)=["']\/(?!\/)[^"']*["']|url\(\s*["']?\/(?!\/)[^)]*\)|from\s+["']\/[^"']*["']/g)) {
      bad.push(`${relative(ROOT, f)}: ${m[0]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('service worker: ogni voce di precache esiste', () => {
  const sw = read('sw.js');
  const block = sw.match(/const SHELL = \[([\s\S]*?)\];/)[1];
  const entries = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(entries.length > 5);
  for (const e of entries) {
    const p = e === './' ? 'index.html' : e;
    assert.ok(existsSync(join(ROOT, p)), `precache mancante: ${e}`);
    assert.ok(!e.startsWith('/'), `precache assoluto: ${e}`);
  }
  // Le richieste fuori dal nostro sito non devono mai essere messe in cache.
  assert.match(sw, /url\.origin !== scopeUrl\.origin/);
});

test('nessun segreto nel frontend', () => {
  const patterns = [
    [/sk-ant-[A-Za-z0-9_-]{10,}/, 'chiave Anthropic'],
    [/service_role/i, 'service_role'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'chiave privata'],
    [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, 'JWT'],
    [/VAPID_PRIVATE/i, 'VAPID privata'],
  ];
  const hits = [];
  for (const f of frontend) {
    const txt = readFileSync(f, 'utf8');
    for (const [re, label] of patterns) if (re.test(txt)) hits.push(`${relative(ROOT, f)}: ${label}`);
  }
  assert.deepEqual(hits, []);
});

test('config.js: nessuna credenziale precompilata', () => {
  const c = read('js/config.js');
  assert.match(c, /SUPABASE_URL = ''/);
  assert.match(c, /SUPABASE_ANON_KEY = ''/);
});

test('licenze: ogni immagine in assets/exercises ha una voce nel registro', () => {
  const dir = join(ROOT, 'assets', 'exercises');
  const reg = read('docs/ASSET_LICENSES.md');
  const imgs = readdirSync(dir).filter((f) => /\.(png|jpe?g|webp|svg|gif)$/i.test(f));
  for (const f of imgs) assert.ok(reg.includes(f), `immagine senza licenza registrata: ${f}`);
});

test('sotto /ALE/: shell servita, fuori dal sottopercorso 404', async () => {
  const server = await startServer({ port: 0 });
  const { port } = server.address();
  const get = (p) => fetch(`http://127.0.0.1:${port}${p}`);
  try {
    for (const p of [
      '/ALE/', '/ALE/index.html', '/ALE/sw.js', '/ALE/manifest.webmanifest', '/ALE/404.html',
      '/ALE/css/tokens.css', '/ALE/css/base.css', '/ALE/js/main.js', '/ALE/js/config.js',
      '/ALE/js/core/theme.js', '/ALE/js/core/theme-init.js', '/ALE/assets/icons/icon-192.png',
      '/ALE/assets/icons/icon-512.png', '/ALE/assets/icons/icon-maskable-512.png', '/ALE/assets/icons/apple-touch-icon.png',
    ]) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
    }
    assert.equal((await get('/ALE/manifest.webmanifest')).headers.get('content-type'), 'application/manifest+json');
    for (const p of ['/', '/index.html', '/css/base.css', '/ALE/../package.json', '/ALE/supabase/config.toml', '/ALE/.gitignore']) {
      assert.equal((await get(p)).status, 404, p);
    }
  } finally {
    server.close();
  }
});
